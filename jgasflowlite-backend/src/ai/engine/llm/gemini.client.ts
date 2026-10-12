/**
 * Google Gemini adapter — the ONLY file in the engine that knows Gemini exists.
 *
 * Talks to the Generative Language REST API directly over axios (already a
 * dependency) rather than pulling in an SDK: the request is four keys wide, and
 * owning the wire shape is what lets us handle the awkward parts below.
 *
 * WHAT GEMINI DOES DIFFERENTLY, AND HOW THIS FILE ABSORBS IT
 *
 *  1. No tool-call ids. A `functionCall` carries a name and nothing else, and
 *     results are matched back by NAME and POSITION. So every result for one
 *     assistant turn must go back in ONE content block, in call order. Our
 *     neutral ids exist for other providers and are dropped here.
 *
 *  2. Its schema dialect is an OpenAPI 3 subset, not JSON Schema. Sending
 *     `additionalProperties`, `$schema` or `minimum` is a 400, and `type` is a
 *     protobuf enum, so it must be UPPERCASE. `toGeminiSchema` handles both.
 *
 *  3. Thinking models return `thought` parts carrying a `thoughtSignature`.
 *     Those parts must be echoed back byte-identical on the next turn or the
 *     model loses its chain of reasoning mid-run, and they must be kept OUT of
 *     the text shown to the user. Hence the `raw` replay in agent.types.
 *
 *  4. Roles are `user` and `model` (never `assistant`), and a function result
 *     is a `user` turn carrying `functionResponse` parts.
 *
 * CONFIG comes from AiSettingsService: the admin panel's saved values, falling
 * back to `.env`. The key, model, output cap and thinking budget are all
 * settable from the panel — the BASE URL deliberately is not, because every
 * prompt carries clinic data and a settable endpoint would be an exfiltration
 * channel disguised as a setting.
 *
 *   GEMINI_API_KEY          fallback when the panel has no key
 *   GEMINI_MODEL            fallback model, default gemini-2.5-flash
 *   GEMINI_API_URL          env only. default https://generativelanguage.googleapis.com/v1beta
 *   GEMINI_TIMEOUT_MS       env only. default 60000
 *   GEMINI_MAX_OUTPUT_TOKENS / GEMINI_THINKING_BUDGET  fallbacks for the panel
 */

import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosError } from 'axios';
import { AiSettingsService } from '../ai-settings.service';
import {
  AgentToolCall,
  AgentToolDefinition,
  AgentTurn,
  LlmClient,
  LlmError,
  LlmResponse,
  LlmModelInfo,
  LlmSendOptions,
  LlmStopReason,
  LlmVerifyResult,
} from '../agent.types';

export const GEMINI_PROVIDER = 'gemini';

const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_MODEL = 'gemini-2.5-flash';
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_OUTPUT_TOKENS = 2048;

/** Finish reasons that mean "the model declined" — never retry these. */
const REFUSAL_REASONS = new Set([
  'SAFETY',
  'BLOCKLIST',
  'PROHIBITED_CONTENT',
  'SPII',
  'RECITATION',
  'IMAGE_SAFETY',
]);

@Injectable()
export class GeminiClient implements LlmClient {
  readonly provider = GEMINI_PROVIDER;
  private readonly logger = new Logger(GeminiClient.name);

  constructor(private readonly settings: AiSettingsService) {}

  /** Display only — the snapshot, which may be up to 30s behind a save. */
  get model(): string {
    return this.settings.snapshot().model || DEFAULT_MODEL;
  }

  /** Gate only. `send` re-reads the settings and awaits them properly. */
  isConfigured(): boolean {
    return !!this.settings.snapshot().api_key;
  }

  /** Not settable from the panel — see the note at the top of this file. */
  private get baseUrl(): string {
    return (process.env.GEMINI_API_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
  }

  async send(options: LlmSendOptions): Promise<LlmResponse> {
    // The one path that spends money always reads fresh settings.
    const config = await this.settings.resolve();
    if (!config.api_key) {
      throw new LlmError('No AI provider key is configured', 500, false);
    }

    const body: Record<string, any> = {
      systemInstruction: { parts: [{ text: options.system }] },
      contents: toGeminiContents(options.turns),
      generationConfig: {
        // Deterministic: this agent reports figures, it does not brainstorm.
        temperature: 0,
        candidateCount: 1,
        maxOutputTokens: config.max_output_tokens || DEFAULT_MAX_OUTPUT_TOKENS,
      },
      // Clinical records legitimately discuss medication, extractions and
      // medical history. The default thresholds treat some of that as unsafe,
      // so a professional records assistant would refuse at random; only
      // high-confidence harm is blocked.
      safetySettings: [
        'HARM_CATEGORY_HARASSMENT',
        'HARM_CATEGORY_HATE_SPEECH',
        'HARM_CATEGORY_SEXUALLY_EXPLICIT',
        'HARM_CATEGORY_DANGEROUS_CONTENT',
      ].map((category) => ({ category, threshold: 'BLOCK_ONLY_HIGH' })),
    };

    // Only sent when set: a model with no thinking mode rejects the field.
    if (config.thinking_budget !== null) {
      body.generationConfig.thinkingConfig = { thinkingBudget: config.thinking_budget };
    }

    if (options.tools.length) {
      body.tools = [{ functionDeclarations: options.tools.map(toFunctionDeclaration) }];
      body.toolConfig = { functionCallingConfig: { mode: 'AUTO' } };
    }

    const data = await this.post(body, config.api_key, config.model);
    return this.parse(data, config.model);
  }

  // ─────────────────────── settings screen ───────────────────────

  /**
   * Models this key can actually use, straight from the provider.
   *
   * A live list beats a hard-coded dropdown that goes stale the week Google
   * ships a new model, and beats a free-text box where a typo only surfaces as
   * a 404 on someone's first question. Filtered to the models that support
   * generateContent — embedding and vision-only models are not answers here.
   */
  async listModels(apiKey?: string): Promise<LlmModelInfo[]> {
    const key = (apiKey || (await this.settings.resolve()).api_key || '').trim();
    if (!key) throw new LlmError('No API key to list models with', 400, false);

    try {
      const res = await axios.get(`${this.baseUrl}/models`, {
        timeout: 20_000,
        params: { pageSize: 200 },
        headers: { 'x-goog-api-key': key },
      });
      const models: any[] = res.data?.models ?? [];
      return models
        .filter((m) => (m?.supportedGenerationMethods ?? []).includes('generateContent'))
        .map((m) => ({
          // "models/gemini-2.5-flash" → "gemini-2.5-flash"
          id: String(m.name ?? '').replace(/^models\//, ''),
          label: m.displayName || String(m.name ?? '').replace(/^models\//, ''),
          description: m.description,
          input_token_limit: m.inputTokenLimit,
          output_token_limit: m.outputTokenLimit,
        }))
        .filter((m) => m.id)
        .sort((a, b) => a.id.localeCompare(b.id));
    } catch (err) {
      throw this.asLlmError(err);
    }
  }

  /**
   * The cheapest possible real call, to prove a key and model work together.
   *
   * Never throws: a failed test is an ANSWER for the settings screen, not an
   * exception. The message is the provider's own, which is what tells an admin
   * whether the key is wrong, the model name is wrong, or billing is not on.
   */
  async verify(apiKey?: string, model?: string): Promise<LlmVerifyResult> {
    const config = await this.settings.resolve();
    const key = (apiKey || config.api_key || '').trim();
    const target = (model || config.model || DEFAULT_MODEL).trim();
    const startedAt = Date.now();

    if (!key) {
      return { ok: false, model: target, latency_ms: 0, error: 'No API key was provided.' };
    }

    try {
      const url = `${this.baseUrl}/models/${encodeURIComponent(target)}:generateContent`;
      await axios.post(
        url,
        {
          contents: [{ role: 'user', parts: [{ text: 'Reply with the single word: ok' }] }],
          generationConfig: { temperature: 0, maxOutputTokens: 8 },
        },
        {
          timeout: 25_000,
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        },
      );
      return { ok: true, model: target, latency_ms: Date.now() - startedAt };
    } catch (err) {
      const e = this.asLlmError(err);
      return { ok: false, model: target, latency_ms: Date.now() - startedAt, error: e.message };
    }
  }

  /** Provider errors, reduced to something an admin can act on. */
  private asLlmError(err: unknown): LlmError {
    const e = err as AxiosError<any>;
    const status = e.response?.status;
    const detail = e.response?.data?.error?.message ?? e.message ?? 'unknown error';
    this.logger.warn(`Gemini settings call failed (${status ?? e.code}): ${detail}`);

    if (status === 400) return new LlmError(`Rejected: ${detail}`, status, false);
    if (status === 401 || status === 403) {
      return new LlmError(
        'The API key was rejected. Check the key, and that the Generative Language API is enabled for it.',
        status,
        false,
      );
    }
    if (status === 404) {
      return new LlmError('That model does not exist for this key.', status, false);
    }
    if (status === 429) return new LlmError('Rate limited — try again shortly.', status, true);
    return new LlmError(`Could not reach the AI service (${status ?? e.code}).`, status, true);
  }

  // ─────────────────────── transport ───────────────────────

  /**
   * One retry, and only for the two statuses that are genuinely transient.
   * A 400 is our bug and a 403 is a bad key — retrying either just burns the
   * wall-clock budget before failing the same way.
   */
  private async post(body: unknown, apiKey: string, model: string): Promise<any> {
    const url = `${this.baseUrl}/models/${encodeURIComponent(model)}:generateContent`;
    const timeout = intEnv('GEMINI_TIMEOUT_MS', DEFAULT_TIMEOUT_MS);

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await axios.post(url, body, {
          timeout,
          headers: {
            'Content-Type': 'application/json',
            // Header, not ?key= — a query string lands in access logs.
            'x-goog-api-key': apiKey,
          },
        });
        return res.data;
      } catch (err) {
        const e = err as AxiosError<any>;
        const status = e.response?.status;
        const detail =
          e.response?.data?.error?.message ?? e.message ?? 'unknown error';

        const transient = status === 429 || status === 503 || e.code === 'ECONNRESET';
        if (transient && attempt === 0) {
          this.logger.warn(`Gemini ${status ?? e.code} — retrying once: ${detail}`);
          await sleep(750 + Math.floor(Math.random() * 500));
          continue;
        }

        this.logger.error(`Gemini call failed (${status ?? e.code}): ${detail}`);

        if (status === 401 || status === 403) {
          throw new LlmError('The AI service rejected the configured API key', status, false);
        }
        if (status === 429) {
          throw new LlmError('The AI service is rate limited right now', status, true);
        }
        if (status === 400) {
          // Our request shape is wrong — keep the provider's message for the log.
          throw new LlmError(`The AI service rejected the request: ${detail}`, status, false);
        }
        throw new LlmError(`The AI service is unavailable (${status ?? e.code})`, status, true);
      }
    }
    throw new LlmError('The AI service is unavailable', undefined, true);
  }

  // ─────────────────────── response ───────────────────────

  private parse(data: any, model: string): LlmResponse {
    const usage = {
      input_tokens: Number(data?.usageMetadata?.promptTokenCount ?? 0),
      output_tokens: Number(data?.usageMetadata?.candidatesTokenCount ?? 0),
      total_tokens: Number(data?.usageMetadata?.totalTokenCount ?? 0),
    };

    // A blocked PROMPT has no candidate at all.
    const blockReason = data?.promptFeedback?.blockReason;
    if (blockReason) {
      return {
        text: '',
        tool_calls: [],
        usage,
        stop_reason: 'refusal',
        provider: this.provider,
        model,
      };
    }

    const candidate = data?.candidates?.[0];
    const parts: any[] = Array.isArray(candidate?.content?.parts)
      ? candidate.content.parts
      : [];
    const finish = String(candidate?.finishReason ?? '');

    // `thought` parts are the model's private reasoning: they go back to Gemini
    // verbatim via `raw`, but they are not an answer and must never be shown.
    const text = parts
      .filter((p) => typeof p?.text === 'string' && p?.thought !== true)
      .map((p) => p.text)
      .join('')
      .trim();

    const tool_calls: AgentToolCall[] = parts
      .filter((p) => p?.functionCall?.name)
      .map((p, i) => ({
        id: `${p.functionCall.name}_${i}`,
        name: String(p.functionCall.name),
        input: isPlainObject(p.functionCall.args) ? p.functionCall.args : {},
      }));

    let stop_reason: LlmStopReason;
    if (REFUSAL_REASONS.has(finish)) stop_reason = 'refusal';
    else if (tool_calls.length) stop_reason = 'tool_use';
    else if (finish === 'MAX_TOKENS') stop_reason = 'max_tokens';
    else if (finish === 'STOP') stop_reason = 'stop';
    else stop_reason = 'other';

    return {
      text,
      tool_calls,
      usage,
      stop_reason,
      provider: this.provider,
      model,
      raw: parts.length ? parts : undefined,
    };
  }
}

// ─────────────────────── conversation mapping ───────────────────────

/**
 * Neutral turns → Gemini `contents`.
 *
 * Consecutive tool turns are merged into ONE content block: Gemini pairs a
 * `functionResponse` to its `functionCall` by name and order, so splitting them
 * across blocks (or reordering them) silently mismatches the results when the
 * same tool was called twice in a turn.
 */
export function toGeminiContents(turns: AgentTurn[]): any[] {
  const contents: any[] = [];
  let pendingResponses: any[] = [];

  const flush = () => {
    if (pendingResponses.length) {
      contents.push({ role: 'user', parts: pendingResponses });
      pendingResponses = [];
    }
  };

  for (const turn of turns) {
    if (turn.role === 'tool') {
      pendingResponses.push({
        functionResponse: {
          name: turn.name,
          response: toResponseStruct(turn.content),
        },
      });
      continue;
    }

    flush();

    if (turn.role === 'user') {
      if (turn.text) contents.push({ role: 'user', parts: [{ text: turn.text }] });
      continue;
    }

    // assistant → Gemini calls it "model"
    if (turn.provider === GEMINI_PROVIDER && Array.isArray(turn.raw) && turn.raw.length) {
      // Byte-identical replay, thought signatures included.
      contents.push({ role: 'model', parts: turn.raw });
      continue;
    }

    const parts: any[] = [];
    if (turn.text) parts.push({ text: turn.text });
    for (const call of turn.tool_calls ?? []) {
      parts.push({ functionCall: { name: call.name, args: call.input ?? {} } });
    }
    if (parts.length) contents.push({ role: 'model', parts });
  }

  flush();
  return contents;
}

/**
 * `functionResponse.response` must be a JSON object (a protobuf Struct), so a
 * top-level array or scalar has to be wrapped rather than sent as-is.
 */
function toResponseStruct(content: string | undefined): Record<string, any> {
  if (!content) return { result: null };
  try {
    const parsed = JSON.parse(content);
    return isPlainObject(parsed) ? parsed : { result: parsed };
  } catch {
    return { result: content };
  }
}

// ─────────────────────── schema mapping ───────────────────────

function toFunctionDeclaration(tool: AgentToolDefinition) {
  const declaration: Record<string, any> = {
    name: tool.name,
    description: tool.description,
  };
  // A tool that takes nothing must omit `parameters` entirely — an empty
  // properties object is rejected.
  const params = toGeminiSchema(tool.input_schema);
  if (params?.properties && Object.keys(params.properties).length) {
    declaration.parameters = params;
  }
  return declaration;
}

/** protobuf enum names — lowercase JSON Schema types are not accepted. */
const TYPE_MAP: Record<string, string> = {
  string: 'STRING',
  number: 'NUMBER',
  integer: 'INTEGER',
  boolean: 'BOOLEAN',
  array: 'ARRAY',
  object: 'OBJECT',
};

/**
 * Only these keys survive. The dialect is an OpenAPI 3 subset, and anything
 * outside it — `additionalProperties`, `$schema`, `minimum`, `default`,
 * `oneOf`, `format: 'date'` — is a 400 rather than a warning.
 *
 * Dropping range and format constraints costs nothing: the host's own DTO
 * validation still rejects a bad value, and its message goes back to the model
 * as an instructive error it can fix on the next turn.
 */
export function toGeminiSchema(schema: any): any {
  if (!isPlainObject(schema)) return undefined;

  const out: Record<string, any> = {};

  const type = typeof schema.type === 'string' ? TYPE_MAP[schema.type] : undefined;
  if (type) out.type = type;
  if (typeof schema.description === 'string') out.description = schema.description;
  if (Array.isArray(schema.enum) && schema.enum.length) {
    out.enum = schema.enum.map(String);
    // Gemini only honours `enum` on a STRING.
    out.type = 'STRING';
  }
  if (schema.nullable === true) out.nullable = true;

  if (out.type === 'OBJECT' || isPlainObject(schema.properties)) {
    out.type = 'OBJECT';
    out.properties = {};
    for (const [key, value] of Object.entries(schema.properties ?? {})) {
      const child = toGeminiSchema(value);
      if (child) out.properties[key] = child;
    }
    const required = (schema.required ?? []).filter((k: string) => k in out.properties);
    if (required.length) out.required = required;
  }

  if (out.type === 'ARRAY') {
    out.items = toGeminiSchema(schema.items) ?? { type: 'STRING' };
  }

  return out;
}

// ─────────────────────── small helpers ───────────────────────

const isPlainObject = (v: unknown): v is Record<string, any> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function intEnv(key: string, fallback: number): number {
  const n = Number(process.env[key]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

/**
 * Real-time voice, bridged through us — never straight from the browser.
 *
 * The Gemini Live API is a WebSocket carrying native audio both ways, with the
 * model doing its own turn detection and barge-in. It is a genuinely better
 * conversation than record → transcribe → think → synthesize.
 *
 * WHY THE BROWSER DOES NOT TALK TO GOOGLE DIRECTLY, even though Google offers
 * ephemeral tokens for exactly that:
 *
 *   The Live API runs its OWN loop and emits `toolCall` messages to whoever is
 *   on the socket. Whoever answers those is executing tools. If that is the
 *   browser, then AgentGuard — the permission check, the policy vetoes, the
 *   confirmation gate, the audit row, the 64 KB result cap — is no longer in
 *   the loop at all. Ephemeral tokens solve key exposure; they do not solve
 *   that. The guard being the ONLY path to a tool is the reason any of this is
 *   safe to point at production, and a nicer microphone is not worth trading
 *   it for.
 *
 *   Proxied, the shape is unchanged: Google asks for a tool, WE dispatch it
 *   through the same guard the typed chat uses, and send the result back.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO: persist turns. A live session is audio;
 * the transcripts Google returns are recorded in the audit row at the end, but
 * the conversation store stays the typed chat's. Mixing the two would mean
 * replaying audio-shaped turns into a text completion later.
 */

import { Injectable, Logger } from '@nestjs/common';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { WebSocket, WebSocketServer } from 'ws';
import type { IncomingMessage, Server } from 'http';
import { AiSettingsService } from '../ai-settings.service';
import { devanagariToUrdu } from '../urdu-script';
import { AgentGuard } from '../agent-guard.service';
import { AgentAuditService } from '../agent-audit.service';
import {
  AgentOwner,
  AgentPolicy,
  AgentPrincipal,
  AgentToolDefinition,
  DispatchOutcome,
  RegisteredTool,
  ToolLogEntry,
  emptyUsage,
} from '../agent.types';
import { encodeToolResult } from '../tool-result';
import { toGeminiSchema } from '../llm/gemini.client';

const LIVE_PATH = '/ws/ai/live';
const DEFAULT_LIVE_MODEL = 'gemini-3.8-live';
const DEFAULT_LIVE_URL =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';

/**
 * A browser cannot set an Authorization header on a WebSocket, and a JWT in a
 * query string ends up in access logs. So the client first makes an ordinary
 * authenticated POST for a one-time ticket, and spends it on the socket —
 * the same reason admin impersonation uses a code rather than a token.
 */
const TICKET_TTL_MS = 60_000;

/** Han, kana and hangul. */
const CJK =
  /[぀-ヿ㐀-䶿一-鿿가-힯豈-﫿]/g;

/**
 * One gate for every transcript chunk, in both directions.
 *
 * Returns the text to show, or null to drop the chunk. Both paths went
 * through it from the start rather than one calling the guard and the other
 * the transliteration, because a chunk that skipped either is a chunk the
 * person cannot read.
 */
function readable(raw: string): string | null {
  if (isImpossibleScript(raw)) return null;
  return devanagariToUrdu(raw);
}

/**
 * Gemini transcribing its own speech into a script that cannot be right.
 *
 * It has been seen dropping Han characters into the middle of an answer for a
 * Pakistani dental platform, where Chinese is never a possible output. The
 * prompt tells it not to; this is the belt, because a panel showing two words
 * of Chinese reads as broken software rather than as a dropped syllable.
 *
 * Deliberately narrow. Only a chunk that is at least half CJK is dropped, so
 * a stray character inside a real sentence still comes through, and Urdu,
 * Arabic, Roman Urdu and English are untouched — the scripts this product
 * actually speaks must never be filtered by a heuristic.
 */
export function isImpossibleScript(text: string): boolean {
  const dense = text.replace(/\s/g, '');
  if (!dense) return false;
  const cjk = dense.match(CJK)?.length ?? 0;
  return cjk > 0 && cjk * 2 >= dense.length;
}

/** What the host must supply per session. It knows nothing about clinics. */
export interface LiveSessionContext {
  principal: AgentPrincipal;
  owner: AgentOwner;
  /** Already scoped and persona-filtered by the host. */
  tools: RegisteredTool[];
  policies: AgentPolicy[];
  /** System prompt — the same three layers the typed chat builds. */
  instructions: string;
  /** For the audit row. */
  label: string;
  /** Gemini Live prebuilt voice. Blank leaves the model's default. */
  voice?: string;
  /**
   * Who else the user could be handed to. Declared to the model as a tool, so
   * IT decides when a handover was asked for.
   */
  colleagues?: Array<{ key: string; name: string; role: string }>;

}

/**
 * The one tool the bridge answers itself rather than passing to the guard.
 *
 * Reserved: a registry tool may never take this name, or a handover would
 * execute a lookup instead.
 */
export const SWITCH_TOOL = 'switch_agent';


/** Reserved for the same reason: a registry tool must never shadow it. */
export const CLOSE_TOOL = 'end_conversation';

/**
 * Reserved too. This one works the SCREEN rather than the conversation:
 * clearing the log, dismissing the cards, changing the language. It is
 * handled here beside the other two rather than through the guard for the
 * same reason they are — it reads no record and changes no record, so
 * there is nothing for a permission or a policy to be about. The guard
 * stays the only path to anything that touches data.
 */
export const SCREEN_TOOL = 'control_screen';

type ContextFactory = (
  ticket: DecodedTicket,
) => Promise<LiveSessionContext | null>;

export interface DecodedTicket {
  user_id: number;
  scope: string;
  persona?: string;
  /** The conversation language, fixed at setup like everything else here. */
  language?: string;
}

@Injectable()
export class LiveBridgeService {
  private readonly logger = new Logger(LiveBridgeService.name);
  private wss: WebSocketServer | null = null;
  private factory: ContextFactory | null = null;

  /**
   * Random per boot, like the confirmation secret. A restart invalidating a
   * 60-second ticket costs nothing; set AI_LIVE_SECRET before running more
   * than one API instance, or a ticket minted on one will not open a socket
   * on another.
   */
  private readonly ticketSecret =
    process.env.AI_LIVE_SECRET?.trim() ||
    process.env.AI_CONFIRM_SECRET?.trim() ||
    randomBytes(32).toString('hex');

  constructor(
    private readonly settings: AiSettingsService,
    private readonly guard: AgentGuard,
    private readonly audit: AgentAuditService,
  ) {}

  /** True when a key exists and an admin has switched live mode on. */
  isEnabled(): boolean {
    const s = this.settings.snapshot();
    return !!s.api_key && s.live_enabled;
  }

  liveModel(): string {
    return this.settings.snapshot().live_model || DEFAULT_LIVE_MODEL;
  }

  // ─────────────────────── tickets ───────────────────────

  mintTicket(data: DecodedTicket): string {
    const expiresAt = Date.now() + TICKET_TTL_MS;
    const body = Buffer.from(
      JSON.stringify({ ...data, exp: expiresAt }),
      'utf8',
    ).toString('base64url');
    return `${body}.${this.sign(body)}`;
  }

  private sign(body: string): string {
    return createHmac('sha256', this.ticketSecret).update(body).digest('base64url');
  }

  private verifyTicket(raw: string | undefined): DecodedTicket | null {
    if (!raw) return null;
    const split = raw.lastIndexOf('.');
    if (split <= 0) return null;

    const body = raw.slice(0, split);
    const mac = raw.slice(split + 1);
    const expected = this.sign(body);
    if (mac.length !== expected.length) return null;
    if (!timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;

    try {
      const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
      if (!parsed?.exp || parsed.exp < Date.now()) return null;
      return { user_id: Number(parsed.user_id), scope: parsed.scope, persona: parsed.persona, language: parsed.language };
    } catch {
      return null;
    }
  }

  // ─────────────────────── the socket ───────────────────────

  /**
   * Attached to the existing HTTP server rather than run on its own port, so
   * it inherits the TLS, the host and the firewall rules the API already has.
   */
  attach(server: Server, factory: ContextFactory): void {
    if (this.wss) return;
    this.factory = factory;
    this.wss = new WebSocketServer({ noServer: true });

    server.on('upgrade', (req, socket, head) => {
      const url = new URL(req.url ?? '', 'http://localhost');
      if (url.pathname !== LIVE_PATH) return; // not ours; leave it alone

      const ticket = this.verifyTicket(url.searchParams.get('ticket') ?? undefined);
      if (!ticket) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }
      this.wss!.handleUpgrade(req, socket as any, head, (client) => {
        void this.open(client, ticket, req);
      });
    });

    this.logger.log(`Live voice bridge listening on ${LIVE_PATH}`);
  }

  private async open(client: WebSocket, ticket: DecodedTicket, _req: IncomingMessage) {
    const config = await this.settings.resolve();
    if (!config.api_key || !config.live_enabled) {
      return this.bye(client, 'Live voice is not enabled.');
    }

    const context = await this.factory?.(ticket).catch(() => null);
    if (!context) return this.bye(client, 'That session could not be authorised.');

    const model = config.live_model || DEFAULT_LIVE_MODEL;
    const url = `${(process.env.GEMINI_LIVE_URL || DEFAULT_LIVE_URL)}?key=${encodeURIComponent(config.api_key)}`;

    const upstream = new WebSocket(url);
    const startedAt = Date.now();
    const toolLog: ToolLogEntry[] = [];
    const transcript: string[] = [];
    let closed = false;

    const shutdown = (reason?: string) => {
      if (closed) return;
      closed = true;
      if (reason) this.send(client, { type: 'error', message: reason });
      try { upstream.close(); } catch { /* already gone */ }
      try { client.close(); } catch { /* already gone */ }

      // One audit row per session, same table as every typed run.
      void this.audit.record({
        owner: context.owner,
        user_name: context.principal.display_name,
        conversation_id: null,
        question: `[live voice] ${transcript.slice(0, 6).join(' / ') || context.label}`,
        result: {
          answer: transcript.join('\n').slice(0, 4000),
          stop: 'answered',
          turns: [],
          awaiting_confirmation: [],
          usage: emptyUsage(),
          turns_used: toolLog.length,
          duration_ms: Date.now() - startedAt,
          tool_log: toolLog,
          model,
        },
      });
    };

    const declarations = [
      ...context.tools.map(toDeclaration),
      ...(context.colleagues?.length ? [switchDeclaration(context.colleagues)] : []),
      screenDeclaration(),
      closeDeclaration(),
    ];

    upstream.on('open', () => {
      // Declarations are set once, at session start — the Live API has no way
      // to add a tool mid-session.
      upstream.send(
        JSON.stringify({
          setup: {
            model: `models/${model}`,
            systemInstruction: { parts: [{ text: context.instructions }] },
            // Omitted entirely when there is nothing to declare: an empty
            // functionDeclarations array is not a valid setup.
            ...(declarations.length ? { tools: [{ functionDeclarations: declarations }] } : {}),
            generationConfig: {
              responseModalities: ['AUDIO'],
              ...(context.voice
                ? {
                    speechConfig: {
                      voiceConfig: { prebuiltVoiceConfig: { voiceName: context.voice } },
                    },
                  }
                : {}),
            },
            // Without this the session dies at the 15-minute audio limit.
            contextWindowCompression: { slidingWindow: {} },
            inputAudioTranscription: {},
            outputAudioTranscription: {},
          },
        }),
      );
      this.send(client, { type: 'ready', model });
    });

    upstream.on('message', async (raw) => {
      let msg: any;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return; // binary frames are not part of this protocol
      }

      // Audio and text back to the browser, untouched.
      const parts = msg?.serverContent?.modelTurn?.parts ?? [];
      for (const part of parts) {
        if (part?.inlineData?.data) {
          this.send(client, { type: 'audio', data: part.inlineData.data });
        }
      }
      if (msg?.serverContent?.outputTranscription?.text) {
        const text = readable(msg.serverContent.outputTranscription.text);
        if (text !== null) {
          transcript.push(text);
          this.send(client, { type: 'said', role: 'assistant', text });
        }
      }
      if (msg?.serverContent?.inputTranscription?.text) {
        // The user's OWN words, and the ones most likely to come back in the
        // wrong script: the recogniser labels Urdu as Hindi and writes
        // Devanagari, which the person who just spoke may not read at all.
        const text = readable(msg.serverContent.inputTranscription.text);
        if (text !== null) {
          this.send(client, { type: 'said', role: 'user', text });
        }
      }
      // Barge-in: the model stopped because the human started talking.
      if (msg?.serverContent?.interrupted) {
        this.send(client, { type: 'interrupted' });
      }
      if (msg?.serverContent?.turnComplete) {
        this.send(client, { type: 'turn_complete' });
      }

      // THE IMPORTANT PART: tool calls come to US, and go through the guard.
      const calls = msg?.toolCall?.functionCalls;
      if (Array.isArray(calls) && calls.length) {
        /**
         * Tell the browser something is happening.
         *
         * On the live path the model's loop runs HERE, not in the page, so
         * the browser has no way of knowing a tool is running: audio simply
         * stops arriving for a few seconds. That silence is the one moment
         * the screen most needs to look busy, and it was the one moment it
         * looked idle.
         *
         * Named tools only. A handover or a close is instant and announcing
         * work for it would flicker.
         */
        const realWork = calls
          .map((c: any) => String(c?.name ?? ''))
          .filter(
            (name) => name && name !== SWITCH_TOOL && name !== CLOSE_TOOL && name !== SCREEN_TOOL,
          );
        if (realWork.length) {
          this.send(client, { type: 'working', tools: realWork });
        }

        const responses = await Promise.all(
          calls.map(async (call: any) => {
            /**
             * A handover is the bridge's own business, not the guard's: it
             * reads nothing and changes nothing, it just tells the browser to
             * reconnect as someone else. Letting the MODEL decide this is the
             * point — it understands "I want to talk to Ayesha" in any
             * phrasing and any language, which a regular expression cannot.
             */
            /**
              * Ending the call is the bridge's business too. The browser is
              * told to close AFTER any goodbye still playing has finished —
              * cutting the model off mid-sentence to obey it is worse than
              * waiting half a second.
              */
            if (call?.name === CLOSE_TOOL) {
              this.send(client, { type: 'close' });
              toolLog.push({
                name: CLOSE_TOOL,
                input: call?.args ?? {},
                outcome: 'executed',
                ms: 0,
              });
              return { id: call?.id, name: CLOSE_TOOL, response: { ok: true } };
            }

            if (call?.name === SCREEN_TOOL) {
              const action = String(call?.args?.action ?? '');
              const language = String(call?.args?.language ?? '');
              const known = ['clear_log', 'hide_cards', 'set_language'];
              if (!known.includes(action)) {
                return {
                  id: call?.id,
                  name: SCREEN_TOOL,
                  response: { error: `There is nothing called "${action}" on this screen.` },
                };
              }
              // A language is only meaningful for set_language, and only
              // these two exist; anything else would reach the browser and
              // be acted on as if the model had named a real one.
              if (action === 'set_language' && !['ur', 'en'].includes(language)) {
                return {
                  id: call?.id,
                  name: SCREEN_TOOL,
                  response: { error: 'Language must be ur or en.' },
                };
              }
              this.send(client, { type: 'screen', action, language: language || null });
              toolLog.push({
                name: SCREEN_TOOL,
                input: call?.args ?? {},
                outcome: 'executed',
                ms: 0,
              });
              return {
                id: call?.id,
                name: SCREEN_TOOL,
                response: { ok: true, action },
              };
            }

            if (call?.name === SWITCH_TOOL) {
              const wanted = String(call?.args?.agent ?? '');
              const target = context.colleagues?.find((c) => c.key === wanted);
              if (!target) {
                return {
                  id: call?.id,
                  name: SWITCH_TOOL,
                  response: { error: `There is no colleague called "${wanted}".` },
                };
              }
              this.send(client, {
                type: 'switch',
                persona: target.key,
                question: typeof call?.args?.question === 'string' ? call.args.question : null,
              });
              toolLog.push({
                name: SWITCH_TOOL,
                input: call?.args ?? {},
                outcome: 'executed',
                ms: 0,
              });
              // The socket is about to be replaced, so this only has to be
              // valid enough that the model does not retry.
              return {
                id: call?.id,
                name: SWITCH_TOOL,
                response: { ok: true, handed_over_to: target.name },
              };
            }
            return this.runTool(call, context, toolLog);
          }),
        );
        upstream.send(JSON.stringify({ toolResponse: { functionResponses: responses } }));

        // Work is over, whatever the outcome was. A refusal or a failure is
        // still the end of the wait, and leaving the page in its working
        // state after one would strand it there until the next turn.
        if (realWork.length) this.send(client, { type: 'working', tools: [] });
      }
    });

    upstream.on('error', (err) => {
      this.logger.error(`Live upstream failed: ${(err as Error).message}`);
      shutdown('The live voice service could not be reached.');
    });
    upstream.on('close', () => shutdown());

    client.on('message', (raw) => {
      // The browser sends only two things: microphone chunks and a hang-up.
      let msg: any;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (upstream.readyState !== WebSocket.OPEN) return;

      if (msg?.type === 'audio' && typeof msg.data === 'string') {
        upstream.send(
          JSON.stringify({
            realtimeInput: {
              audio: { mimeType: 'audio/pcm;rate=16000', data: msg.data },
            },
          }),
        );
      } else if (msg?.type === 'text' && typeof msg.text === 'string') {
        upstream.send(
          JSON.stringify({
            clientContent: {
              turns: [{ role: 'user', parts: [{ text: msg.text }] }],
              turnComplete: true,
            },
          }),
        );
      } else if (msg?.type === 'bye') {
        shutdown();
      }
    });

    client.on('error', () => shutdown());
    client.on('close', () => shutdown());
  }

  /**
   * One tool call, through the same guard the typed chat uses.
   *
   * A live session has no confirmation round trip — there is nobody to click a
   * button mid-sentence — so a write that needs approval comes back as a
   * refusal the model can speak aloud, and the admin does it in the chat. The
   * platform agent has no write tools today, so this is a guard rail for the
   * day one is added rather than a live path.
   */
  private async runTool(
    call: any,
    context: LiveSessionContext,
    log: ToolLogEntry[],
  ): Promise<any> {
    const name = String(call?.name ?? '');
    const args = isObject(call?.args) ? call.args : {};
    const at = Date.now();

    const result = await this.guard.dispatch(
      { id: String(call?.id ?? name), name, input: args },
      {
        ctx: { principal: context.principal },
        policies: context.policies,
        // Nothing is pre-approved in a live session.
        conversation_ref: `live:${context.owner.scope}:${context.owner.user_id}`,
        approved_tokens: new Set<string>(),
        available: new Set(context.tools.map((t) => t.name)),
      },
    );

    log.push({
      name,
      input: args,
      outcome: result.outcome as DispatchOutcome,
      ms: Date.now() - at,
      detail: result.error_detail,
    });

    // The same 64 KB cap and truncation notice as everywhere else — a live
    // session has less room for a firehose, not more.
    const encoded = encodeToolResult(result.payload);
    let response: any;
    try {
      const parsed = JSON.parse(encoded);
      response = isObject(parsed) ? parsed : { result: parsed };
    } catch {
      response = { result: encoded };
    }

    return { id: call?.id, name, response };
  }

  private send(client: WebSocket, payload: unknown) {
    if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(payload));
  }

  private bye(client: WebSocket, message: string) {
    this.send(client, { type: 'error', message });
    try { client.close(); } catch { /* already gone */ }
  }
}

/**
 * The handover tool, built from the live roster so the enum can never name
 * someone who does not exist.
 */
function switchDeclaration(colleagues: Array<{ key: string; name: string; role: string }>) {
  const who = colleagues.map((c) => `${c.key} = ${c.name}, ${c.role}`).join('; ');
  return {
    name: SWITCH_TOOL,
    description:
      'Hand the conversation to a colleague. Call this the moment the user asks for ' +
      'someone else by name or by role, however they phrase it — "I want to talk to ' +
      'Ayesha", "put me through to Bilal", "hello Sana", "let me speak to whoever ' +
      'handles billing". Call it INSTEAD of replying that you will hand over: saying ' +
      'so does nothing, calling this is what actually moves them. If they also asked ' +
      'a question, pass it in `question` so the colleague can answer it directly. ' +
      `The colleagues are: ${who}.`,
    parameters: {
      type: 'OBJECT',
      properties: {
        agent: {
          type: 'STRING',
          description: 'Which colleague to hand over to.',
          enum: colleagues.map((c) => c.key),
        },
        question: {
          type: 'STRING',
          description: 'What the user wanted to know, if they asked as well as switching.',
        },
      },
      required: ['agent'],
    },
  };
}

/**
 * Ending the conversation, on request.
 *
 * Same reasoning as the handover: saying "goodbye" does not close anything,
 * and a keyword list would miss "that's all", "we're done", "band karo".
 */
function screenDeclaration() {
  return {
    name: SCREEN_TOOL,
    description:
      'Work the screen for the user. Call this when they ask you to tidy it up or change ' +
      'it, in any words and any language: "clear the log", "log saaf karo", "hide those ' +
      'cards", "get rid of that", "close the panels", "switch to English", "urdu mein ' +
      'baat karo". Do it rather than describing how they could do it themselves. ' +
      'Changing the language reconnects the conversation, so only do that when they ' +
      'actually ask for a different language.',
    parameters: {
      type: 'OBJECT',
      properties: {
        action: {
          type: 'STRING',
          description: 'What to do to the screen.',
          enum: ['clear_log', 'hide_cards', 'set_language'],
        },
        language: {
          type: 'STRING',
          description: 'Which language, when the action is set_language.',
          enum: ['ur', 'en'],
        },
      },
      required: ['action'],
    },
  };
}

function closeDeclaration() {
  return {
    name: CLOSE_TOOL,
    description:
      'Close the voice conversation and return the user to the panel. Call this when they ' +
      'say they are finished, in any words — "close", "exit", "that is all", "we are done", ' +
      '"goodbye", "bas", "band karo". Say a short goodbye first, then call this; saying ' +
      'goodbye on its own leaves the window open. Do not call it if they are simply ' +
      'pausing or thinking.',
    parameters: {
      type: 'OBJECT',
      properties: {
        farewell: {
          type: 'STRING',
          description: 'Optional one-line sign-off, for the transcript.',
        },
      },
    },
  };
}

/** Same schema sanitising as the REST path — Gemini's dialect is identical here. */
function toDeclaration(tool: AgentToolDefinition) {
  const declaration: Record<string, any> = {
    name: tool.name,
    description: tool.description,
  };
  const params = toGeminiSchema(tool.input_schema);
  if (params?.properties && Object.keys(params.properties).length) {
    declaration.parameters = params;
  }
  return declaration;
}

const isObject = (v: unknown): v is Record<string, any> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

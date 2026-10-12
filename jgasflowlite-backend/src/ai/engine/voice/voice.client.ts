/**
 * Speech to text and text to speech, via the Jawab voice service.
 *
 * The service is deliberately stateless — it converts audio to text and text to
 * audio, and knows nothing about conversations. The agent owns the thinking;
 * this only owns the ears and the mouth.
 *
 * WHY THE BROWSER NEVER TALKS TO IT DIRECTLY, and everything is proxied here:
 *
 *   1. The API key would have to be in the page to do otherwise. A key shipped
 *      to a browser is a public key.
 *   2. The service checks the `Origin` header against an allow-list and refuses
 *      unknown ones with a 403 BEFORE running a model. Our admin panel is not
 *      on that list; our server, which sends no Origin, is gated by the key
 *      instead — which is the intended path for a backend caller.
 *   3. Audio of staff discussing clinics is data we should be able to say where
 *      we sent. One hop, from one host, is auditable.
 *
 * Config: the KEY is set in the admin panel (encrypted at rest, see
 * ai-settings.service.ts); the URL stays in `VOICE_API_URL` for the same reason
 * the Gemini base URL does — a settable endpoint for content this sensitive
 * would be an exfiltration channel that looked like a setting.
 */

import { Injectable, Logger } from '@nestjs/common';
import { AiSettingsService } from '../ai-settings.service';

import { DEFAULT_VOICE_API_URL } from './voice.defaults';
export { DEFAULT_VOICE_API_URL };

/** Long enough for a slow cold start, short enough not to hang a request. */
const TIMEOUT_MS = 45_000;

export interface TranscriptionResult {
  text: string;
  language: string | null;
  duration: number | null;
  elapsed: number | null;
}

export interface SynthesisResult {
  audio: Buffer;
  content_type: string;
  voice: string | null;
  duration: number | null;
  elapsed: number | null;
  /** How many characters actually got spoken after cleaning and trimming. */
  spoken_chars: number | null;
}

export interface VoiceInfo {
  key: string;
  language: string;
  language_name: string;
  country: string;
  name: string;
  quality: string;
  installed: boolean;
}

/** Something the caller can act on. Never a stack trace. */
export class VoiceError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'VoiceError';
  }
}

@Injectable()
export class VoiceClient {
  private readonly logger = new Logger(VoiceClient.name);

  constructor(private readonly settings: AiSettingsService) {}

  get baseUrl(): string {
    return (process.env.VOICE_API_URL || DEFAULT_VOICE_API_URL).replace(/\/+$/, '');
  }

  /** True when a key is configured — the gate for showing voice mode at all. */
  isConfigured(): boolean {
    return !!this.settings.snapshot().voice_api_key;
  }

  private async key(candidate?: string): Promise<string> {
    const key = (candidate || (await this.settings.resolve()).voice_api_key || '').trim();
    if (!key) {
      throw new VoiceError('No voice API key is configured', 503);
    }
    return key;
  }

  // ─────────────────────── speech to text ───────────────────────

  async transcribe(
    file: { buffer: Buffer; mimetype?: string; originalname?: string },
    options: { language?: string; translate?: boolean; apiKey?: string } = {},
  ): Promise<TranscriptionResult> {
    if (!file?.buffer?.length) {
      throw new VoiceError('No audio was received', 400);
    }
    const key = await this.key(options.apiKey);

    // Node 18+ globals, typed loosely so the TS lib target does not matter.
    const g = globalThis as any;
    const form = new g.FormData();
    form.append(
      'audio',
      new g.Blob([file.buffer], { type: file.mimetype || 'audio/webm' }),
      file.originalname || 'question.webm',
    );
    // Empty = auto-detect, so an admin can dictate in Urdu and be understood.
    form.append('language', options.language ?? '');
    form.append('task', options.translate ? 'translate' : 'transcribe');

    const res = await this.call('/api/transcribe', { method: 'POST', body: form }, key);
    const data = await res.json();

    return {
      // Silence is filtered server-side, so an empty string is a legitimate
      // answer — the caller decides what to do about it.
      text: String(data?.text ?? '').trim(),
      language: data?.language ?? null,
      duration: numberOrNull(data?.duration),
      elapsed: numberOrNull(data?.elapsed),
    };
  }

  // ─────────────────────── text to speech ───────────────────────

  async synthesize(
    text: string,
    options: {
      voice?: string;
      speed?: number;
      maxChars?: number;
      apiKey?: string;
    } = {},
  ): Promise<SynthesisResult> {
    const trimmed = (text || '').trim();
    if (!trimmed) throw new VoiceError('There is nothing to speak', 400);

    const config = await this.settings.resolve();
    const key = await this.key(options.apiKey);

    const g = globalThis as any;
    const form = new g.FormData();
    form.append('text', trimmed);
    form.append('voice', options.voice || config.voice_name || '');
    form.append('speed', String(options.speed ?? config.voice_speed ?? 1));

    /**
     * ALWAYS clean. Everything spoken here was written by a language model, in
     * markdown, and piper reads literally — without this a table is read out as
     * "asterisk asterisk pipe pipe" and a link becomes "H-T-T-P-S colon slash
     * slash". Cleaning also turns blank lines and list markers into real pauses,
     * which is what makes a long answer listenable.
     */
    form.append('clean', 'true');

    // A spoken answer that runs for four minutes is not useful; the text is on
    // screen for anyone who wants the rest.
    const cap = options.maxChars ?? 1200;
    if (cap > 0) form.append('max_chars', String(cap));

    const res = await this.call('/api/synthesize', { method: 'POST', body: form }, key);
    const audio = Buffer.from(await res.arrayBuffer());

    return {
      audio,
      content_type: res.headers.get('content-type') || 'audio/wav',
      voice: res.headers.get('x-voice'),
      duration: numberOrNull(res.headers.get('x-duration')),
      elapsed: numberOrNull(res.headers.get('x-elapsed')),
      spoken_chars: numberOrNull(res.headers.get('x-spoken-chars')),
    };
  }

  // ─────────────────────── settings screen ───────────────────────

  /** The piper catalog — ~171 voices, so the screen filters it down. */
  async listVoices(apiKey?: string): Promise<{ default: string; voices: VoiceInfo[] }> {
    const key = await this.key(apiKey);
    const res = await this.call('/api/voices', { method: 'GET' }, key);
    const data = await res.json();
    return {
      default: data?.default ?? '',
      voices: Array.isArray(data?.voices) ? data.voices : [],
    };
  }

  /**
   * Prove the key and the service actually work, before anyone saves them.
   *
   * `/selftest` is the right check rather than `/health`: health never runs a
   * model and would pass with a corrupt one. Never throws — a failed test is an
   * answer for the settings screen, not an exception.
   */
  async verify(apiKey?: string): Promise<{
    ok: boolean;
    latency_ms: number;
    detail?: string;
    stt?: string;
    tts?: string;
  }> {
    const startedAt = Date.now();
    try {
      const key = await this.key(apiKey);
      const res = await this.call('/selftest', { method: 'GET' }, key);
      const data = await res.json();
      return {
        ok: data?.ok === true,
        latency_ms: Date.now() - startedAt,
        stt: data?.checks?.stt?.model,
        tts: data?.checks?.tts?.voice,
        detail: data?.ok === true ? undefined : `Failed: ${(data?.failed ?? []).join(', ') || 'unknown'}`,
      };
    } catch (err) {
      return {
        ok: false,
        latency_ms: Date.now() - startedAt,
        detail: err instanceof VoiceError ? err.message : 'The voice service could not be reached.',
      };
    }
  }

  // ─────────────────────── transport ───────────────────────

  private async call(path: string, init: any, key: string): Promise<Response> {
    const g = globalThis as any;
    const controller = new g.AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const res: Response = await g.fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers: { ...(init.headers ?? {}), 'X-API-Key': key },
        signal: controller.signal,
      });

      if (!res.ok) throw await this.describe(res);
      return res;
    } catch (err) {
      if (err instanceof VoiceError) throw err;
      if ((err as any)?.name === 'AbortError') {
        throw new VoiceError('The voice service took too long to respond.', 504);
      }
      this.logger.error(`Voice call ${path} failed: ${(err as Error).message}`);
      throw new VoiceError('The voice service could not be reached.', 502);
    } finally {
      clearTimeout(timer);
    }
  }

  /** The service's own status codes, turned into something an admin can act on. */
  private async describe(res: Response): Promise<VoiceError> {
    const detail = await res
      .text()
      .then((t) => {
        try {
          const parsed = JSON.parse(t);
          const d = parsed?.detail;
          return typeof d === 'string' ? d : JSON.stringify(d ?? '').slice(0, 200);
        } catch {
          return t.slice(0, 200);
        }
      })
      .catch(() => '');

    this.logger.warn(`Voice service ${res.status}: ${detail}`);

    switch (res.status) {
      case 400:
        return new VoiceError(detail || 'Nothing usable in that audio.', 400);
      case 401:
        return new VoiceError('The voice API key was rejected.', 401);
      case 403:
        return new VoiceError(
          'The voice service refused this origin. It expects a server-to-server call.',
          403,
        );
      case 413:
        return new VoiceError('That recording is too large for the voice service.', 413);
      case 503:
        return new VoiceError('The voice models are still loading — try again shortly.', 503);
      default:
        return new VoiceError(`The voice service failed (${res.status}).`, 502);
    }
  }
}

function numberOrNull(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

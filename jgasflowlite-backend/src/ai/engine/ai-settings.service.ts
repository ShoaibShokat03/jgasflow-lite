/**
 * Where the provider key and model come from.
 *
 * Two sources, and the DB wins: a value set in the admin panel overrides the
 * environment, and anything not set there falls back to `.env`. That ordering
 * is what lets an existing deployment keep working untouched while the panel
 * becomes the place you actually manage it.
 *
 * THE CACHE EXISTS FOR A REASON. `isConfigured()` and `model` are read on paths
 * that cannot await — the capabilities endpoint, the run result envelope — so a
 * warm snapshot is kept in memory, loaded at boot and refreshed on every save.
 * The one path that matters most, the actual API call, always awaits `resolve()`
 * and so never runs on a stale key.
 *
 * WHAT IS DELIBERATELY NOT SETTABLE FROM THE PANEL: the API base URL. Every
 * prompt this agent sends contains clinic data, so an admin who could point the
 * base URL at a host they control would have a clean exfiltration channel that
 * looked like a configuration change. It stays in `.env`, where changing it
 * means server access.
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Db } from '../../db/db.service';
import { decryptSecret, encryptSecret, maskSecret } from './secret-box';
import { DEFAULT_VOICE_API_URL } from './voice/voice.defaults';

/** The single row. There is one AI configuration for the platform. */
const ROW_ID = 1;

/** The ai_settings row (one row, id 1). */
interface AiSettings {
  id: number;
  api_key_encrypted: string | null;
  model: string | null;
  max_output_tokens: number | null;
  thinking_budget: number | null;
  voice_enabled: number;
  voice_api_key_encrypted: string | null;
  voice_name: string | null;
  voice_speed: string | null;
  live_enabled: number;
  live_model: string | null;
  updated_by: number | null;
  updated_by_name: string | null;
  updated_at: Date | string | null;
}

/** How long a resolved snapshot is trusted before a background refresh. */
const CACHE_TTL_MS = 30_000;

export const DEFAULT_MODEL = 'gemini-2.5-flash';
/** Native-audio model for the Live API — a different model from the text one. */
export const DEFAULT_LIVE_MODEL = 'gemini-3.8-live';
const DEFAULT_MAX_OUTPUT_TOKENS = 2048;

export interface ResolvedAiSettings {
  api_key: string | null;
  model: string;
  max_output_tokens: number;
  /** null = the model's own default. 0 disables thinking. */
  thinking_budget: number | null;
  /** Where the key came from, for the settings screen. */
  key_source: 'panel' | 'env' | 'none';

  // ── voice ──
  voice_enabled: boolean;
  voice_api_key: string | null;
  /** Empty = let the voice service pick its own default. */
  voice_name: string;
  voice_speed: number;
  voice_key_source: 'panel' | 'env' | 'none';

  // ── live voice ──
  live_enabled: boolean;
  live_model: string;
}

export interface AiSettingsView {
  configured: boolean;
  key_source: 'panel' | 'env' | 'none';
  /** Never the key itself — enough to recognise it, never enough to use it. */
  api_key_masked: string | null;
  model: string;
  max_output_tokens: number;
  thinking_budget: number | null;
  updated_at: Date | null;
  updated_by_name: string | null;

  // ── voice ──
  voice_enabled: boolean;
  voice_configured: boolean;
  voice_key_source: 'panel' | 'env' | 'none';
  voice_api_key_masked: string | null;
  voice_name: string;
  voice_speed: number;
  /** Env-only, shown so an admin knows where the audio is going. */
  voice_api_url: string;

  live_enabled: boolean;
  live_model: string;
  /** False when there is no provider key — live cannot work without one. */
  live_available: boolean;
}

export interface UpdateAiSettingsInput {
  /** Omitted = leave the stored key alone. Empty string = clear it. */
  api_key?: string;
  model?: string;
  max_output_tokens?: number;
  thinking_budget?: number | null;

  voice_enabled?: boolean;
  /** Same convention as api_key: omitted keeps, empty string clears. */
  voice_api_key?: string;
  voice_name?: string;
  voice_speed?: number;

  live_enabled?: boolean;
  live_model?: string;

  actor_id?: number;
  actor_name?: string;
}

@Injectable()
export class AiSettingsService implements OnModuleInit {
  private readonly logger = new Logger(AiSettingsService.name);

  private cache: ResolvedAiSettings | null = null;
  private cachedAt = 0;
  private refreshing = false;

  constructor(private readonly db: Db) {}

  private row(): Promise<AiSettings | null> {
    return this.db.one<AiSettings>('SELECT * FROM ai_settings WHERE id = ?', [ROW_ID]);
  }

  /**
   * Warm the snapshot at boot, so the very first request does not report the
   * assistant unconfigured while the row sits unread in the database.
   *
   * A failure here is not fatal: the table may not exist yet on a deployment
   * where the migration has not been run, and the env fallback still works.
   */
  async onModuleInit(): Promise<void> {
    try {
      await this.resolve();
    } catch (err) {
      this.logger.warn(
        `Could not read AI settings at boot (${(err as Error).message}). ` +
          `Falling back to environment variables.`,
      );
      this.cache = this.fromEnv();
      this.cachedAt = Date.now();
    }
  }

  /** Fresh settings. Awaited by the actual provider call. */
  async resolve(): Promise<ResolvedAiSettings> {
    if (this.cache && Date.now() - this.cachedAt < CACHE_TTL_MS) {
      return this.cache;
    }
    const row = await this.row();
    this.cache = this.merge(row);
    this.cachedAt = Date.now();
    return this.cache;
  }

  /**
   * The last known settings, without awaiting.
   *
   * For the paths that cannot await. If the snapshot is stale a refresh is
   * kicked off for next time rather than blocking this caller — a display
   * value that is up to thirty seconds behind is not worth an await, and the
   * call that spends money awaits properly.
   */
  snapshot(): ResolvedAiSettings {
    if (!this.cache) return this.fromEnv();
    if (Date.now() - this.cachedAt >= CACHE_TTL_MS && !this.refreshing) {
      this.refreshing = true;
      void this.resolve()
        .catch(() => undefined)
        .finally(() => {
          this.refreshing = false;
        });
    }
    return this.cache;
  }

  /** What the settings screen shows. */
  async view(): Promise<AiSettingsView> {
    const row = await this.row();
    const resolved = this.merge(row);
    return {
      configured: !!resolved.api_key,
      key_source: resolved.key_source,
      api_key_masked: maskSecret(resolved.api_key),
      model: resolved.model,
      max_output_tokens: resolved.max_output_tokens,
      thinking_budget: resolved.thinking_budget,
      updated_at: row?.updated_at ? new Date(String(row.updated_at).replace(' ', 'T')) : null,
      updated_by_name: row?.updated_by_name ?? null,

      voice_enabled: resolved.voice_enabled,
      voice_configured: !!resolved.voice_api_key,
      voice_key_source: resolved.voice_key_source,
      voice_api_key_masked: maskSecret(resolved.voice_api_key),
      voice_name: resolved.voice_name,
      voice_speed: resolved.voice_speed,
      voice_api_url: (process.env.VOICE_API_URL || DEFAULT_VOICE_API_URL).replace(/\/+$/, ''),

      live_enabled: resolved.live_enabled,
      live_model: resolved.live_model,
      live_available: !!resolved.api_key,
    };
  }

  async update(input: UpdateAiSettingsInput): Promise<AiSettingsView> {
    const row: AiSettings =
      (await this.row()) ??
      ({ id: ROW_ID, api_key_encrypted: null, model: null, max_output_tokens: null, thinking_budget: null, voice_enabled: 0, voice_api_key_encrypted: null, voice_name: null, voice_speed: null, live_enabled: 0, live_model: null, updated_by: null, updated_by_name: null, updated_at: null } as AiSettings);

    // Omitted leaves the stored key untouched; an empty string clears it. The
    // panel never receives the key back, so "unchanged" has to be expressible
    // without the client echoing a value it was never given.
    if (input.api_key !== undefined) {
      const trimmed = input.api_key.trim();
      row.api_key_encrypted = trimmed ? encryptSecret(trimmed) : null;
    }
    if (input.model !== undefined) row.model = input.model.trim() || null;
    if (input.max_output_tokens !== undefined) {
      row.max_output_tokens = clampInt(input.max_output_tokens, 256, 32_000);
    }
    if (input.thinking_budget !== undefined) {
      row.thinking_budget =
        input.thinking_budget === null
          ? null
          : clampInt(input.thinking_budget, 0, 32_000);
    }

    if (input.voice_enabled !== undefined) row.voice_enabled = input.voice_enabled ? 1 : 0;
    if (input.voice_api_key !== undefined) {
      const trimmed = input.voice_api_key.trim();
      row.voice_api_key_encrypted = trimmed ? encryptSecret(trimmed) : null;
    }
    if (input.voice_name !== undefined) row.voice_name = input.voice_name.trim() || null;
    if (input.voice_speed !== undefined) {
      // Piper is unintelligible outside roughly this range.
      row.voice_speed = clampFloat(input.voice_speed, 0.5, 2).toFixed(2);
    }

    if (input.live_enabled !== undefined) row.live_enabled = input.live_enabled ? 1 : 0;
    if (input.live_model !== undefined) row.live_model = input.live_model.trim() || null;
    row.updated_by = input.actor_id ?? null;
    row.updated_by_name = input.actor_name?.slice(0, 255) ?? null;

    await this.db.run(
      `INSERT INTO ai_settings (id, api_key_encrypted, model, max_output_tokens, thinking_budget, voice_enabled, voice_api_key_encrypted, voice_name, voice_speed, live_enabled, live_model, updated_by, updated_by_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE api_key_encrypted = VALUES(api_key_encrypted), model = VALUES(model), max_output_tokens = VALUES(max_output_tokens),
         thinking_budget = VALUES(thinking_budget), voice_enabled = VALUES(voice_enabled), voice_api_key_encrypted = VALUES(voice_api_key_encrypted),
         voice_name = VALUES(voice_name), voice_speed = VALUES(voice_speed), live_enabled = VALUES(live_enabled), live_model = VALUES(live_model),
         updated_by = VALUES(updated_by), updated_by_name = VALUES(updated_by_name)`,
      [ROW_ID, row.api_key_encrypted, row.model, row.max_output_tokens, row.thinking_budget, row.voice_enabled, row.voice_api_key_encrypted, row.voice_name, row.voice_speed, row.live_enabled, row.live_model, row.updated_by, row.updated_by_name],
    );

    // Invalidate immediately rather than waiting out the TTL — the admin who
    // just saved a key will test it within seconds.
    this.cache = null;
    this.cachedAt = 0;
    await this.resolve();

    return this.view();
  }

  // ─────────────────────── resolution ───────────────────────

  private merge(row: AiSettings | null): ResolvedAiSettings {
    const env = this.fromEnv();
    const stored = decryptSecret(row?.api_key_encrypted);

    if (row?.api_key_encrypted && !stored) {
      // Almost always a rotated SAAS_JWT_SECRET. Say so once, loudly, rather
      // than letting it look like the key was never saved.
      this.logger.error(
        'The stored AI provider key could not be decrypted — the wrapping secret ' +
          '(AI_SECRET_KEY / SAAS_JWT_SECRET) has changed. Re-enter the key in the admin panel.',
      );
    }

    const voiceStored = decryptSecret(row?.voice_api_key_encrypted);
    const voiceKey = voiceStored ?? env.voice_api_key;

    return {
      api_key: stored ?? env.api_key,
      model: row?.model || env.model,
      max_output_tokens: row?.max_output_tokens ?? env.max_output_tokens,
      thinking_budget:
        row?.thinking_budget !== null && row?.thinking_budget !== undefined
          ? row.thinking_budget
          : env.thinking_budget,
      key_source: stored ? 'panel' : env.api_key ? 'env' : 'none',

      // Enabling voice without a key would put a dead microphone on screen, so
      // the two are resolved together.
      voice_enabled: (row?.voice_enabled === 1 || env.voice_enabled) && !!voiceKey,
      voice_api_key: voiceKey,
      voice_name: row?.voice_name || env.voice_name,
      voice_speed: row?.voice_speed !== null && row?.voice_speed !== undefined
        ? Number(row.voice_speed)
        : env.voice_speed,
      voice_key_source: voiceStored ? 'panel' : env.voice_api_key ? 'env' : 'none',

      // Live needs the provider key, not the voice one — it is Gemini, not
      // the speech service. Enabling it without a key would be a dead button.
      live_enabled: (row?.live_enabled === 1 || env.live_enabled) && !!(stored ?? env.api_key),
      live_model: row?.live_model || env.live_model,
    };
  }

  private fromEnv(): ResolvedAiSettings {
    const env_ = process.env;
    const key = (process.env.GEMINI_API_KEY || '').trim() || null;
    const thinking = process.env.GEMINI_THINKING_BUDGET;
    return {
      api_key: key,
      model: (process.env.GEMINI_MODEL || '').trim() || DEFAULT_MODEL,
      max_output_tokens:
        intEnv('GEMINI_MAX_OUTPUT_TOKENS') ?? DEFAULT_MAX_OUTPUT_TOKENS,
      thinking_budget:
        thinking !== undefined && thinking !== '' && Number.isFinite(Number(thinking))
          ? Number(thinking)
          : null,
      key_source: key ? 'env' : 'none',

      // The clinic app already relays voice notes through this service, so the
      // same VOICE_API_* variables are honoured here rather than inventing new
      // ones for the same credential.
      voice_enabled: String(env_.VOICE_ENABLED ?? '').toLowerCase() === 'true',
      voice_api_key: (process.env.VOICE_API_KEY || '').trim() || null,
      voice_name: (process.env.VOICE_NAME || '').trim(),
      voice_speed: floatEnv('VOICE_SPEED') ?? 1,
      voice_key_source: process.env.VOICE_API_KEY?.trim() ? 'env' : 'none',

      live_enabled: String(env_.GEMINI_LIVE_ENABLED ?? '').toLowerCase() === 'true',
      live_model: (process.env.GEMINI_LIVE_MODEL || '').trim() || DEFAULT_LIVE_MODEL,
    };
  }
}

function clampFloat(value: number, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 1;
  return Math.min(Math.max(n, min), max);
}

function floatEnv(key: string): number | null {
  const n = Number(process.env[key]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function clampInt(value: number, min: number, max: number): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return min;
  return Math.min(Math.max(n, min), max);
}

function intEnv(key: string): number | null {
  const n = Number(process.env[key]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

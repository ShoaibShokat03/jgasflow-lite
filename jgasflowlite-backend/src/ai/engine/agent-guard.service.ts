/**
 * The guard — three checks, in code, on the single path from model to tool.
 *
 * There is no second route: the runner cannot reach a handler except through
 * `dispatch`, and that invariant IS the security model. Everything the model
 * asks for is a request; this file is where requests become permitted actions.
 *
 *   1. PERMISSION   reuse the host's own authorisation. Adds no new surface.
 *   2. POLICY       domain vetoes on writes: ceilings, closed periods, locks.
 *   3. CONFIRMATION explicit user approval of THIS EXACT action.
 *
 * Reads face check 1 alone, which is why a read-only deployment is nearly risk
 * free and can ship first.
 *
 * WHY NOT IN THE PROMPT
 * Telling a model "never post to a closed period" is a request: it may not
 * survive an unusual phrasing, a long conversation, or text injected into a
 * database field that the model later reads back as a tool result. A line of
 * code that refuses is a rule the model cannot argue with. Moving any of these
 * three checks into the prompt to make the assistant more helpful would remove
 * the reason it is safe to point at production data.
 */

import { Injectable, Logger, HttpException } from '@nestjs/common';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import {
  AgentContext,
  AgentInputError,
  AgentPolicy,
  AgentToolCall,
  DispatchResult,
  RegisteredTool,
} from './agent.types';
import { ToolRegistry } from './tool-registry.service';

/** How long a confirmation stays approvable once offered. */
const CONFIRM_TTL_MS = 10 * 60 * 1000;

export interface DispatchOptions {
  ctx: AgentContext;
  policies: AgentPolicy[];
  /** Scopes a confirmation token to one conversation. */
  conversation_ref: string;
  /** Tokens the user handed back with this request. */
  approved_tokens: ReadonlySet<string>;
  /** Tools declared for this run — a name outside it is treated as unknown. */
  available: ReadonlySet<string>;
}

@Injectable()
export class AgentGuard {
  private readonly logger = new Logger(AgentGuard.name);

  /**
   * Signing key for confirmation tokens.
   *
   * A random per-boot key is the safe default: it means a restart invalidates
   * outstanding approvals, which for a ten-minute window is the behaviour you
   * want anyway. Set AI_CONFIRM_SECRET once the API runs on more than one node,
   * or approvals will fail whenever the load balancer moves the follow-up
   * request to a different instance.
   */
  private readonly confirmSecret =
    process.env.AI_CONFIRM_SECRET?.trim() || randomBytes(32).toString('hex');

  constructor(private readonly registry: ToolRegistry) {}

  async dispatch(
    call: AgentToolCall,
    options: DispatchOptions,
  ): Promise<DispatchResult> {
    const tool = this.registry.get(call.name);

    if (!tool || !options.available.has(call.name)) {
      // Also covers a tool this tenant does not have: from the model's side
      // those are indistinguishable, and "there is no such tool" is the honest
      // answer rather than advertising a feature they have not bought.
      return {
        outcome: 'unknown_tool',
        payload: {
          error: `There is no tool called "${call.name}". Use one of the tools you were given, or tell the user this assistant cannot answer that.`,
        },
      };
    }

    // ── 1. PERMISSION ───────────────────────────────────────────────
    if (tool.permission && !options.ctx.principal.allows(tool.permission)) {
      return {
        outcome: 'rejected',
        payload: {
          rejected: `Running ${tool.name} needs the "${tool.permission}" permission, and this user does not have it. Tell the user which permission is missing and that an owner or manager can grant it. Do NOT try another tool to reach the same data.`,
        },
        error_detail: `missing ${tool.permission}`,
      };
    }

    if (!tool.writes) {
      return this.execute(tool, call, options.ctx);
    }

    // ── 2. POLICY ───────────────────────────────────────────────────
    for (const policy of options.policies) {
      let denial: string | null;
      try {
        denial = await policy.deny(tool, call.input, options.ctx.principal);
      } catch (err) {
        // A policy that cannot decide must not fail open.
        this.logger.error(
          `Policy ${policy.name} threw on ${tool.name}: ${(err as Error).message}`,
        );
        return {
          outcome: 'rejected',
          payload: {
            rejected: `${tool.name} could not be checked against the platform's rules, so it was not run. Tell the user to do it on the relevant screen instead.`,
          },
          error_detail: `policy ${policy.name} threw: ${(err as Error).message}`,
        };
      }
      if (denial) {
        return {
          outcome: 'rejected',
          payload: { rejected: `${denial} Tell the user this and stop — do not attempt it another way.` },
          error_detail: `policy ${policy.name}: ${denial}`,
        };
      }
    }

    // ── 3. CONFIRMATION ─────────────────────────────────────────────
    const approved = this.isApproved(
      options.conversation_ref,
      tool.name,
      call.input,
      options.approved_tokens,
    );

    if (!approved) {
      const token = this.mintToken(options.conversation_ref, tool.name, call.input);
      const preview = this.safePreview(tool, call.input, options.ctx);
      return {
        outcome: 'needs_confirm',
        // The model is told an approval is pending and is given the preview so
        // it can put it in words. It is NOT given the token: a model that could
        // quote a token could be talked into quoting one by injected content.
        payload: {
          awaiting_user_confirmation: preview,
          note: 'NOTHING HAS HAPPENED YET. Tell the user exactly what they are being asked to approve and wait. Do not call this tool again in this reply, and do not say it is done.',
        },
        confirmation: { token, tool: tool.name, preview, input: call.input },
      };
    }

    return this.execute(tool, call, options.ctx);
  }

  // ─────────────────────── execution ───────────────────────

  private async execute(
    tool: RegisteredTool,
    call: AgentToolCall,
    ctx: AgentContext,
  ): Promise<DispatchResult> {
    try {
      const data = await tool.handler(call.input ?? {}, ctx);
      return { outcome: 'executed', payload: data ?? { ok: true } };
    } catch (err) {
      // Bad arguments: hand back the validation message verbatim. This is the
      // difference between the model fixing the call on the next turn and the
      // model apologising to the user.
      if (err instanceof AgentInputError) {
        return {
          outcome: 'failed',
          payload: { error: err.message },
          error_detail: err.message,
        };
      }

      /**
       * The application's own 4xx exceptions are written for humans ("Patient
       * not found", "This invoice is cancelled") and are safe and useful to
       * relay. A 5xx or an unknown throw is not: exception text carries SQL,
       * file paths and connection strings, and whatever reaches the model can
       * be repeated to the user. Log the real one, give the model a sentence.
       */
      if (err instanceof HttpException && err.getStatus() < 500) {
        return {
          outcome: 'failed',
          payload: { error: httpMessage(err) },
          error_detail: `${err.getStatus()} ${httpMessage(err)}`,
        };
      }

      const detail = err instanceof Error ? err.stack || err.message : String(err);
      this.logger.error(`Tool ${tool.name} threw: ${detail}`);
      return {
        outcome: 'failed',
        payload: {
          error: `${tool.name} could not be completed because of a problem in the system. Tell the user it failed and that nothing was changed.`,
        },
        error_detail: detail.slice(0, 1000),
      };
    }
  }

  private safePreview(
    tool: RegisteredTool,
    input: any,
    ctx: AgentContext,
  ): string {
    try {
      return tool.preview?.(input, ctx) ?? `Run ${tool.name}`;
    } catch {
      return `Run ${tool.name}`;
    }
  }

  // ─────────────────────── confirmation tokens ───────────────────────

  /**
   * A token authorises ONE action.
   *
   * Approving "record a payment of 50,000 on invoice 12" must not approve
   * "record a payment of 500,000 on invoice 12", so the fingerprint covers the
   * tool name together with the FULL input, canonicalised so that key order
   * cannot produce two different tokens for the same action. The conversation
   * ref scopes it, and the expiry is inside the signed material so a token
   * cannot outlive its window.
   */
  private mintToken(
    conversationRef: string,
    toolName: string,
    input: any,
    expiresAt = Date.now() + CONFIRM_TTL_MS,
  ): string {
    const mac = this.sign(conversationRef, toolName, canonicalJson(input ?? {}), expiresAt);
    return `${expiresAt}.${mac}`;
  }

  private sign(
    conversationRef: string,
    toolName: string,
    canonicalInput: string,
    expiresAt: number,
  ): string {
    return createHmac('sha256', this.confirmSecret)
      .update([conversationRef, toolName, canonicalInput, String(expiresAt)].join('|'))
      .digest('base64url');
  }

  /**
   * Is this exact action already approved?
   *
   * The expiry is read OUT of the token being checked and fed back into the
   * signature, rather than a fresh one being generated to compare against —
   * minting a new token to verify an old one can never match, because the two
   * are signed over different timestamps. That mistake fails silently as an
   * approval that simply never works, so it is worth being explicit about.
   */
  private isApproved(
    conversationRef: string,
    toolName: string,
    input: any,
    approved: ReadonlySet<string>,
  ): boolean {
    if (!approved.size) return false;
    const canonicalInput = canonicalJson(input ?? {});
    const now = Date.now();

    for (const candidate of approved) {
      const split = candidate.indexOf('.');
      if (split <= 0) continue;

      const expiresAt = Number(candidate.slice(0, split));
      const mac = candidate.slice(split + 1);

      // Expired, or claiming an expiry we would never have issued.
      if (!Number.isFinite(expiresAt)) continue;
      if (expiresAt < now || expiresAt > now + CONFIRM_TTL_MS * 2) continue;

      const expected = this.sign(conversationRef, toolName, canonicalInput, expiresAt);
      if (mac.length !== expected.length) continue;
      if (timingSafeEqual(Buffer.from(mac, 'utf8'), Buffer.from(expected, 'utf8'))) {
        return true;
      }
    }
    return false;
  }
}

/**
 * Stable JSON for fingerprinting.
 *
 * Keys are sorted recursively, so the order the model happened to emit them in
 * cannot produce two different tokens for one action. Keys whose value is
 * `undefined` are dropped: an omitted optional argument and one sent explicitly
 * empty are the SAME action, and treating them as different shows up as an
 * approval that inexplicably does not apply on the second attempt.
 *
 * `null` is deliberately kept, because in an API it can carry meaning ("clear
 * this field") that absence does not.
 */
export function canonicalJson(value: any): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const keys = Object.keys(value)
      .filter((k) => value[k] !== undefined)
      .sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`;
  }
  return value === undefined ? 'null' : JSON.stringify(value);
}

function httpMessage(err: HttpException): string {
  const res = err.getResponse() as any;
  if (typeof res === 'string') return res;
  const message = res?.message;
  if (Array.isArray(message)) return message.join('; ');
  if (typeof message === 'string') return message;
  return err.message;
}

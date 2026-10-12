/**
 * Neutral agent contracts — no provider, no domain, no HTTP.
 *
 * Everything the engine passes around is defined here, so swapping the LLM
 * provider touches exactly one file (`llm/*.client.ts`) and swapping the host
 * application touches exactly one file (the tool + policy adapters).
 *
 * Deliberately NOT provider JSON: the moment a conversation is stored in
 * Gemini's wire shape, changing model becomes a data migration.
 */

// ─────────────────────────── Conversation ───────────────────────────

export type AgentRole = 'user' | 'assistant' | 'tool';

export interface AgentToolCall {
  /** Our own id. Some providers (Gemini) issue none — see the adapter. */
  id: string;
  name: string;
  input: Record<string, any>;
}

export interface AgentTurn {
  role: AgentRole;

  /** user + assistant text. */
  text?: string;

  /** assistant only — the tools the model wants run. */
  tool_calls?: AgentToolCall[];

  /** tool only — must match the call it answers. */
  tool_call_id?: string;
  name?: string;
  /** tool only — the ENCODED result (see tool-result.ts). */
  content?: string;

  /**
   * Provider-opaque block kept verbatim beside the neutral fields.
   *
   * Gemini 2.5 returns `thought` parts carrying a `thoughtSignature` that must
   * be echoed back byte-identical or the model loses its reasoning chain, and
   * those same bytes are meaningless to any other provider. So we record WHICH
   * provider produced them and replay only on a match, rebuilding from the
   * neutral fields otherwise.
   */
  provider?: string;
  raw?: any;
}

export const userTurn = (text: string): AgentTurn => ({ role: 'user', text });

export const assistantTurn = (
  text: string,
  tool_calls?: AgentToolCall[],
  provider?: string,
  raw?: any,
): AgentTurn => ({ role: 'assistant', text, tool_calls, provider, raw });

export const toolResultTurn = (
  call: AgentToolCall,
  content: string,
): AgentTurn => ({
  role: 'tool',
  tool_call_id: call.id,
  name: call.name,
  content,
});

// ─────────────────────────── LLM contract ───────────────────────────

export interface LlmUsage {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
}

export const emptyUsage = (): LlmUsage => ({
  input_tokens: 0,
  output_tokens: 0,
  total_tokens: 0,
});

export const addUsage = (a: LlmUsage, b: LlmUsage): LlmUsage => ({
  input_tokens: a.input_tokens + b.input_tokens,
  output_tokens: a.output_tokens + b.output_tokens,
  total_tokens: a.total_tokens + b.total_tokens,
});

export type LlmStopReason =
  | 'stop'
  | 'tool_use'
  | 'max_tokens'
  | 'refusal'
  | 'other';

export interface LlmResponse {
  text: string;
  tool_calls: AgentToolCall[];
  usage: LlmUsage;
  stop_reason: LlmStopReason;
  /** Tag written onto the assistant turn so `raw` is only ever replayed here. */
  provider: string;
  /** Provider-native content parts, for byte-identical replay. */
  raw?: any;
  /** Which model actually answered. */
  model: string;
}

/** The JSON Schema subset tools are authored in. Adapters narrow it further. */
export interface JsonSchema {
  type: 'object';
  properties: Record<string, any>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface LlmSendOptions {
  system: string;
  turns: AgentTurn[];
  tools: AgentToolDefinition[];
}

/** One selectable model, for the settings screen. */
export interface LlmModelInfo {
  id: string;
  label: string;
  description?: string;
  input_token_limit?: number;
  output_token_limit?: number;
}

export interface LlmVerifyResult {
  ok: boolean;
  model: string;
  latency_ms: number;
  /** Present when ok is false — safe to show an admin, never a stack trace. */
  error?: string;
}

export interface LlmClient {
  readonly provider: string;
  readonly model: string;
  /** True when the provider is configured enough to be called at all. */
  isConfigured(): boolean;
  send(options: LlmSendOptions): Promise<LlmResponse>;

  /**
   * Optional, for the settings screen. Both take a CANDIDATE key so an admin
   * can list models and prove a key works before saving it — typing a key into
   * a box and only finding out it is wrong on the next question is a bad way
   * to configure something that costs money.
   */
  listModels?(apiKey?: string): Promise<LlmModelInfo[]>;
  verify?(apiKey?: string, model?: string): Promise<LlmVerifyResult>;
}

/** Provider-side failure. Never shown to the model, never shown raw to a user. */
export class LlmError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly retryable = false,
  ) {
    super(message);
    this.name = 'LlmError';
  }
}

// ─────────────────────────── Identity ───────────────────────────

/**
 * Who is asking — a thin adapter over the host's own user and permission
 * model. The engine never learns what a company, role or JWT is.
 */
export interface AgentPrincipal {
  id: number;
  /**
   * Tenant the principal is confined to, and every clinic tool must pass it to
   * the service it calls. NULL for a platform admin, who is deliberately not
   * confined to one clinic — which is also why no platform tool takes it.
   */
  tenant_id: number | null;
  display_name: string;
  role: string;
  /** Resolved permission keys, used to build the runtime-facts layer. */
  permissions: string[];
  allows(permission: string): boolean;
}

export interface AgentContext {
  principal: AgentPrincipal;
}

// ─────────────────────────── Tools ───────────────────────────

/**
 * Which agent a tool belongs to.
 *
 * The registry is one shared singleton, so without this a platform tool with no
 * tenant module key would read as "available to everyone" and be offered to a
 * clinic receptionist. Scope is the wall between the two agents; the permission
 * check behind it is a different wall again.
 */
export type AgentScope = 'shop' | 'platform';

export interface AgentToolDefinition {
  /** snake_case, unique across ALL scopes, STABLE across deploys. */
  name: string;
  /** What it does AND when to call it, in the words a user would use. */
  description: string;
  input_schema: JsonSchema;
  /** A permission the host application ALREADY has. */
  permission?: string;
  /**
   * Feature-flag key. When the tenant does not have this module the tool is
   * never declared to the model at all — no point offering what it cannot use.
   */
  module?: string;
  /**
   * True only for tools that change state.
   *
   * NEVER written by hand: the registry derives it from which group the tool
   * was registered in, so a typo in an object literal cannot slip a write past
   * the policy and confirmation gates.
   */
  writes: boolean;
  /** Derived the same way, from which agent registered it. */
  scope: AgentScope;
}

export interface AgentTool extends Omit<AgentToolDefinition, 'writes' | 'scope'> {
  handler(input: any, ctx: AgentContext): Promise<unknown>;
  /**
   * One plain sentence describing what this write is about to do, shown to the
   * user for approval. Every write tool should provide one.
   */
  preview?(input: any, ctx: AgentContext): string;
}

export type RegisteredTool = AgentTool & { writes: boolean; scope: AgentScope };

/**
 * Who a conversation and its audit rows belong to.
 *
 * A clinic user is scoped to their company; a platform admin is scoped to the
 * platform and has no company at all — hence the nullable id rather than a
 * sentinel zero, which would sort and join like a real clinic.
 */
export interface AgentOwner {
  scope: AgentScope;
  company_id: number | null;
  user_id: number;
}

/** Bad arguments. The message reaches the model verbatim so it can retry. */
export class AgentInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AgentInputError';
  }
}

// ─────────────────────────── Policies ───────────────────────────

/**
 * A domain veto on a WRITE: closed periods, approval ceilings, locked records.
 * Returns the sentence to refuse with, or null to allow.
 *
 * In code, never in the prompt: a prompt rule is a request, a policy is a rule.
 */
export interface AgentPolicy {
  name: string;
  deny(
    tool: AgentToolDefinition,
    input: any,
    principal: AgentPrincipal,
  ): Promise<string | null> | string | null;
}

// ─────────────────────────── Dispatch ───────────────────────────

export type DispatchOutcome =
  | 'executed'
  | 'rejected'
  | 'needs_confirm'
  | 'failed'
  | 'unknown_tool';

export interface PendingConfirmation {
  /** Server-minted, scoped to (conversation, tool, exact input). */
  token: string;
  tool: string;
  preview: string;
  input: Record<string, any>;
}

export interface DispatchResult {
  outcome: DispatchOutcome;
  /** What the MODEL is allowed to see. */
  payload: any;
  /**
   * Confirmation envelope for the CLIENT only. The token is deliberately kept
   * out of `payload` — the model must never be able to quote or mint one.
   */
  confirmation?: PendingConfirmation;
  /** Real error text: logged and audited, never sent to the model. */
  error_detail?: string;
}

// ─────────────────────────── Run result ───────────────────────────

export type AgentStop =
  | 'answered'
  | 'refused'
  | 'budget'
  | 'awaiting_confirmation'
  | 'failed';

export interface ToolLogEntry {
  name: string;
  input: Record<string, any>;
  outcome: DispatchOutcome;
  ms: number;
  /** Present for failed/rejected calls — audit only. */
  detail?: string;
}

export interface AgentRunResult {
  answer: string;
  stop: AgentStop;
  /** The full conversation after the run — this is what gets persisted. */
  turns: AgentTurn[];
  awaiting_confirmation: PendingConfirmation[];
  usage: LlmUsage;
  turns_used: number;
  duration_ms: number;
  tool_log: ToolLogEntry[];
  model: string;
}

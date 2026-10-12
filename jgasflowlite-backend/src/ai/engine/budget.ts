/**
 * Three budgets, checked together before every model call.
 *
 * MAX_TURNS alone is the trap: it bounds neither time nor money. Eight turns
 * at a 120-second provider timeout is sixteen minutes, and eight turns over a
 * growing conversation can be a quarter of a million input tokens, because the
 * whole history is resent each time.
 */

import { LlmUsage } from './agent.types';

export interface AgentBudget {
  max_turns: number;
  max_seconds: number;
  max_total_tokens: number;
  /** Turns of conversation history kept when trimming. */
  max_history: number;
}

export const DEFAULT_BUDGET: AgentBudget = {
  max_turns: 8,
  max_seconds: 180,
  max_total_tokens: 250_000,
  max_history: 40,
};

export function budgetFromEnv(env = process.env): AgentBudget {
  const num = (key: string, fallback: number) => {
    const n = Number(env[key]);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
  };
  return {
    max_turns: num('AI_MAX_TURNS', DEFAULT_BUDGET.max_turns),
    max_seconds: num('AI_MAX_SECONDS', DEFAULT_BUDGET.max_seconds),
    max_total_tokens: num('AI_MAX_TOTAL_TOKENS', DEFAULT_BUDGET.max_total_tokens),
    max_history: num('AI_MAX_HISTORY', DEFAULT_BUDGET.max_history),
  };
}

export type BudgetBreach = 'turns' | 'seconds' | 'tokens';

/**
 * Which limit (if any) has been reached.
 *
 * Called BEFORE the model call, not after — checking afterwards means always
 * paying for one more turn than the limit allows. `turn` is zero-based and
 * turn 0 is never refused: a low limit plus an eager check makes the agent
 * permanently mute, and that bug is very hard to see from the outside.
 */
export function budgetBreach(
  budget: AgentBudget,
  startedAt: number,
  usage: LlmUsage,
  turn: number,
): BudgetBreach | null {
  if (turn === 0) return null;
  if (turn >= budget.max_turns) return 'turns';
  if ((Date.now() - startedAt) / 1000 >= budget.max_seconds) return 'seconds';
  if (usage.total_tokens >= budget.max_total_tokens) return 'tokens';
  return null;
}

/**
 * When a limit fires the user gets a real answer, not an exception — one that
 * names the constraint and suggests a smaller question.
 */
export function budgetMessage(breach: BudgetBreach): string {
  switch (breach) {
    case 'turns':
      return 'I could not finish that within my step limit — the question needed more look-ups than I am allowed in one go. Try asking for one figure at a time, or narrowing it to a single patient, doctor or month.';
    case 'seconds':
      return 'That took longer than I am allowed to spend on one question. Try a shorter date range or a single figure.';
    case 'tokens':
      return 'That question pulled in more data than I can read in one conversation. Try narrowing it — a shorter date range, one branch, or one patient — or start a new conversation.';
  }
}

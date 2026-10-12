/**
 * The loop.
 *
 * This is the part that must not change when the engine is ported. Five things
 * in it are load-bearing and are exactly the ones usually dropped in a rewrite:
 *
 *  1. The budget is checked BEFORE the model call. Checking after means always
 *     paying for one more turn than the limit allows.
 *  2. Turn 0 is never refused (see budget.ts) — a low limit plus an eager check
 *     makes the agent permanently mute, and that bug is invisible from outside.
 *  3. The assistant turn is appended BEFORE the tools run. Providers reject a
 *     tool result that has no matching tool call in the history.
 *  4. Every call goes through the guard. There is no second path to a handler.
 *  5. Running out of turns returns a real answer, not an exception. The user
 *     asked a question; they get a sentence telling them how to ask a smaller
 *     one.
 */

import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  AgentPolicy,
  AgentPrincipal,
  AgentRunResult,
  AgentStop,
  AgentTurn,
  LlmClient,
  LlmError,
  LlmResponse,
  PendingConfirmation,
  RegisteredTool,
  ToolLogEntry,
  addUsage,
  assistantTurn,
  emptyUsage,
  toolResultTurn,
  userTurn,
} from './agent.types';
import { AgentBudget, budgetBreach, budgetMessage, budgetFromEnv } from './budget';
import { AgentGuard } from './agent-guard.service';
import { buildSystemPrompt, deniedToolSummary } from './prompt-builder';
import { encodeToolResult } from './tool-result';
import { trimHistory } from './conversation.store';
import { LLM_CLIENT } from './llm/llm.token';

export interface AgentRunRequest {
  question: string;
  principal: AgentPrincipal;
  /** Prior turns. Not mutated — the result carries the new history. */
  history: AgentTurn[];
  tools: RegisteredTool[];
  policies: AgentPolicy[];
  /** Prompt layer 2. */
  instructions: string;
  /** Prompt layer 3 — volatile, appended last. */
  facts: Record<string, string | undefined>;
  approved_tokens: string[];
  conversation_ref: string;
  budget?: AgentBudget;
}

const REFUSAL_ANSWER = "I can't help with that.";

@Injectable()
export class AgentRunner {
  private readonly logger = new Logger(AgentRunner.name);

  constructor(
    @Inject(LLM_CLIENT) private readonly llm: LlmClient,
    private readonly guard: AgentGuard,
  ) {}

  get model(): string {
    return this.llm.model;
  }

  isConfigured(): boolean {
    return this.llm.isConfigured();
  }

  async run(request: AgentRunRequest): Promise<AgentRunResult> {
    const startedAt = Date.now();
    const budget = request.budget ?? budgetFromEnv();
    const available = new Set(request.tools.map((t) => t.name));
    const writeTools = new Set(request.tools.filter((t) => t.writes).map((t) => t.name));
    const approved = new Set(request.approved_tokens ?? []);

    const system = buildSystemPrompt({
      instructions: request.instructions,
      facts: {
        ...request.facts,
        restrictions: deniedToolSummary(request.principal, request.tools),
      },
    });

    let turns: AgentTurn[] = trimHistory(
      [...request.history, userTurn(request.question)],
      budget.max_history,
    );

    let usage = emptyUsage();
    const toolLog: ToolLogEntry[] = [];
    const awaiting: PendingConfirmation[] = [];
    let turnsUsed = 0;

    const finish = (answer: string, stop: AgentStop): AgentRunResult => ({
      answer,
      // A pending approval outranks a plain answer: the caller must surface it.
      stop: awaiting.length && stop === 'answered' ? 'awaiting_confirmation' : stop,
      turns,
      awaiting_confirmation: awaiting,
      usage,
      turns_used: turnsUsed,
      duration_ms: Date.now() - startedAt,
      tool_log: toolLog,
      model: this.llm.model,
    });

    for (let turn = 0; turn < budget.max_turns + 1; turn++) {
      // 1 — budget first, so a limit is never exceeded by one paid call.
      const breach = budgetBreach(budget, startedAt, usage, turn);
      if (breach) {
        this.logger.warn(
          `Agent run stopped on ${breach} (turn ${turn}, ${usage.total_tokens} tokens)`,
        );
        return finish(budgetMessage(breach), 'budget');
      }

      let response: LlmResponse;
      try {
        response = await this.llm.send({ system, turns, tools: request.tools });
      } catch (err) {
        const message =
          err instanceof LlmError
            ? err.message
            : 'The AI service could not be reached';
        this.logger.error(`Agent run failed: ${message}`);
        return finish(
          `I could not reach the AI service just now (${message}). Nothing was changed. Please try again in a moment.`,
          'failed',
        );
      }

      turnsUsed = turn + 1;
      usage = addUsage(usage, response.usage);

      // A refusal is final. Retrying the same prompt just pays twice for it.
      if (response.stop_reason === 'refusal') {
        turns = [...turns, assistantTurn(REFUSAL_ANSWER)];
        return finish(REFUSAL_ANSWER, 'refused');
      }

      // 2 — no tools wanted: this is the normal exit.
      if (!response.tool_calls.length) {
        if (!response.text) {
          const ranOut = response.stop_reason === 'max_tokens';
          return finish(
            ranOut
              ? 'I ran out of room before I could finish the answer. Ask for one figure at a time and I can give you a complete reply.'
              : 'I could not produce an answer to that. Try rephrasing it, or asking for one specific figure.',
            ranOut ? 'budget' : 'failed',
          );
        }
        turns = [...turns, assistantTurn(response.text, undefined, response.provider, response.raw)];
        return finish(response.text, 'answered');
      }

      /**
       * A write is already waiting for the user, and the model has gone back to
       * asking for tools instead of speaking to them. Nothing it asks for now
       * can be approved in this run, so the loop would spin to the turn limit.
       */
      if (awaiting.length) {
        const answer = awaiting
          .map((a) => `I need you to confirm this before I do it: ${a.preview}`)
          .join('\n');
        return finish(answer, 'awaiting_confirmation');
      }

      // 3 — the assistant turn is appended BEFORE the tools run.
      turns = [
        ...turns,
        assistantTurn(response.text, response.tool_calls, response.provider, response.raw),
      ];

      // 4 — every call through the guard. Independent READS go concurrently;
      // writes stay sequential so two of them can never interleave.
      const allReads = response.tool_calls.every((c) => !writeTools.has(c.name));
      const dispatchOne = async (call: (typeof response.tool_calls)[number]) => {
        const at = Date.now();
        const result = await this.guard.dispatch(call, {
          ctx: { principal: request.principal },
          policies: request.policies,
          conversation_ref: request.conversation_ref,
          approved_tokens: approved,
          available,
        });
        toolLog.push({
          name: call.name,
          input: call.input,
          outcome: result.outcome,
          ms: Date.now() - at,
          detail: result.error_detail,
        });
        if (result.confirmation && !awaiting.some((a) => a.token === result.confirmation!.token)) {
          awaiting.push(result.confirmation);
        }
        return toolResultTurn(call, encodeToolResult(result.payload));
      };

      let results: AgentTurn[];
      if (allReads && response.tool_calls.length > 1) {
        results = await Promise.all(response.tool_calls.map(dispatchOne));
      } else {
        results = [];
        for (const call of response.tool_calls) results.push(await dispatchOne(call));
      }

      turns = [...turns, ...results];
    }

    // 5 — out of turns is an answer, not a throw.
    return finish(budgetMessage('turns'), 'budget');
  }
}

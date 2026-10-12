/**
 * Run audit (table ai_agent_runs). Recording a run must never fail the run.
 */

import { Injectable, Logger } from '@nestjs/common';
import { Db } from '../../db/db.service';
import { AgentOwner, AgentRunResult, AgentScope } from './agent.types';

@Injectable()
export class AgentAuditService {
  private readonly logger = new Logger(AgentAuditService.name);

  constructor(private readonly db: Db) {}

  async record(input: { owner: AgentOwner; user_name: string; conversation_id: number | null; question: string; result: AgentRunResult }): Promise<void> {
    try {
      const { result } = input;
      await this.db.run(
        `INSERT INTO ai_agent_runs (scope, company_id, user_id, user_name, conversation_id, question, answer, status, model,
           turns_used, input_tokens, output_tokens, total_tokens, duration_ms, tool_calls)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          input.owner.scope,
          input.owner.company_id,
          input.owner.user_id,
          input.user_name.slice(0, 255),
          input.conversation_id,
          input.question,
          result.answer,
          result.stop,
          result.model,
          result.turns_used,
          result.usage.input_tokens,
          result.usage.output_tokens,
          result.usage.total_tokens,
          result.duration_ms,
          JSON.stringify(result.tool_log ?? []),
        ],
      );
    } catch (err) {
      this.logger.error(`Failed to record agent run: ${(err as Error).message}`);
    }
  }

  /** Recent runs; `userId` set = only that user's own runs. */
  async list(scope: AgentScope, companyId: number | null, query: { page?: number; limit?: number; search?: string }, userId?: number) {
    const where = ['scope = ?'];
    const args: unknown[] = [scope];
    if (companyId !== null) {
      where.push('company_id = ?');
      args.push(companyId);
    }
    if (userId !== undefined) {
      where.push('user_id = ?');
      args.push(userId);
    }
    if (query.search) {
      where.push('(question LIKE ? OR answer LIKE ? OR user_name LIKE ?)');
      const like = `%${query.search}%`;
      args.push(like, like, like);
    }
    const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
    const page = Math.max(Number(query.page) || 1, 1);
    const total = await this.db.one<any>(`SELECT COUNT(*) AS n FROM ai_agent_runs WHERE ${where.join(' AND ')}`, args);
    const items = await this.db.all<any>(
      `SELECT id, user_id, user_name, conversation_id, question, answer, status, model, turns_used, total_tokens, duration_ms, tool_calls, created_at
       FROM ai_agent_runs WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT ? OFFSET ?`,
      [...args, limit, (page - 1) * limit],
    );
    const n = Number(total?.n ?? 0);
    return {
      items: items.map((r) => ({ ...r, id: Number(r.id), tool_calls: safeParse(r.tool_calls) })),
      total: n,
      page,
      total_pages: Math.max(1, Math.ceil(n / limit)),
    };
  }

  /** Which tools get chosen and how often they fail. */
  async toolUsage(scope: AgentScope, companyId: number | null, days = 30) {
    const rows = await this.db.all<any>(
      `SELECT tool_calls FROM ai_agent_runs WHERE scope = ? AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY) AND tool_calls IS NOT NULL ${companyId !== null ? 'AND company_id = ?' : ''}`,
      companyId !== null ? [scope, days, companyId] : [scope, days],
    );
    const tally = new Map<string, { calls: number; executed: number; rejected: number; failed: number }>();
    for (const row of rows) {
      for (const call of safeParse(row.tool_calls)) {
        const e = tally.get(call.name) ?? { calls: 0, executed: 0, rejected: 0, failed: 0 };
        e.calls++;
        if (call.outcome === 'executed') e.executed++;
        else if (call.outcome === 'rejected') e.rejected++;
        else if (call.outcome === 'failed' || call.outcome === 'unknown_tool') e.failed++;
        tally.set(call.name, e);
      }
    }
    return [...tally.entries()].map(([name, c]) => ({ name, ...c })).sort((a, b) => b.calls - a.calls);
  }
}

function safeParse(v: unknown): any[] {
  if (Array.isArray(v)) return v;
  try {
    const p = JSON.parse(String(v ?? '[]'));
    return Array.isArray(p) ? p : [];
  } catch {
    return [];
  }
}

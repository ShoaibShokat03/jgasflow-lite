/**
 * Conversation persistence and history trimming (table ai_conversations).
 */

import { Injectable, NotFoundException } from '@nestjs/common';
import { Db } from '../../db/db.service';
import { AgentOwner, AgentTurn } from './agent.types';

/**
 * How many recent assistant turns keep their provider-opaque `raw` block.
 * Gemini's thought signatures only matter to the reasoning still in play.
 */
const KEEP_RAW_TURNS = 6;

export interface ConversationRow {
  id: number;
  title: string;
  turns: AgentTurn[];
  message_count: number;
  last_message_at: string | null;
  created_at: string;
}

const parseTurns = (v: unknown): AgentTurn[] => {
  if (!v) return [];
  if (Array.isArray(v)) return v as AgentTurn[];
  try {
    const p = JSON.parse(String(v));
    return Array.isArray(p) ? p : [];
  } catch {
    return [];
  }
};

/**
 * Every lookup carries the whole owner, scope included: `user_id` would mean a
 * different table if another scope ever shares this store.
 */
const OWNER_SQL = 'scope = ? AND company_id <=> ? AND user_id = ? AND deleted_at IS NULL';
const ownerArgs = (o: AgentOwner) => [o.scope, o.company_id, o.user_id];

@Injectable()
export class ConversationStore {
  constructor(private readonly db: Db) {}

  async findOne(owner: AgentOwner, id: number): Promise<ConversationRow> {
    const row = await this.db.one<any>(`SELECT * FROM ai_conversations WHERE id = ? AND ${OWNER_SQL}`, [id, ...ownerArgs(owner)]);
    if (!row) throw new NotFoundException('Conversation not found');
    return { ...row, id: Number(row.id), turns: parseTurns(row.turns) };
  }

  async list(owner: AgentOwner, limit = 30) {
    const rows = await this.db.all<any>(
      `SELECT id, title, message_count, last_message_at, created_at FROM ai_conversations WHERE ${OWNER_SQL}
       ORDER BY last_message_at DESC, id DESC LIMIT ?`,
      [...ownerArgs(owner), Math.min(Math.max(limit, 1), 100)],
    );
    return rows.map((r) => ({ ...r, id: Number(r.id) }));
  }

  async create(owner: AgentOwner, title: string): Promise<ConversationRow> {
    const r = await this.db.run(
      `INSERT INTO ai_conversations (scope, company_id, user_id, title, turns, message_count, last_message_at) VALUES (?, ?, ?, ?, '[]', 0, NOW())`,
      [owner.scope, owner.company_id, owner.user_id, title.slice(0, 255)],
    );
    return { id: r.insertId, title: title.slice(0, 255), turns: [], message_count: 0, last_message_at: null, created_at: '' };
  }

  async save(conversation: ConversationRow, turns: AgentTurn[]): Promise<void> {
    await this.db.run('UPDATE ai_conversations SET turns = ?, message_count = ?, last_message_at = NOW() WHERE id = ?', [
      JSON.stringify(stripStaleRaw(turns)),
      turns.filter((t) => t.role === 'user').length,
      conversation.id,
    ]);
  }

  async remove(owner: AgentOwner, id: number): Promise<{ deleted: true }> {
    const row = await this.findOne(owner, id);
    await this.db.run('UPDATE ai_conversations SET deleted_at = NOW() WHERE id = ?', [row.id]);
    return { deleted: true };
  }
}

/**
 * Trim to the last N turns, keeping tool calls paired with their results: a
 * result with no matching call is invalid history, so the cut moves forward to
 * the first user turn at or after the boundary.
 */
export function trimHistory(turns: AgentTurn[], maxTurns: number): AgentTurn[] {
  if (turns.length <= maxTurns) return turns;
  const boundary = turns.length - maxTurns;
  for (let i = boundary; i < turns.length; i++) {
    if (turns[i].role === 'user') return turns.slice(i);
  }
  const lastUser = turns.map((t) => t.role).lastIndexOf('user');
  return lastUser >= 0 ? turns.slice(lastUser) : [];
}

function stripStaleRaw(turns: AgentTurn[]): AgentTurn[] {
  const cutoff = turns.length - KEEP_RAW_TURNS;
  return turns.map((turn, i) => {
    if (i >= cutoff || !turn.raw) return turn;
    const { raw: _raw, provider: _provider, ...rest } = turn;
    return rest;
  });
}

/** The client never needs the provider blocks. */
export function publicTurns(turns: AgentTurn[] | null): Array<Record<string, any>> {
  return (turns ?? [])
    .filter((t) => t.role !== 'tool')
    .map((t) => ({ role: t.role, text: t.text ?? '', tools: (t.tool_calls ?? []).map((c) => c.name) }))
    .filter((t) => t.text || t.tools.length);
}

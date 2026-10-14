import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Response } from 'express';
import { Db } from '../db/db.service';
import { fileKeys, saveImages, sendImage } from '../common/uploads';

export const SUPPORT_TOPICS = ['payment', 'problem', 'question', 'feature', 'other'] as const;
export const SUPPORT_STATUSES = ['open', 'answered', 'closed'] as const;

const n = (v: unknown) => Number(v ?? 0);

/**
 * Help requests from shops to the JGasFlow team. Each request is a short
 * thread: the shop writes, the team answers, either side can add screenshots.
 */
@Injectable()
export class SupportService {
  constructor(private readonly db: Db) {}

  private messages(requestId: number) {
    return this.db
      .all<any>(
        `SELECT m.id, m.from_admin, m.body, m.files, m.created_at, u.name AS author
         FROM support_messages m LEFT JOIN users u ON u.id = m.user_id
         WHERE m.request_id = ? ORDER BY m.id`,
        [requestId],
      )
      .then((rows) => rows.map(({ files, ...m }) => ({ ...m, from_admin: !!m.from_admin, files: fileKeys(files).length })));
  }

  private async addMessage(requestId: number, tenantId: number, userId: number, fromAdmin: boolean, body: string, files?: Express.Multer.File[]) {
    const keys = saveImages(files, 'support', tenantId);
    if (!body.trim() && !keys.length) throw new BadRequestException('Write a message or attach a screenshot');
    await this.db.run('INSERT INTO support_messages (request_id, tenant_id, user_id, from_admin, body, files) VALUES (?, ?, ?, ?, ?, ?)', [
      requestId,
      tenantId,
      userId,
      fromAdmin ? 1 : 0,
      body.trim(),
      JSON.stringify(keys),
    ]);
  }

  // ───── shop side

  async list(tenantId: number) {
    const rows = await this.db.all<any>(
      `SELECT r.*, (SELECT COUNT(*) FROM support_messages m WHERE m.request_id = r.id) AS messages
       FROM support_requests r WHERE r.tenant_id = ? ORDER BY r.updated_at DESC, r.id DESC LIMIT 100`,
      [tenantId],
    );
    return rows.map((r) => ({ ...r, messages: n(r.messages) }));
  }

  async open(tenantId: number, userId: number, b: { subject: string; topic: string; message: string }, files?: Express.Multer.File[]) {
    const recent = await this.db.one<any>("SELECT COUNT(*) AS c FROM support_requests WHERE tenant_id = ? AND created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)", [tenantId]);
    if (n(recent?.c) >= 10) throw new BadRequestException('Too many requests in one hour. Please wait, or reply in an open request.');
    const r = await this.db.run('INSERT INTO support_requests (tenant_id, created_by, subject, topic) VALUES (?, ?, ?, ?)', [tenantId, userId, b.subject, b.topic]);
    try {
      await this.addMessage(r.insertId, tenantId, userId, false, b.message, files);
    } catch (e) {
      await this.db.run('DELETE FROM support_requests WHERE id = ?', [r.insertId]);
      throw e;
    }
    return this.get(r.insertId, tenantId);
  }

  /** One request with its thread; `tenantId` limits a shop to its own requests. */
  async get(id: number, tenantId?: number) {
    const r = await this.db.one<any>(
      `SELECT r.*, t.name AS shop_name, t.phone AS shop_phone, u.name AS opened_by
       FROM support_requests r JOIN tenants t ON t.id = r.tenant_id LEFT JOIN users u ON u.id = r.created_by WHERE r.id = ?`,
      [id],
    );
    if (!r || (tenantId != null && r.tenant_id !== tenantId)) throw new NotFoundException('Request not found');
    return { ...r, thread: await this.messages(id) };
  }

  async reply(id: number, tenantId: number | null, userId: number, fromAdmin: boolean, body: string, files?: Express.Multer.File[], status?: string) {
    const r = await this.get(id, tenantId ?? undefined);
    await this.addMessage(id, r.tenant_id, userId, fromAdmin, body, files);
    const next = status ?? (fromAdmin ? 'answered' : 'open');
    await this.db.run('UPDATE support_requests SET status = ?, last_from = ?, updated_at = NOW() WHERE id = ?', [next, fromAdmin ? 'admin' : 'shop', id]);
    return this.get(id, tenantId ?? undefined);
  }

  async setStatus(id: number, status: string) {
    const r = await this.db.run('UPDATE support_requests SET status = ?, updated_at = NOW() WHERE id = ?', [status, id]);
    if (!r.affectedRows) throw new NotFoundException('Request not found');
    return this.get(id);
  }

  /** Streams screenshot k of message `messageId`, checking the shop when given. */
  async sendFile(res: Response, messageId: number, k: number, tenantId?: number) {
    const m = await this.db.one<any>('SELECT tenant_id, files FROM support_messages WHERE id = ?', [messageId]);
    if (!m || (tenantId != null && m.tenant_id !== tenantId)) throw new NotFoundException('Picture not found');
    sendImage(res, fileKeys(m.files)[k]);
  }

  // ───── console side

  async inbox(q: { status?: string; q?: string; page?: number }) {
    const where: string[] = [];
    const args: unknown[] = [];
    if (q.status && q.status !== 'all') {
      where.push('r.status = ?');
      args.push(q.status);
    }
    if (q.q?.trim()) {
      where.push('(t.name LIKE ? OR r.subject LIKE ? OR t.phone LIKE ?)');
      const like = `%${q.q.trim()}%`;
      args.push(like, like, like);
    }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const limit = 25;
    const page = Math.max(Number(q.page) || 1, 1);
    const total = await this.db.one<any>(`SELECT COUNT(*) AS c FROM support_requests r JOIN tenants t ON t.id = r.tenant_id ${w}`, args);
    const items = await this.db.all<any>(
      `SELECT r.*, t.name AS shop_name, t.phone AS shop_phone, u.name AS opened_by,
         (SELECT COUNT(*) FROM support_messages m WHERE m.request_id = r.id) AS messages,
         (SELECT SUBSTRING(m.body, 1, 160) FROM support_messages m WHERE m.request_id = r.id ORDER BY m.id DESC LIMIT 1) AS last_message
       FROM support_requests r JOIN tenants t ON t.id = r.tenant_id LEFT JOIN users u ON u.id = r.created_by
       ${w} ORDER BY r.status = 'open' DESC, r.updated_at DESC LIMIT ? OFFSET ?`,
      [...args, limit, (page - 1) * limit],
    );
    const counts = await this.db.all<any>('SELECT status, COUNT(*) AS c FROM support_requests GROUP BY status');
    return {
      items: items.map((r) => ({ ...r, messages: n(r.messages) })),
      total: n(total?.c),
      page,
      total_pages: Math.max(1, Math.ceil(n(total?.c) / limit)),
      counts: Object.fromEntries(counts.map((c) => [c.status, n(c.c)])),
    };
  }

  async openCount() {
    const r = await this.db.one<any>("SELECT COUNT(*) AS c FROM support_requests WHERE status = 'open'");
    return n(r?.c);
  }
}

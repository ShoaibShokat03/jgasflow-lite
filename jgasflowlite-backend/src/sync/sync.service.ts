import { BadRequestException, Injectable } from '@nestjs/common';
import { Db, Q } from '../db/db.service';
import { withWriter, Writer } from '../db/writer';
import { Col, dataCols, SALESMAN_MOVE_REASONS, SALESMAN_TABLES, TABLE, TABLES, TableSpec } from '../db/tables';
import { AuthUser, tid } from '../auth/auth.decorators';
import { SHOP_FIELDS, shopOut } from '../auth/auth.service';
import { subscriptionOf } from '../billing/plans';
import { networkInterfaces } from 'os';
import { ENV } from '../config/env';
import { round2 } from '../common/util';

export type Row = Record<string, any>;

export interface Rejected {
  table: string;
  uid: string;
  reason: 'older' | 'forbidden' | 'invalid';
  /** Current server copy so the phone can take it back. */
  row: Row | null;
}

const PROFILE_FIELDS = ['name', 'owner_name', 'phone', 'address', 'currency', 'receipt_note'] as const;
const CHUNK = 400;

/** Coerce one incoming value to the column type (phones send SQLite values). */
function coerce(c: Col, v: any): any {
  switch (c.kind) {
    case 'str':
      return v == null ? '' : String(v).slice(0, c.len ?? 120);
    case 'text':
      return v == null ? null : String(v).slice(0, 5000);
    case 'int':
      if (v == null || v === '') return c.nullable ? null : 0;
      return Math.trunc(Number(v)) || 0;
    case 'money':
    case 'num':
      return round2(Number(v) || 0);
    case 'bool':
      return v === true || v === 1 || v === '1' ? 1 : v === false || v === 0 || v === '0' ? 0 : 1;
    case 'date':
      if (v == null || v === '') return c.nullable ? null : '';
      return String(v).slice(0, 19);
    case 'uid':
      return v == null || v === '' ? null : String(v).slice(0, 64);
  }
}

/** Row as sent to phones: data columns + uid, updated_at, deleted. */
function rowOut(t: TableSpec, r: Row): Row {
  const o: Row = { uid: r.uid, updated_at: Number(r.updated_at), deleted: r.deleted ? 1 : 0 };
  for (const c of dataCols(t)) o[c.name] = r[c.name];
  return o;
}

@Injectable()
export class SyncService {
  constructor(private readonly db: Db) {}

  private async shopState(q: Q, tenantId: number) {
    const t = await q.one<any>(`SELECT ${SHOP_FIELDS}, seq FROM tenants WHERE id = ?`, [tenantId]);
    return { shop: shopOut(t), subscription: subscriptionOf(t), version: Number(t.seq) };
  }

  private allowed(u: AuthUser, table: string, r: Row): boolean {
    if (u.role !== 'salesman') return true;
    if (!SALESMAN_TABLES.has(table)) return false;
    if (r.deleted) return false;
    if ((table === 'stock_moves' || table === 'held_moves') && !SALESMAN_MOVE_REASONS.has(String(r.reason))) return false;
    return true;
  }

  /**
   * Upsert rows into one table. mode 'lww' keeps the newer updated_at;
   * 'force' always takes the incoming row (import replace).
   */
  /**
   * skew: server clock minus the phone's clock (ms). Phone times are moved
   * onto the server clock so a phone whose clock runs a little behind does
   * not lose its newer edits and deletes.
   */
  private async upsert(w: Writer, u: AuthUser | null, table: string, rows: Row[], mode: 'lww' | 'force', rejected: Rejected[], skew = 0) {
    const spec = TABLE[table];
    const cols = dataCols(spec);
    let accepted = 0;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK).filter((r) => r && typeof r.uid === 'string' && r.uid.length >= 8 && r.uid.length <= 64);
      if (!chunk.length) continue;
      const existing = await w.q.all<any>(`SELECT * FROM ${table} WHERE tenant_id = ? AND uid IN (?)`, [w.tenantId, chunk.map((r) => r.uid)]);
      const byUid = new Map(existing.map((e) => [e.uid, e]));
      const values: any[][] = [];
      const seen = new Set<string>();
      for (const r of chunk) {
        if (seen.has(r.uid)) continue;
        seen.add(r.uid);
        const ex = byUid.get(r.uid);
        if (u && !this.allowed(u, table, r)) {
          rejected.push({ table, uid: r.uid, reason: 'forbidden', row: ex ? rowOut(spec, ex) : null });
          continue;
        }
        const raw = Math.trunc(Number(r.updated_at));
        // Untouched standard rows (updated_at 1) stay the oldest version.
        const updatedAt = raw > 1 ? raw + skew : raw === 1 ? 1 : Date.now();
        if (mode === 'lww' && ex && Number(ex.updated_at) > updatedAt) {
          rejected.push({ table, uid: r.uid, reason: 'older', row: rowOut(spec, ex) });
          continue;
        }
        const deleted = r.deleted ? 1 : 0;
        // A delete for a row the server never had: nothing to tell other devices.
        if (deleted && !ex) continue;
        const vals: any[] = [];
        for (const c of cols) {
          if (c.name === 'no') {
            const no = r.no != null ? Math.trunc(Number(r.no)) || null : (ex?.no ?? null);
            vals.push(no);
          } else {
            vals.push(deleted && ex && r[c.name] === undefined ? ex[c.name] : coerce(c, r[c.name]));
          }
        }
        values.push([r.uid, vals, mode === 'force' ? Math.max(updatedAt, Date.now()) : updatedAt, deleted]);
      }
      if (!values.length) continue;

      // Document numbers: keep ones from phones, give new ones to rows without.
      if (spec.doc) {
        const noIdx = 0;
        for (const v of values) {
          const no = v[1][noIdx];
          if (no) await w.seenNo(spec.doc, no);
        }
        for (const v of values) if (!v[1][noIdx] && !v[3]) v[1][noIdx] = await w.nextNo(spec.doc);
      }

      const first = await w.reserve(values.length);
      const names = ['tenant_id', 'uid', ...cols.map((c) => c.name), 'version', 'updated_at', 'deleted', 'by_user'];
      const params: any[] = [];
      values.forEach((v, k) => params.push([w.tenantId, v[0], ...v[1], first + k, v[2], v[3], u?.id ?? null]));
      const upd = names.filter((n) => n !== 'tenant_id' && n !== 'uid').map((n) => `${n} = VALUES(${n})`);
      await w.q.run(`INSERT INTO ${table} (${names.join(', ')}) VALUES ? ON DUPLICATE KEY UPDATE ${upd.join(', ')}`, [params]);
      accepted += values.length;
    }
    return accepted;
  }

  private async applyProfile(w: Writer, u: AuthUser | null, p: Row | undefined, force = false) {
    if (!p || typeof p !== 'object') return;
    if (u && u.role === 'salesman') return;
    const t = await w.q.one<any>('SELECT profile_updated_at FROM tenants WHERE id = ?', [w.tenantId]);
    const at = Math.trunc(Number(p.updated_at)) || 0;
    if (!force && at <= Number(t?.profile_updated_at ?? 0)) return;
    const name = String(p.name ?? '').trim();
    if (!name) return;
    const vals = PROFILE_FIELDS.map((f) => String(p[f] ?? '').trim().slice(0, f === 'address' || f === 'receipt_note' ? 255 : f === 'currency' ? 10 : 120));
    await w.q.run(`UPDATE tenants SET ${PROFILE_FIELDS.map((f) => `${f} = ?`).join(', ')}, profile_updated_at = ? WHERE id = ?`, [
      ...vals,
      force ? Math.max(at, Date.now()) : at,
      w.tenantId,
    ]);
  }

  /** Phone sends its changed rows; newer edit wins per row. */
  async push(u: AuthUser, body: { changes?: Record<string, Row[]>; profile?: Row; client_now?: number }) {
    const skew = clockSkew(body.client_now);
    const changes = body.changes ?? {};
    for (const k of Object.keys(changes)) if (!TABLE[k] || !Array.isArray(changes[k])) throw new BadRequestException(`Unknown table ${k}`);
    const rejected: Rejected[] = [];
    let accepted = 0;
    await withWriter(this.db, tid(u), u.id, async (w) => {
      await this.applyProfile(w, u, body.profile ? { ...body.profile, updated_at: Number(body.profile.updated_at) + skew } : undefined);
      for (const t of TABLES) if (changes[t.name]?.length) accepted += await this.upsert(w, u, t.name, changes[t.name], 'lww', rejected, skew);
    });
    await this.db.run('UPDATE sessions SET last_sync_at = NOW() WHERE id = ?', [u.sessionId]);
    const state = await this.shopState(this.db, tid(u));
    return { ok: true, accepted, rejected, ...state, server_time: Date.now() };
  }

  /**
   * Changes after `since`, oldest first. Pages are cut on a version boundary so
   * nothing is skipped; `more` says to call again with the returned version.
   */
  async pull(u: AuthUser, since: number, limit: number) {
    const t = tid(u);
    const per: Record<string, any[]> = {};
    let cutoff = Infinity;
    for (const spec of TABLES) {
      const rows = await this.db.all<any>(`SELECT * FROM ${spec.name} WHERE tenant_id = ? AND version > ? ORDER BY version LIMIT ?`, [t, since, limit]);
      per[spec.name] = rows;
      if (rows.length === limit) cutoff = Math.min(cutoff, Number(rows[rows.length - 1].version));
    }
    const state = await this.shopState(this.db, t);
    const upTo = cutoff === Infinity ? state.version : cutoff;
    const changes: Record<string, Row[]> = {};
    let count = 0;
    for (const spec of TABLES) {
      const rows = per[spec.name].filter((r) => Number(r.version) <= upTo).map((r) => rowOut(spec, r));
      if (rows.length) changes[spec.name] = rows;
      count += rows.length;
    }
    await this.db.run('UPDATE sessions SET last_sync_at = NOW() WHERE id = ?', [u.sessionId]);
    return { changes, count, more: upTo < state.version, ...state, version: upTo, role: u.role, server_time: Date.now() };
  }

  /** Full copy of the shop (live rows only). Works even when the plan has expired. */
  async exportAll(u: AuthUser) {
    const t = tid(u);
    const tables: Record<string, Row[]> = {};
    for (const spec of TABLES) {
      const rows = await this.db.all<any>(`SELECT * FROM ${spec.name} WHERE tenant_id = ? AND deleted = 0 ORDER BY id`, [t]);
      tables[spec.name] = rows.map((r) => {
        const o = rowOut(spec, r);
        delete o.deleted;
        return o;
      });
    }
    const state = await this.shopState(this.db, t);
    return {
      format: 'jgasflow-data',
      schema: 1,
      exported_at: new Date().toISOString(),
      shop: state.shop,
      version: state.version,
      tables,
    };
  }

  /**
   * Bring a full data file in.
   * - replace: the file becomes the shop's data (everything else is deleted).
   * - merge: rows are added; where both have the same record, the newer edit wins.
   */
  async importAll(u: AuthUser, mode: 'replace' | 'merge', snap: any) {
    if (!snap || typeof snap !== 'object' || snap.format !== 'jgasflow-data' || typeof snap.tables !== 'object') {
      throw new BadRequestException('This is not a JGasFlow data file');
    }
    const tables: Record<string, Row[]> = snap.tables;
    for (const k of Object.keys(tables)) if (!TABLE[k] || !Array.isArray(tables[k])) throw new BadRequestException(`Unknown table ${k} in file`);
    const rejected: Rejected[] = [];
    let accepted = 0;
    await withWriter(this.db, tid(u), u.id, async (w) => {
      if (mode === 'replace') {
        for (const spec of TABLES) {
          const keep = new Set((tables[spec.name] ?? []).map((r) => r.uid));
          const live = await w.q.all<{ uid: string }>(`SELECT uid FROM ${spec.name} WHERE tenant_id = ? AND deleted = 0`, [w.tenantId]);
          const gone = live.map((r) => r.uid).filter((x) => !keep.has(x));
          for (let i = 0; i < gone.length; i += CHUNK) {
            const part = gone.slice(i, i + CHUNK);
            const first = await w.reserve(part.length);
            await w.q.run('SET @v = ?', [first - 1]);
            await w.q.run(`UPDATE ${spec.name} SET deleted = 1, version = (@v := @v + 1), updated_at = ? WHERE tenant_id = ? AND uid IN (?)`, [Date.now(), w.tenantId, part]);
          }
        }
        await w.resetDocCounters();
      }
      await this.applyProfile(w, u, snap.shop ? { ...snap.shop, updated_at: snap.shop.profile_updated_at } : undefined, mode === 'replace');
      for (const spec of TABLES) {
        const rows = (tables[spec.name] ?? []).map((r) => ({ ...r, deleted: 0 }));
        if (rows.length) accepted += await this.upsert(w, null, spec.name, rows, mode === 'replace' ? 'force' : 'lww', rejected);
      }
    });
    const state = await this.shopState(this.db, tid(u));
    return { ok: true, accepted, skipped: rejected.length, ...state };
  }

  async status(u: AuthUser) {
    const t = tid(u);
    const counts: Record<string, number> = {};
    for (const spec of TABLES) {
      const r = await this.db.one<any>(`SELECT COUNT(*) AS n FROM ${spec.name} WHERE tenant_id = ? AND deleted = 0`, [t]);
      counts[spec.name] = Number(r?.n ?? 0);
    }
    const devices = await this.db.all<any>(
      `SELECT s.id, s.client, s.device, s.last_seen_at, s.last_sync_at, u.name AS user_name, u.role FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE u.tenant_id = ? AND s.revoked = 0 AND s.expires_at > NOW() AND s.client = 'mobile' ORDER BY s.last_sync_at DESC`,
      [t],
    );
    // Addresses a phone on the same Wi-Fi can use (local setups).
    const lan = Object.values(networkInterfaces())
      .flat()
      .filter((n) => n && n.family === 'IPv4' && !n.internal)
      .map((n) => `http://${n!.address}:${ENV.port}`);
    return { ...(await this.shopState(this.db, t)), counts, devices, lan };
  }
}

/** Server minus phone clock; ignored when missing or absurd (over 1 day). */
function clockSkew(clientNow?: number): number {
  const c = Math.trunc(Number(clientNow));
  if (!c) return 0;
  const d = Date.now() - c;
  return Math.abs(d) > 86400000 ? 0 : d;
}

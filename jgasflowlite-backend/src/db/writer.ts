import { NotFoundException } from '@nestjs/common';
import type { Db, Q } from './db.service';
import { dataCols, TABLE } from './tables';
import { newUid } from '../common/util';

const DOC_COUNTER = { S: 'no_s', P: 'no_p', R: 'no_r' } as const;

/**
 * Versioned writes for one shop inside one transaction.
 *
 * The shop row is locked (SELECT ... FOR UPDATE) on first use, so versions are
 * handed out strictly in commit order and a pull never skips a change.
 * Every changed row gets the next version; pull returns rows with version > since.
 */
export class Writer {
  private seq = 0;
  private counters = { no_s: 0, no_p: 0, no_r: 0 };
  private locked = false;
  private dirty = false;

  constructor(
    readonly q: Q,
    readonly tenantId: number,
    readonly userId: number | null,
  ) {}

  private async lock() {
    if (this.locked) return;
    const t = await this.q.one<any>('SELECT seq, no_s, no_p, no_r FROM tenants WHERE id = ? FOR UPDATE', [this.tenantId]);
    if (!t) throw new NotFoundException('Shop not found');
    this.seq = Number(t.seq);
    this.counters = { no_s: t.no_s, no_p: t.no_p, no_r: t.no_r };
    this.locked = true;
  }

  async next(): Promise<number> {
    await this.lock();
    this.dirty = true;
    return ++this.seq;
  }

  /** Next document number (S-00001 ...). */
  async nextNo(prefix: 'S' | 'P' | 'R'): Promise<number> {
    await this.lock();
    this.dirty = true;
    return ++this.counters[DOC_COUNTER[prefix]];
  }

  /** Keep the counter ahead of numbers that arrive from phones or imports. */
  async seenNo(prefix: 'S' | 'P' | 'R', no: number) {
    await this.lock();
    const k = DOC_COUNTER[prefix];
    if (no > this.counters[k]) {
      this.counters[k] = no;
      this.dirty = true;
    }
  }

  /** After a full replace, numbering restarts from the numbers in the file. */
  async resetDocCounters() {
    await this.lock();
    this.counters = { no_s: 0, no_p: 0, no_r: 0 };
    this.dirty = true;
  }

  /** Reserve n consecutive versions; returns the first. */
  async reserve(n: number): Promise<number> {
    await this.lock();
    this.dirty = true;
    const first = this.seq + 1;
    this.seq += n;
    return first;
  }

  async currentVersion(): Promise<number> {
    await this.lock();
    return this.seq;
  }

  async flush() {
    if (!this.dirty) return;
    await this.q.run('UPDATE tenants SET seq = ?, no_s = ?, no_p = ?, no_r = ?, last_active_at = NOW() WHERE id = ?', [
      this.seq,
      this.counters.no_s,
      this.counters.no_p,
      this.counters.no_r,
      this.tenantId,
    ]);
    this.dirty = false;
  }

  /** Insert a new row; returns its uid. Unknown keys are ignored. */
  async insert(table: string, row: Record<string, any>): Promise<string> {
    const spec = TABLE[table];
    const uid = row.uid || newUid();
    const vals: Record<string, any> = {};
    for (const c of dataCols(spec)) if (row[c.name] !== undefined) vals[c.name] = row[c.name];
    if (spec.doc && !vals.no) vals.no = await this.nextNo(spec.doc);
    const version = await this.next();
    const cols = ['tenant_id', 'uid', ...Object.keys(vals), 'version', 'updated_at', 'deleted', 'by_user'];
    const params = [this.tenantId, uid, ...Object.values(vals), version, Date.now(), 0, this.userId];
    await this.q.run(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`, params);
    return uid;
  }

  /** Insert or revive a row with a fixed uid (customer prices). */
  async put(table: string, uid: string, row: Record<string, any>) {
    const exists = await this.q.one(`SELECT id FROM ${table} WHERE tenant_id = ? AND uid = ?`, [this.tenantId, uid]);
    if (exists) await this.update(table, uid, { ...row, deleted: 0 });
    else await this.insert(table, { ...row, uid });
  }

  async update(table: string, uid: string, patch: Record<string, any>) {
    const spec = TABLE[table];
    const allowed = new Set([...dataCols(spec).map((c) => c.name), 'deleted']);
    const keys = Object.keys(patch).filter((k) => allowed.has(k) && patch[k] !== undefined);
    const version = await this.next();
    const sets = [...keys.map((k) => `${k} = ?`), 'version = ?', 'updated_at = ?', 'by_user = ?'];
    const r = await this.q.run(`UPDATE ${table} SET ${sets.join(', ')} WHERE tenant_id = ? AND uid = ?`, [
      ...keys.map((k) => patch[k]),
      version,
      Date.now(),
      this.userId,
      this.tenantId,
      uid,
    ]);
    if (!r.affectedRows) throw new NotFoundException('Record not found');
  }

  /** Tombstone one row. */
  remove(table: string, uid: string) {
    return this.update(table, uid, { deleted: 1 });
  }

  /** Tombstone every live row where col = value. */
  async removeWhere(table: string, col: string, value: string) {
    const rows = await this.q.all<{ uid: string }>(`SELECT uid FROM ${table} WHERE tenant_id = ? AND ${col} = ? AND deleted = 0`, [this.tenantId, value]);
    for (const r of rows) await this.remove(table, r.uid);
  }
}

/** Run fn in a transaction with a Writer for this shop; counters are saved before commit. */
export function withWriter<T>(db: Db, tenantId: number, userId: number | null, fn: (w: Writer) => Promise<T>): Promise<T> {
  return db.tx(async (q) => {
    const w = new Writer(q, tenantId, userId);
    const out = await fn(w);
    await w.flush();
    return out;
  });
}

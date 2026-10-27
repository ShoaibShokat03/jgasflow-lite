import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Db, Q } from '../db/db.service';
import { withWriter, Writer } from '../db/writer';
import { addDays, docNo, normDate, round2, todayKey, toDb } from '../common/util';
import { AuthUser, tid } from '../auth/auth.decorators';
import { MoneyService } from '../accounts/money.service';
import { CUST_BAL, CUST_HELD, out, PUR_ITEMS_TEXT, SALE_ITEMS_TEXT, STOCK_JOIN, SUP_BAL } from './gas.sql';

export interface TypeIn {
  name: string;
  kg: number;
  price: number;
  wholesale_price: number;
  purchase_price: number;
  deposit: number;
  low_level: number;
  sort: number;
  active: boolean;
  /** 'kg' = loose gas sold by weight; '' = cylinders. Fixed once the type is made. */
  unit?: string;
  full_qty?: number;
  empty_qty?: number;
  /** Opening loose gas in kg (kg types). */
  gas_kg?: number;
}
export interface PartyIn {
  name: string;
  phone: string;
  address: string;
  type?: string;
  opening_balance: number;
  note: string;
}
export interface SaleIn {
  customer_uid?: string | null;
  date?: string;
  /** kg: weight for loose gas lines. */
  lines: { type_uid: string; qty: number; empty: number; price: number; kg?: number }[];
  charge_deposit: boolean;
  discount: number;
  paid: number;
  method: string;
  /** Cash/bank account chosen on the web (the method is then taken from it). */
  money_id?: number;
  note: string;
}
export interface PurchaseIn {
  supplier_uid?: string | null;
  date?: string;
  lines: { type_uid: string; qty: number; empty_sent: number; price: number }[];
  paid: number;
  method: string;
  money_id?: number;
  note: string;
  update_prices: boolean;
}

/** Inclusive day range ('yyyy-MM-dd') to [from, to) db strings. */
export function range(from?: string, to?: string): [string, string] {
  const f = from && /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : '0000-00-00';
  const t = to && /^\d{4}-\d{2}-\d{2}$/.test(to) ? addDays(to, 1) : '9999-12-31';
  return [f, t];
}

/**
 * The shop's business logic, ported from the mobile app's Repo (lib/data/repo.dart).
 * Same rules, so a record made on the web and one made on a phone look identical.
 */
/** Rows per list: the screen default, or up to 50,000 for an export of all records. */
const cap = (limit: number | undefined, def: number) => Math.min(Math.max(Math.trunc(limit ?? def) || def, 1), 50000);

@Injectable()
export class GasService {
  constructor(
    private readonly db: Db,
    private readonly money: MoneyService,
  ) {}

  /**
   * The cash/bank account of a payment: the one chosen, else where its method
   * lands. Money going out is checked so the account never goes below zero.
   */
  private async payFrom(t: number, b: { amount: number; method: string; money_id?: number; date: string }, out: boolean) {
    const acc = b.money_id ? await this.money.resolve(t, b.money_id) : null;
    const method = acc?.method ?? b.method;
    if (out && b.amount > 0) {
      const id = acc?.id ?? (await this.money.routeId(t, method));
      if (id) await this.money.verify(t, [{ id, date: b.date.slice(0, 10), amount: -round2(b.amount) }]);
    }
    return { method, moneyId: acc?.id };
  }

  private write<T>(u: AuthUser, fn: (w: Writer) => Promise<T>) {
    return withWriter(this.db, tid(u), u.id, fn);
  }

  // ───────────── cylinder types / stock ─────────────

  async types(t: number, all = false, q: Q = this.db) {
    const rows = await q.all<any>(
      `SELECT t.*, IFNULL(sm.f, 0) AS full_qty, IFNULL(sm.e, 0) AS empty_qty, IFNULL(sm.k, 0) AS gas_kg, IFNULL(hm.q, 0) AS with_customers, IFNULL(hm.d, 0) AS deposit_held
       FROM cylinder_types t ${STOCK_JOIN}
       WHERE t.tenant_id = ? AND t.deleted = 0 ${all ? '' : 'AND t.active = 1'}
       ORDER BY t.active DESC, t.sort, t.kg`,
      [t, t, t],
    );
    return rows.map((r) => {
      const byKg = r.unit === 'kg';
      const gasKg = round2(Number(r.gas_kg));
      return {
        ...out(r),
        unit: byKg ? 'kg' : '',
        full_qty: Number(r.full_qty),
        empty_qty: Number(r.empty_qty),
        gas_kg: gasKg,
        with_customers: Number(r.with_customers),
        deposit_held: Number(r.deposit_held),
        active: !!r.active,
        is_low: byKg ? gasKg <= r.low_level : Number(r.full_qty) <= r.low_level,
      };
    });
  }

  private async typeRow(q: Q, t: number, uid: string) {
    const r = await q.one<any>('SELECT * FROM cylinder_types WHERE tenant_id = ? AND uid = ? AND deleted = 0', [t, uid]);
    if (!r) throw new NotFoundException('Cylinder type not found');
    return r;
  }

  private async stockOf(q: Q, t: number, typeUid: string) {
    const r = await q.one<any>(
      'SELECT IFNULL(SUM(full_delta),0) AS f, IFNULL(SUM(empty_delta),0) AS e, IFNULL(SUM(kg_delta),0) AS k FROM stock_moves WHERE tenant_id = ? AND type_uid = ? AND deleted = 0',
      [t, typeUid],
    );
    return { full: Number(r?.f ?? 0), empty: Number(r?.e ?? 0), kg: round2(Number(r?.k ?? 0)) };
  }

  /** kg: loose gas in (+) or out (-) for kg types. */
  private move(w: Writer, typeUid: string, full: number, empty: number, reason: string, date: string, ref = '', kg = 0) {
    kg = round2(kg);
    if (!full && !empty && !kg) return Promise.resolve();
    return w.insert('stock_moves', { type_uid: typeUid, date, full_delta: full, empty_delta: empty, reason, ref, kg_delta: kg });
  }

  private logPrice(w: Writer, typeUid: string, kind: string, old: number, price: number, date: string, note = '') {
    return w.insert('price_history', { type_uid: typeUid, kind, old_price: old, price, date, note });
  }

  async saveType(u: AuthUser, b: TypeIn, uid?: string) {
    const now = toDb();
    const byKg = b.unit === 'kg';
    const fields: Record<string, unknown> = {
      name: b.name,
      kg: byKg ? 0 : b.kg,
      price: b.price,
      wholesale_price: b.wholesale_price,
      purchase_price: b.purchase_price,
      // Loose gas has no cylinder, so no security.
      deposit: byKg ? 0 : b.deposit,
      low_level: b.low_level,
      sort: b.sort,
      active: b.active ? 1 : 0,
    };
    return this.write(u, async (w) => {
      if (!uid) {
        const id = await w.insert('cylinder_types', { ...fields, unit: byKg ? 'kg' : '' });
        await this.logPrice(w, id, 'sale', 0, b.price, now, 'opening');
        if (byKg) await this.move(w, id, 0, 0, 'opening', now, '', b.gas_kg ?? 0);
        else await this.move(w, id, b.full_qty ?? 0, b.empty_qty ?? 0, 'opening', now);
        return { uid: id };
      }
      const old = await this.typeRow(w.q, w.tenantId, uid);
      // The unit never changes after the type is made (old bills depend on it).
      if (old.unit === 'kg') {
        fields.kg = 0;
        fields.deposit = 0;
      }
      await w.update('cylinder_types', uid, fields);
      if (old.price !== b.price) await this.logPrice(w, uid, 'sale', old.price, b.price, now);
      if (old.wholesale_price !== b.wholesale_price) await this.logPrice(w, uid, 'wholesale', old.wholesale_price, b.wholesale_price, now);
      if (old.purchase_price !== b.purchase_price) await this.logPrice(w, uid, 'purchase', old.purchase_price, b.purchase_price, now);
      return { uid };
    });
  }

  setPrices(u: AuthUser, uid: string, b: { sale?: number; wholesale?: number; purchase?: number; note: string; date?: string }) {
    const when = normDate(b.date) ?? toDb();
    return this.write(u, async (w) => {
      const old = await this.typeRow(w.q, w.tenantId, uid);
      const upd: Record<string, number> = {};
      if (b.sale != null && b.sale !== old.price) {
        upd.price = b.sale;
        await this.logPrice(w, uid, 'sale', old.price, b.sale, when, b.note);
      }
      if (b.wholesale != null && b.wholesale !== old.wholesale_price) {
        upd.wholesale_price = b.wholesale;
        await this.logPrice(w, uid, 'wholesale', old.wholesale_price, b.wholesale, when, b.note);
      }
      if (b.purchase != null && b.purchase !== old.purchase_price) {
        upd.purchase_price = b.purchase;
        await this.logPrice(w, uid, 'purchase', old.purchase_price, b.purchase, when, b.note);
      }
      if (Object.keys(upd).length) await w.update('cylinder_types', uid, upd);
      return { ok: true, changed: Object.keys(upd).length };
    });
  }

  async priceHistory(t: number, typeUid?: string, limit?: number) {
    const rows = await this.db.all<any>(
      `SELECT h.*, t.name AS type_name FROM price_history h
       JOIN cylinder_types t ON t.tenant_id = h.tenant_id AND t.uid = h.type_uid
       WHERE h.tenant_id = ? AND h.deleted = 0 ${typeUid ? 'AND h.type_uid = ?' : ''}
       ORDER BY h.date DESC, h.id DESC LIMIT ${cap(limit, 500)}`,
      typeUid ? [t, typeUid] : [t],
    );
    return rows.map(out);
  }

  private async typeHasHistory(q: Q, t: number, uid: string) {
    const r = await q.one<any>(
      `SELECT (SELECT COUNT(*) FROM sale_items WHERE tenant_id = ? AND type_uid = ? AND deleted = 0)
            + (SELECT COUNT(*) FROM purchase_items WHERE tenant_id = ? AND type_uid = ? AND deleted = 0)
            + (SELECT COUNT(*) FROM cylinder_returns WHERE tenant_id = ? AND type_uid = ? AND deleted = 0)
            + (SELECT COUNT(*) FROM (SELECT customer_uid FROM held_moves WHERE tenant_id = ? AND type_uid = ? AND deleted = 0
                GROUP BY customer_uid HAVING SUM(qty_delta) <> 0 OR SUM(deposit_delta) <> 0) x) AS n`,
      [t, uid, t, uid, t, uid, t, uid],
    );
    return Number(r?.n ?? 0) > 0;
  }

  /** Deletes an unused type; a type with history is hidden instead so old bills stay correct. */
  deleteType(u: AuthUser, uid: string) {
    return this.write(u, async (w) => {
      await this.typeRow(w.q, w.tenantId, uid);
      const used = await this.typeHasHistory(w.q, w.tenantId, uid);
      if (used) {
        await w.update('cylinder_types', uid, { active: 0 });
      } else {
        for (const table of ['price_history', 'stock_moves', 'customer_prices', 'held_moves']) await w.removeWhere(table, 'type_uid', uid);
        await w.remove('cylinder_types', uid);
      }
      return { deleted: !used, hidden: used };
    });
  }

  /** Set absolute full/empty counts, or kg of loose gas (stock count / correction). */
  setStock(u: AuthUser, uid: string, full: number, empty: number, note: string, kg?: number) {
    return this.write(u, async (w) => {
      const ty = await this.typeRow(w.q, w.tenantId, uid);
      const cur = await this.stockOf(w.q, w.tenantId, uid);
      if (ty.unit === 'kg') await this.move(w, uid, 0, 0, 'adjust', toDb(), note, (kg ?? 0) - cur.kg);
      else await this.move(w, uid, full - cur.full, empty - cur.empty, 'adjust', toDb(), note);
      return { ok: true };
    });
  }

  /**
   * Fill loose gas from full cylinders: `count` full cylinders of `fromUid`
   * become empty and their gas (count x weight) is added to the kg type.
   */
  fillGas(u: AuthUser, uid: string, fromUid: string, count: number, note: string) {
    const now = toDb();
    return this.write(u, async (w) => {
      const t = w.tenantId;
      const gas = await this.typeRow(w.q, t, uid);
      if (gas.unit !== 'kg') throw new BadRequestException('Choose a gas sold by kg');
      const from = await this.typeRow(w.q, t, fromUid);
      if (from.unit === 'kg') throw new BadRequestException('Choose a cylinder');
      const weight = Number(from.kg);
      if (!(weight > 0)) throw new BadRequestException(`Set the weight (kg) of ${from.name} first`);
      if (count < 1) throw new BadRequestException('Enter how many cylinders');
      const inStock = Math.max(0, (await this.stockOf(w.q, t, fromUid)).full);
      if (count > inStock) throw new BadRequestException(`Not enough full ${from.name} cylinders: ${inStock} in stock`);
      const ref = `${count} x ${from.name}`.slice(0, 60);
      await this.move(w, fromUid, -count, count, 'fill', now, `${gas.name}`.slice(0, 60));
      await this.move(w, uid, 0, 0, 'fill', now, note ? `${ref}, ${note}`.slice(0, 60) : ref, count * weight);
      return { ok: true, kg: round2(count * weight) };
    });
  }

  async stockMoves(t: number, typeUid?: string, limit?: number) {
    const rows = await this.db.all<any>(
      `SELECT m.*, t.name AS type_name FROM stock_moves m
       JOIN cylinder_types t ON t.tenant_id = m.tenant_id AND t.uid = m.type_uid
       WHERE m.tenant_id = ? AND m.deleted = 0 ${typeUid ? 'AND m.type_uid = ?' : ''}
       ORDER BY m.date DESC, m.id DESC LIMIT ${cap(limit, 300)}`,
      typeUid ? [t, typeUid] : [t],
    );
    return rows.map(out);
  }

  // ───────────── customers ─────────────

  /** filter: all | retail | wholesale | udhaar */
  async customers(t: number, q = '', filter = 'all') {
    let where = 'c.tenant_id = ? AND c.deleted = 0 AND c.active = 1';
    const args: unknown[] = [t];
    const qq = q.trim();
    if (qq) {
      where += ' AND (c.name LIKE ? OR c.phone LIKE ? OR c.address LIKE ?)';
      args.push(`%${qq}%`, `%${qq}%`, `%${qq}%`);
    }
    if (filter === 'retail' || filter === 'wholesale') {
      where += ' AND c.type = ?';
      args.push(filter);
    }
    const tail = filter === 'udhaar' ? 'WHERE balance > 0.009 ORDER BY balance DESC' : 'ORDER BY name';
    const rows = await this.db.all<any>(`SELECT * FROM (SELECT c.*, ${CUST_BAL} AS balance, ${CUST_HELD} AS held FROM customers c WHERE ${where}) z ${tail}`, args);
    return rows.map((r) => ({ ...out(r), balance: Number(r.balance), held: Number(r.held), active: !!r.active }));
  }

  async customer(t: number, uid: string) {
    const r = await this.db.one<any>(`SELECT c.*, ${CUST_BAL} AS balance, ${CUST_HELD} AS held FROM customers c WHERE c.tenant_id = ? AND c.uid = ? AND c.deleted = 0`, [t, uid]);
    if (!r) throw new NotFoundException('Customer not found');
    const [held, prices] = await Promise.all([this.heldCylinders(t, uid), this.customerPrices(t, uid)]);
    return { ...out(r), balance: Number(r.balance), held: Number(r.held), active: !!r.active, held_cylinders: held, prices };
  }

  saveCustomer(u: AuthUser, b: PartyIn, uid?: string) {
    const row = { name: b.name, phone: b.phone, address: b.address, type: b.type === 'wholesale' ? 'wholesale' : 'retail', opening_balance: b.opening_balance, note: b.note, active: 1 };
    return this.write(u, async (w) => {
      if (uid) {
        await w.update('customers', uid, row);
        return { uid };
      }
      return { uid: await w.insert('customers', { ...row, created_at: toDb() }) };
    });
  }

  /** Deletes a customer with no history; otherwise archives (hides) it. */
  deleteCustomer(u: AuthUser, uid: string) {
    return this.write(u, async (w) => {
      const t = w.tenantId;
      const r = await w.q.one<any>(
        `SELECT (SELECT COUNT(*) FROM sales WHERE tenant_id = ? AND customer_uid = ? AND deleted = 0)
              + (SELECT COUNT(*) FROM payments WHERE tenant_id = ? AND customer_uid = ? AND deleted = 0) AS n`,
        [t, uid, t, uid],
      );
      const hasHistory = Number(r?.n ?? 0) > 0;
      if (hasHistory) {
        await w.update('customers', uid, { active: 0 });
      } else {
        for (const table of ['customer_prices', 'held_moves', 'cylinder_returns']) await w.removeWhere(table, 'customer_uid', uid);
        await w.remove('customers', uid);
      }
      return { deleted: !hasHistory, archived: hasHistory };
    });
  }

  async customerPrices(t: number, customerUid: string) {
    const rows = await this.db.all<any>('SELECT type_uid, price FROM customer_prices WHERE tenant_id = ? AND customer_uid = ? AND deleted = 0', [t, customerUid]);
    return Object.fromEntries(rows.map((r) => [r.type_uid, Number(r.price)]));
  }

  /** price null removes the custom price. The row uid is customer uid + type uid on every device. */
  setCustomerPrice(u: AuthUser, customerUid: string, typeUid: string, price: number | null) {
    const uid = customerUid + typeUid;
    return this.write(u, async (w) => {
      if (price == null) {
        const r = await w.q.one('SELECT id FROM customer_prices WHERE tenant_id = ? AND uid = ? AND deleted = 0', [w.tenantId, uid]);
        if (r) await w.remove('customer_prices', uid);
      } else {
        await w.put('customer_prices', uid, { customer_uid: customerUid, type_uid: typeUid, price });
      }
      return { ok: true };
    });
  }

  async allCustomerPrices(t: number) {
    const rows = await this.db.all<any>(
      `SELECT cp.customer_uid, cp.type_uid, cp.price, c.name AS customer_name, ty.name AS type_name,
         CASE WHEN c.type = 'wholesale' AND ty.wholesale_price > 0 THEN ty.wholesale_price ELSE ty.price END AS default_price
       FROM customer_prices cp
       JOIN customers c ON c.tenant_id = cp.tenant_id AND c.uid = cp.customer_uid AND c.active = 1 AND c.deleted = 0
       JOIN cylinder_types ty ON ty.tenant_id = cp.tenant_id AND ty.uid = cp.type_uid AND ty.deleted = 0
       WHERE cp.tenant_id = ? AND cp.deleted = 0
       ORDER BY c.name, ty.sort`,
      [t],
    );
    return rows;
  }

  async heldCylinders(t: number, customerUid: string) {
    const rows = await this.db.all<any>(
      `SELECT h.type_uid, t.name AS type_name, SUM(h.qty_delta) AS qty, SUM(h.deposit_delta) AS deposit
       FROM held_moves h JOIN cylinder_types t ON t.tenant_id = h.tenant_id AND t.uid = h.type_uid
       WHERE h.tenant_id = ? AND h.customer_uid = ? AND h.deleted = 0
       GROUP BY h.type_uid, t.name, t.sort HAVING SUM(h.qty_delta) <> 0 OR SUM(h.deposit_delta) <> 0
       ORDER BY t.sort`,
      [t, customerUid],
    );
    return rows.map((r) => ({ type_uid: r.type_uid, type_name: r.type_name, qty: Number(r.qty), deposit: Number(r.deposit) }));
  }

  private held(w: Writer, customerUid: string, typeUid: string, qty: number, deposit: number, reason: string, date: string, ref = '') {
    if (!qty && !deposit) return Promise.resolve();
    return w.insert('held_moves', { customer_uid: customerUid, type_uid: typeUid, qty_delta: qty, deposit_delta: round2(deposit), reason, date, ref });
  }

  /** Set what a customer currently holds (opening / correction, no stock effect). */
  setHeld(u: AuthUser, customerUid: string, typeUid: string, qty: number, deposit: number) {
    return this.write(u, async (w) => {
      const cur = await w.q.one<any>(
        'SELECT IFNULL(SUM(qty_delta),0) AS q, IFNULL(SUM(deposit_delta),0) AS d FROM held_moves WHERE tenant_id = ? AND customer_uid = ? AND type_uid = ? AND deleted = 0',
        [w.tenantId, customerUid, typeUid],
      );
      await this.held(w, customerUid, typeUid, qty - Number(cur.q), deposit - Number(cur.d), 'set', toDb());
      return { ok: true };
    });
  }

  /** Customer returns empty cylinders (and optionally gets security back). */
  async returnCylinders(u: AuthUser, customerUid: string, typeUid: string, qty: number, refund: number, note: string, moneyId?: number) {
    const now = toDb();
    // A refund is paid from the chosen account (cash drawer when none), and never more than it holds.
    let refundFrom: number | undefined;
    if (refund > 0) {
      refundFrom = moneyId ? (await this.money.resolve(tid(u), moneyId)).id : await this.money.routeId(tid(u), 'cash');
      if (refundFrom) await this.money.verify(tid(u), [{ id: refundFrom, date: now.slice(0, 10), amount: -round2(refund) }]);
    }
    return this.write(u, async (w) => {
      const c = await w.q.one<any>('SELECT name FROM customers WHERE tenant_id = ? AND uid = ? AND deleted = 0', [w.tenantId, customerUid]);
      if (!c) throw new NotFoundException('Customer not found');
      await this.typeRow(w.q, w.tenantId, typeUid);
      await this.held(w, customerUid, typeUid, -qty, -refund, 'return', now);
      const ruid = await w.insert('cylinder_returns', { customer_uid: customerUid, type_uid: typeUid, qty, deposit_refund: refund, date: now, note });
      if (moneyId && refundFrom) await this.money.tag(w.q, w.tenantId, 'return', ruid, refundFrom);
      await this.move(w, typeUid, 0, qty, 'return', now, String(c.name).slice(0, 60));
      return { ok: true };
    });
  }

  async ledger(t: number, customerUid: string) {
    const c = await this.customer(t, customerUid);
    const sales = await this.db.all<any>(`SELECT s.uid, s.no, s.date, s.total, ${SALE_ITEMS_TEXT} AS items_text FROM sales s WHERE s.tenant_id = ? AND s.customer_uid = ? AND s.deleted = 0`, [t, customerUid]);
    const pays = await this.db.all<any>('SELECT uid, no, date, amount, method, sale_uid FROM payments WHERE tenant_id = ? AND customer_uid = ? AND deleted = 0', [t, customerUid]);
    const saleNo = new Map(sales.map((s) => [s.uid, docNo('S', s.no)]));
    const ob = Number(c.opening_balance);
    const list: any[] = [
      { date: c.created_at || '0000', kind: 'opening', ref: '', detail: '', debit: ob > 0 ? ob : 0, credit: ob < 0 ? -ob : 0, uid: null, n: 0 },
      ...sales.map((s) => ({ date: s.date, kind: 'sale', ref: docNo('S', s.no), detail: s.items_text ?? '', debit: Number(s.total), credit: 0, uid: s.uid, n: s.no ?? 0 })),
      ...pays.map((p) => ({
        date: p.date,
        kind: 'payment',
        ref: docNo('R', p.no),
        detail: [p.method || 'cash', p.sale_uid ? saleNo.get(p.sale_uid) : ''].filter(Boolean).join(' · '),
        method: p.method || 'cash',
        debit: 0,
        credit: Number(p.amount),
        uid: p.uid,
        n: p.no ?? 0,
      })),
    ];
    // Opening first, then by date; on the same timestamp a sale comes before its payment.
    list.sort((a, b) => {
      if (a.kind === 'opening') return -1;
      if (b.kind === 'opening') return 1;
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      if (a.kind !== b.kind) return a.kind === 'sale' ? -1 : 1;
      return a.n - b.n;
    });
    let bal = 0;
    for (const e of list) {
      bal = round2(bal + e.debit - e.credit);
      e.balance = bal;
      delete e.n;
    }
    return { customer: c, entries: list };
  }

  // ───────────── sales ─────────────

  async createSale(u: AuthUser, b: SaleIn) {
    const when = normDate(b.date) ?? toDb();
    const used = b.lines.filter((l) => l.qty > 0 || l.empty > 0 || (l.kg ?? 0) > 0);
    if (!used.length) throw new BadRequestException('Add at least one cylinder');
    const pay = await this.payFrom(tid(u), { amount: b.paid, method: b.method, money_id: b.money_id, date: when }, false);
    return this.write(u, async (w) => {
      const t = w.tenantId;
      const cid = b.customer_uid || null;
      if (cid) {
        const c = await w.q.one('SELECT id FROM customers WHERE tenant_id = ? AND uid = ? AND deleted = 0', [t, cid]);
        if (!c) throw new NotFoundException('Customer not found');
      }
      const lines: { l: SaleIn['lines'][number]; dep: number; amount: number; kg: number }[] = [];
      for (const l of used) {
        const ty = await this.typeRow(w.q, t, l.type_uid);
        if (ty.unit === 'kg') {
          // Loose gas: sold by weight, no cylinder, no empties, no security.
          const kg = round2(l.kg ?? 0);
          if (!(kg > 0)) continue;
          const have = Math.max(0, (await this.stockOf(w.q, t, l.type_uid)).kg);
          if (kg > have + 0.001) throw new BadRequestException(`Not enough ${ty.name}: ${have} kg in stock, selling ${kg} kg. Fill it from a cylinder first.`);
          lines.push({ l: { ...l, qty: 0, empty: 0 }, dep: 0, amount: round2(kg * l.price), kg });
          continue;
        }
        // Never sell full cylinders the shop does not have.
        if (l.qty > 0) {
          const inStock = Math.max(0, (await this.stockOf(w.q, t, l.type_uid)).full);
          if (l.qty > inStock) throw new BadRequestException(`Not enough full ${ty.name} cylinders: ${inStock} in stock, selling ${l.qty}. Record the purchase first.`);
        }
        const unreturned = l.qty > l.empty ? l.qty - l.empty : 0;
        const dep = cid && b.charge_deposit ? round2(unreturned * Number(ty.deposit)) : 0;
        lines.push({ l, dep, amount: round2(l.qty * l.price), kg: 0 });
      }
      if (!lines.length) throw new BadRequestException('Add at least one cylinder');
      const subtotal = round2(lines.reduce((a, x) => a + x.amount, 0));
      const deposit = round2(lines.reduce((a, x) => a + x.dep, 0));
      const discount = round2(b.discount);
      const total = round2(subtotal + deposit - discount);
      if (total < 0) throw new BadRequestException('Discount is more than the bill');

      const no = await w.nextNo('S');
      const saleUid = await w.insert('sales', { no, customer_uid: cid, date: when, subtotal, deposit, discount, total, paid: round2(b.paid), note: b.note, created_at: toDb() });
      const ref = docNo('S', no);
      for (const { l, dep, amount, kg } of lines) {
        await w.insert('sale_items', { sale_uid: saleUid, type_uid: l.type_uid, qty: l.qty, empty_qty: l.empty, price: l.price, deposit: dep, amount, kg });
        await this.move(w, l.type_uid, -l.qty, l.empty, 'sale', when, ref, -kg);
        if (cid && !kg) await this.held(w, cid, l.type_uid, l.qty - l.empty, dep, 'sale', when, ref);
      }
      if (b.paid > 0) {
        const puid = await w.insert('payments', { customer_uid: cid, sale_uid: saleUid, date: when, amount: round2(b.paid), method: pay.method, note: '', created_at: toDb() });
        if (pay.moneyId) await this.money.tag(w.q, t, 'payment', puid, pay.moneyId);
      }
      return { uid: saleUid, no: ref };
    });
  }

  async sales(t: number, from?: string, to?: string, q = '', limit = 500, customerUid?: string) {
    const [f, tt] = range(from, to);
    const args: unknown[] = [t, f, tt];
    let extra = '';
    const qq = q.trim();
    if (qq) {
      const digits = qq.replace(/[^0-9]/g, '');
      extra = ' AND (c.name LIKE ? OR c.phone LIKE ? OR s.no = ?)';
      args.push(`%${qq}%`, `%${qq}%`, digits ? Number(digits) : -1);
    }
    if (customerUid) {
      extra += ' AND s.customer_uid = ?';
      args.push(customerUid);
    }
    const rows = await this.db.all<any>(
      `SELECT s.*, c.name AS customer_name, c.phone AS customer_phone, ${SALE_ITEMS_TEXT} AS items_text,
         (SELECT IFNULL(SUM(si.qty),0) FROM sale_items si WHERE si.tenant_id = s.tenant_id AND si.sale_uid = s.uid AND si.deleted = 0) AS qty
       FROM sales s LEFT JOIN customers c ON c.tenant_id = s.tenant_id AND c.uid = s.customer_uid
       WHERE s.tenant_id = ? AND s.deleted = 0 AND s.date >= ? AND s.date < ?${extra}
       ORDER BY s.date DESC, s.id DESC LIMIT ${cap(limit, 500)}`,
      args,
    );
    return rows.map((r) => ({ ...out(r), ref: docNo('S', r.no), qty: Number(r.qty), due: round2(r.total - r.paid) }));
  }

  async sale(t: number, uid: string) {
    const r = await this.db.one<any>(
      `SELECT s.*, c.name AS customer_name, c.phone AS customer_phone, c.address AS customer_address, ${SALE_ITEMS_TEXT} AS items_text
       FROM sales s LEFT JOIN customers c ON c.tenant_id = s.tenant_id AND c.uid = s.customer_uid
       WHERE s.tenant_id = ? AND s.uid = ? AND s.deleted = 0`,
      [t, uid],
    );
    if (!r) throw new NotFoundException('Sale not found');
    const items = await this.db.all<any>(
      `SELECT si.*, ty.name AS type_name, ty.unit FROM sale_items si
       JOIN cylinder_types ty ON ty.tenant_id = si.tenant_id AND ty.uid = si.type_uid
       WHERE si.tenant_id = ? AND si.sale_uid = ? AND si.deleted = 0 ORDER BY si.id`,
      [t, uid],
    );
    const pay = await this.db.one<any>('SELECT uid, method FROM payments WHERE tenant_id = ? AND sale_uid = ? AND deleted = 0 ORDER BY id LIMIT 1', [t, uid]);
    r.method = pay?.method ?? null;
    r.money_name = pay?.uid ? await this.money.nameOf(t, 'payment', pay.uid) : '';
    let balance: number | null = null;
    if (r.customer_uid) {
      const b = await this.db.one<any>(`SELECT ${CUST_BAL} AS b FROM customers c WHERE c.tenant_id = ? AND c.uid = ?`, [t, r.customer_uid]);
      balance = Number(b?.b ?? 0);
    }
    return { ...out(r), ref: docNo('S', r.no), due: round2(r.total - r.paid), customer_balance: balance, items: items.map(out) };
  }

  /** Deletes a sale and reverses its stock, customer cylinders and payment. */
  async deleteSale(u: AuthUser, uid: string) {
    const now = toDb();
    const pays = await this.db.all<any>('SELECT uid FROM payments WHERE tenant_id = ? AND sale_uid = ? AND deleted = 0', [tid(u), uid]);
    const gone = new Set(pays.map((p) => p.uid));
    if (gone.size) await this.money.verify(tid(u), [], (m) => m.src === 'payment' && gone.has(m.link));
    return this.write(u, async (w) => {
      const t = w.tenantId;
      const s = await w.q.one<any>('SELECT * FROM sales WHERE tenant_id = ? AND uid = ? AND deleted = 0', [t, uid]);
      if (!s) throw new NotFoundException('Sale not found');
      const ref = docNo('S', s.no);
      const items = await w.q.all<any>('SELECT * FROM sale_items WHERE tenant_id = ? AND sale_uid = ? AND deleted = 0', [t, uid]);
      for (const it of items) {
        await this.move(w, it.type_uid, it.qty, -it.empty_qty, 'sale_del', now, ref, Number(it.kg) || 0);
        if (s.customer_uid && !(Number(it.kg) > 0)) await this.held(w, s.customer_uid, it.type_uid, -(it.qty - it.empty_qty), -Number(it.deposit), 'sale_del', now, ref);
        await w.remove('sale_items', it.uid);
      }
      await w.removeWhere('payments', 'sale_uid', uid);
      await w.remove('sales', uid);
      return { ok: true };
    });
  }

  // ───────────── payments ─────────────

  async addPayment(u: AuthUser, b: { customer_uid: string; amount: number; date?: string; method: string; money_id?: number; note: string }) {
    const when = normDate(b.date) ?? toDb();
    const pay = await this.payFrom(tid(u), { amount: b.amount, method: b.method, money_id: b.money_id, date: when }, false);
    return this.write(u, async (w) => {
      const c = await w.q.one('SELECT id FROM customers WHERE tenant_id = ? AND uid = ? AND deleted = 0', [w.tenantId, b.customer_uid]);
      if (!c) throw new NotFoundException('Customer not found');
      const uid = await w.insert('payments', { customer_uid: b.customer_uid, sale_uid: null, date: when, amount: round2(b.amount), method: pay.method, note: b.note, created_at: toDb() });
      if (pay.moneyId) await this.money.tag(w.q, w.tenantId, 'payment', uid, pay.moneyId);
      const p = await w.q.one<any>('SELECT no FROM payments WHERE tenant_id = ? AND uid = ?', [w.tenantId, uid]);
      return { uid, no: docNo('R', p?.no) };
    });
  }

  async payments(t: number, from?: string, to?: string, customerUid?: string, limit?: number) {
    const [f, tt] = range(from, to);
    const rows = await this.db.all<any>(
      `SELECT p.*, c.name AS customer_name, c.phone AS customer_phone, s.no AS sale_no FROM payments p
       LEFT JOIN customers c ON c.tenant_id = p.tenant_id AND c.uid = p.customer_uid
       LEFT JOIN sales s ON s.tenant_id = p.tenant_id AND s.uid = p.sale_uid
       WHERE p.tenant_id = ? AND p.deleted = 0 AND p.date >= ? AND p.date < ? ${customerUid ? 'AND p.customer_uid = ?' : ''}
       ORDER BY p.date DESC, p.id DESC LIMIT ${cap(limit, 500)}`,
      customerUid ? [t, f, tt, customerUid] : [t, f, tt],
    );
    return rows.map((r) => ({ ...out(r), ref: docNo('R', r.no), sale_ref: r.sale_uid ? docNo('S', r.sale_no) : null }));
  }

  async payment(t: number, uid: string) {
    const r = await this.db.one<any>(
      `SELECT p.*, c.name AS customer_name, c.phone AS customer_phone, s.no AS sale_no, ${CUST_BAL} AS customer_balance FROM payments p
       LEFT JOIN customers c ON c.tenant_id = p.tenant_id AND c.uid = p.customer_uid
       LEFT JOIN sales s ON s.tenant_id = p.tenant_id AND s.uid = p.sale_uid
       WHERE p.tenant_id = ? AND p.uid = ? AND p.deleted = 0`,
      [t, uid],
    );
    if (!r) throw new NotFoundException('Payment not found');
    r.money_name = await this.money.nameOf(t, 'payment', uid);
    return { ...out(r), ref: docNo('R', r.no), sale_ref: r.sale_uid ? docNo('S', r.sale_no) : null, customer_balance: r.customer_uid ? Number(r.customer_balance) : null };
  }

  /** Only standalone payments can be deleted (sale payments go with the sale). */
  async deletePayment(u: AuthUser, uid: string) {
    const p0 = await this.db.one<any>('SELECT sale_uid FROM payments WHERE tenant_id = ? AND uid = ? AND deleted = 0', [tid(u), uid]);
    if (p0 && !p0.sale_uid) await this.money.verify(tid(u), [], (m) => m.src === 'payment' && m.link === uid);
    return this.write(u, async (w) => {
      const p = await w.q.one<any>('SELECT sale_uid FROM payments WHERE tenant_id = ? AND uid = ? AND deleted = 0', [w.tenantId, uid]);
      if (!p) throw new NotFoundException('Payment not found');
      if (p.sale_uid) throw new BadRequestException('This payment belongs to a sale. Delete the sale instead.');
      await w.remove('payments', uid);
      return { ok: true };
    });
  }

  // ───────────── suppliers / purchases ─────────────

  async suppliers(t: number, q = '') {
    const qq = q.trim();
    const rows = await this.db.all<any>(
      `SELECT s.*, ${SUP_BAL} AS balance FROM suppliers s WHERE s.tenant_id = ? AND s.deleted = 0 AND s.active = 1
       ${qq ? 'AND (s.name LIKE ? OR s.phone LIKE ?)' : ''} ORDER BY s.name`,
      qq ? [t, `%${qq}%`, `%${qq}%`] : [t],
    );
    return rows.map((r) => ({ ...out(r), balance: Number(r.balance), active: !!r.active }));
  }

  async supplier(t: number, uid: string) {
    const r = await this.db.one<any>(`SELECT s.*, ${SUP_BAL} AS balance FROM suppliers s WHERE s.tenant_id = ? AND s.uid = ? AND s.deleted = 0`, [t, uid]);
    if (!r) throw new NotFoundException('Supplier not found');
    return { ...out(r), balance: Number(r.balance), active: !!r.active };
  }

  saveSupplier(u: AuthUser, b: PartyIn, uid?: string) {
    const row = { name: b.name, phone: b.phone, address: b.address, opening_balance: b.opening_balance, note: b.note, active: 1 };
    return this.write(u, async (w) => {
      if (uid) {
        await w.update('suppliers', uid, row);
        return { uid };
      }
      return { uid: await w.insert('suppliers', { ...row, created_at: toDb() }) };
    });
  }

  deleteSupplier(u: AuthUser, uid: string) {
    return this.write(u, async (w) => {
      const t = w.tenantId;
      const r = await w.q.one<any>(
        `SELECT (SELECT COUNT(*) FROM purchases WHERE tenant_id = ? AND supplier_uid = ? AND deleted = 0)
              + (SELECT COUNT(*) FROM supplier_payments WHERE tenant_id = ? AND supplier_uid = ? AND deleted = 0) AS n`,
        [t, uid, t, uid],
      );
      const hasHistory = Number(r?.n ?? 0) > 0;
      if (hasHistory) await w.update('suppliers', uid, { active: 0 });
      else await w.remove('suppliers', uid);
      return { deleted: !hasHistory, archived: hasHistory };
    });
  }

  async createPurchase(u: AuthUser, b: PurchaseIn) {
    const when = normDate(b.date) ?? toDb();
    const used = b.lines.filter((l) => l.qty > 0 || l.empty_sent > 0);
    if (!used.length) throw new BadRequestException('Add at least one cylinder');
    const pay = await this.payFrom(tid(u), { amount: b.paid, method: b.method, money_id: b.money_id, date: when }, true);
    return this.write(u, async (w) => {
      const t = w.tenantId;
      for (const l of used) {
        const ty = await w.q.one<any>('SELECT name, unit FROM cylinder_types WHERE tenant_id = ? AND uid = ?', [t, l.type_uid]);
        if (ty?.unit === 'kg') throw new BadRequestException(`${ty.name} is sold by kg. Buy full cylinders, then use Fill from cylinder.`);
      }
      const sid = b.supplier_uid || null;
      if (sid) {
        const s = await w.q.one('SELECT id FROM suppliers WHERE tenant_id = ? AND uid = ? AND deleted = 0', [t, sid]);
        if (!s) throw new NotFoundException('Supplier not found');
      }
      const total = round2(used.reduce((a, l) => a + l.qty * l.price, 0));
      const no = await w.nextNo('P');
      const pid = await w.insert('purchases', { no, supplier_uid: sid, date: when, total, paid: round2(b.paid), note: b.note, created_at: toDb() });
      const ref = docNo('P', no);
      for (const l of used) {
        const ty = await this.typeRow(w.q, t, l.type_uid);
        await w.insert('purchase_items', { purchase_uid: pid, type_uid: l.type_uid, qty: l.qty, empty_sent: l.empty_sent, price: l.price, amount: round2(l.qty * l.price) });
        await this.move(w, l.type_uid, l.qty, -l.empty_sent, 'purchase', when, ref);
        if (b.update_prices && l.qty > 0 && l.price > 0 && l.price !== Number(ty.purchase_price)) {
          await w.update('cylinder_types', l.type_uid, { purchase_price: l.price });
          await this.logPrice(w, l.type_uid, 'purchase', Number(ty.purchase_price), l.price, when, ref);
        }
      }
      if (b.paid > 0) {
        const puid = await w.insert('supplier_payments', { supplier_uid: sid, purchase_uid: pid, date: when, amount: round2(b.paid), method: pay.method, note: '', created_at: toDb() });
        if (pay.moneyId) await this.money.tag(w.q, t, 'sup_pay', puid, pay.moneyId);
      }
      return { uid: pid, no: ref };
    });
  }

  async purchases(t: number, from?: string, to?: string, supplierUid?: string, limit?: number) {
    const [f, tt] = range(from, to);
    const rows = await this.db.all<any>(
      `SELECT p.*, s.name AS supplier_name, ${PUR_ITEMS_TEXT} AS items_text
       FROM purchases p LEFT JOIN suppliers s ON s.tenant_id = p.tenant_id AND s.uid = p.supplier_uid
       WHERE p.tenant_id = ? AND p.deleted = 0 AND p.date >= ? AND p.date < ? ${supplierUid ? 'AND p.supplier_uid = ?' : ''}
       ORDER BY p.date DESC, p.id DESC LIMIT ${cap(limit, 500)}`,
      supplierUid ? [t, f, tt, supplierUid] : [t, f, tt],
    );
    return rows.map((r) => ({ ...out(r), ref: docNo('P', r.no), due: round2(r.total - r.paid) }));
  }

  async purchase(t: number, uid: string) {
    const r = await this.db.one<any>(
      `SELECT p.*, s.name AS supplier_name, s.phone AS supplier_phone, ${PUR_ITEMS_TEXT} AS items_text
       FROM purchases p LEFT JOIN suppliers s ON s.tenant_id = p.tenant_id AND s.uid = p.supplier_uid
       WHERE p.tenant_id = ? AND p.uid = ? AND p.deleted = 0`,
      [t, uid],
    );
    if (!r) throw new NotFoundException('Purchase not found');
    const items = await this.db.all<any>(
      `SELECT pi.*, ty.name AS type_name FROM purchase_items pi
       JOIN cylinder_types ty ON ty.tenant_id = pi.tenant_id AND ty.uid = pi.type_uid
       WHERE pi.tenant_id = ? AND pi.purchase_uid = ? AND pi.deleted = 0 ORDER BY pi.id`,
      [t, uid],
    );
    const sp = await this.db.one<any>('SELECT uid, method FROM supplier_payments WHERE tenant_id = ? AND purchase_uid = ? AND deleted = 0 ORDER BY id LIMIT 1', [t, uid]);
    r.method = sp?.method ?? null;
    r.money_name = sp ? await this.money.nameOf(t, 'sup_pay', sp.uid) : '';
    return { ...out(r), ref: docNo('P', r.no), due: round2(r.total - r.paid), items: items.map(out) };
  }

  deletePurchase(u: AuthUser, uid: string) {
    const now = toDb();
    return this.write(u, async (w) => {
      const t = w.tenantId;
      const p = await w.q.one<any>('SELECT * FROM purchases WHERE tenant_id = ? AND uid = ? AND deleted = 0', [t, uid]);
      if (!p) throw new NotFoundException('Purchase not found');
      const ref = docNo('P', p.no);
      const items = await w.q.all<any>('SELECT * FROM purchase_items WHERE tenant_id = ? AND purchase_uid = ? AND deleted = 0', [t, uid]);
      for (const it of items) {
        await this.move(w, it.type_uid, -it.qty, it.empty_sent, 'purchase_del', now, ref);
        await w.remove('purchase_items', it.uid);
      }
      await w.removeWhere('supplier_payments', 'purchase_uid', uid);
      await w.remove('purchases', uid);
      return { ok: true };
    });
  }

  async addSupplierPayment(u: AuthUser, b: { supplier_uid: string; amount: number; date?: string; method: string; money_id?: number; note: string }) {
    const when = normDate(b.date) ?? toDb();
    const pay = await this.payFrom(tid(u), { amount: b.amount, method: b.method, money_id: b.money_id, date: when }, true);
    return this.write(u, async (w) => {
      const s = await w.q.one('SELECT id FROM suppliers WHERE tenant_id = ? AND uid = ? AND deleted = 0', [w.tenantId, b.supplier_uid]);
      if (!s) throw new NotFoundException('Supplier not found');
      const uid = await w.insert('supplier_payments', { supplier_uid: b.supplier_uid, purchase_uid: null, date: when, amount: round2(b.amount), method: pay.method, note: b.note, created_at: toDb() });
      if (pay.moneyId) await this.money.tag(w.q, w.tenantId, 'sup_pay', uid, pay.moneyId);
      return { uid };
    });
  }

  deleteSupplierPayment(u: AuthUser, uid: string) {
    return this.write(u, async (w) => {
      const p = await w.q.one<any>('SELECT purchase_uid FROM supplier_payments WHERE tenant_id = ? AND uid = ? AND deleted = 0', [w.tenantId, uid]);
      if (!p) throw new NotFoundException('Payment not found');
      if (p.purchase_uid) throw new BadRequestException('This payment belongs to a purchase. Delete the purchase instead.');
      await w.remove('supplier_payments', uid);
      return { ok: true };
    });
  }

  async supplierLedger(t: number, supplierUid: string) {
    const s = await this.supplier(t, supplierUid);
    const purs = await this.db.all<any>(`SELECT p.uid, p.no, p.date, p.total, ${PUR_ITEMS_TEXT} AS items_text FROM purchases p WHERE p.tenant_id = ? AND p.supplier_uid = ? AND p.deleted = 0`, [t, supplierUid]);
    const pays = await this.db.all<any>('SELECT uid, date, amount, method, note, purchase_uid FROM supplier_payments WHERE tenant_id = ? AND supplier_uid = ? AND deleted = 0', [t, supplierUid]);
    const purNo = new Map(purs.map((p) => [p.uid, docNo('P', p.no)]));
    const ob = Number(s.opening_balance);
    const list: any[] = [
      { date: '0000', kind: 'opening', ref: '', detail: '', debit: ob > 0 ? ob : 0, credit: ob < 0 ? -ob : 0, uid: null },
      ...purs.map((p) => ({ date: p.date, kind: 'purchase', ref: docNo('P', p.no), detail: p.items_text ?? '', debit: Number(p.total), credit: 0, uid: p.uid })),
      ...pays.map((p) => ({
        date: p.date,
        kind: 'payment',
        ref: p.purchase_uid ? (purNo.get(p.purchase_uid) ?? '') : '',
        detail: p.method || 'cash',
        method: p.method || 'cash',
        debit: 0,
        credit: Number(p.amount),
        uid: p.uid,
        standalone: !p.purchase_uid,
      })),
    ];
    list.sort((a, b) => {
      if (a.kind === 'opening') return -1;
      if (b.kind === 'opening') return 1;
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      return a.kind === 'purchase' ? -1 : 1;
    });
    let bal = 0;
    for (const e of list) {
      bal = round2(bal + e.debit - e.credit);
      e.balance = bal;
    }
    return { supplier: s, entries: list };
  }

  // ───────────── dashboard / reports ─────────────

  async dashboard(t: number) {
    const day = todayKey();
    const [from, to] = range(day, day);
    const q = this.db;
    const [s, qty, p, o, h, counts, types, recent] = await Promise.all([
      q.one<any>('SELECT IFNULL(SUM(total),0) AS t, COUNT(*) AS n FROM sales WHERE tenant_id = ? AND deleted = 0 AND date >= ? AND date < ?', [t, from, to]),
      q.one<any>(
        `SELECT IFNULL(SUM(si.qty),0) AS q, IFNULL(SUM(si.kg),0) AS k FROM sale_items si JOIN sales s ON s.tenant_id = si.tenant_id AND s.uid = si.sale_uid
         WHERE si.tenant_id = ? AND si.deleted = 0 AND s.deleted = 0 AND s.date >= ? AND s.date < ?`,
        [t, from, to],
      ),
      q.one<any>('SELECT IFNULL(SUM(amount),0) AS t FROM payments WHERE tenant_id = ? AND deleted = 0 AND date >= ? AND date < ?', [t, from, to]),
      q.one<any>(`SELECT IFNULL(SUM(b),0) AS t, COUNT(*) AS n FROM (SELECT ${CUST_BAL} AS b FROM customers c WHERE c.tenant_id = ? AND c.deleted = 0 AND c.active = 1) z WHERE b > 0.009`, [t]),
      q.one<any>('SELECT IFNULL(SUM(qty_delta),0) AS q, IFNULL(SUM(deposit_delta),0) AS d FROM held_moves WHERE tenant_id = ? AND deleted = 0', [t]),
      q.one<any>(
        `SELECT (SELECT COUNT(*) FROM customers WHERE tenant_id = ? AND deleted = 0 AND active = 1) AS c,
                (SELECT COUNT(*) FROM sales WHERE tenant_id = ? AND deleted = 0) AS s,
                (SELECT COUNT(*) FROM purchases WHERE tenant_id = ? AND deleted = 0) AS p`,
        [t, t, t],
      ),
      this.types(t),
      this.sales(t, undefined, undefined, '', 6),
    ]);

    const start = addDays(day, -6);
    const w = await q.all<any>('SELECT SUBSTR(date,1,10) AS day, SUM(total) AS t FROM sales WHERE tenant_id = ? AND deleted = 0 AND date >= ? GROUP BY day', [t, start]);
    const byDay = new Map(w.map((r) => [r.day, Number(r.t)]));
    const last7 = Array.from({ length: 7 }, (_, i) => {
      const k = addDays(start, i);
      return { day: k, total: byDay.get(k) ?? 0 };
    });

    return {
      today_sales: Number(s?.t ?? 0),
      today_sales_count: Number(s?.n ?? 0),
      today_qty: Number(qty?.q ?? 0),
      today_kg: round2(Number(qty?.k ?? 0)),
      gas_kg_total: round2(types.reduce((a, x) => a + (x.unit === 'kg' ? x.gas_kg : 0), 0)),
      today_payments: Number(p?.t ?? 0),
      outstanding: Number(o?.t ?? 0),
      udhaar_customers: Number(o?.n ?? 0),
      full_total: types.reduce((a, x) => a + x.full_qty, 0),
      empty_total: types.reduce((a, x) => a + x.empty_qty, 0),
      with_customers: Number(h?.q ?? 0),
      deposit_held: Number(h?.d ?? 0),
      customer_count: Number(counts?.c ?? 0),
      sale_count: Number(counts?.s ?? 0),
      purchase_count: Number(counts?.p ?? 0),
      types,
      recent,
      last7,
    };
  }

  /** Totals for a period: sales by type, money in by method, purchases and an estimated profit. */
  async report(t: number, from?: string, to?: string) {
    const [f, tt] = range(from, to);
    const q = this.db;
    const [sales, byType, byMethod, purchases, supPaid, newCustomers, byDay] = await Promise.all([
      q.one<any>(
        `SELECT COUNT(*) AS n, IFNULL(SUM(subtotal),0) AS subtotal, IFNULL(SUM(deposit),0) AS deposit, IFNULL(SUM(discount),0) AS discount,
                IFNULL(SUM(total),0) AS total, IFNULL(SUM(paid),0) AS paid
         FROM sales WHERE tenant_id = ? AND deleted = 0 AND date >= ? AND date < ?`,
        [t, f, tt],
      ),
      q.all<any>(
        `SELECT ty.uid AS type_uid, ty.name AS type_name, ty.purchase_price, ty.unit, SUM(si.qty) AS qty, SUM(si.empty_qty) AS empty_qty, SUM(si.kg) AS kg, SUM(si.amount) AS amount
         FROM sale_items si
         JOIN sales s ON s.tenant_id = si.tenant_id AND s.uid = si.sale_uid AND s.deleted = 0
         JOIN cylinder_types ty ON ty.tenant_id = si.tenant_id AND ty.uid = si.type_uid
         WHERE si.tenant_id = ? AND si.deleted = 0 AND s.date >= ? AND s.date < ?
         GROUP BY ty.uid, ty.name, ty.purchase_price, ty.unit, ty.sort ORDER BY ty.sort`,
        [t, f, tt],
      ),
      q.all<any>(
        `SELECT method, COUNT(*) AS n, SUM(amount) AS amount FROM payments
         WHERE tenant_id = ? AND deleted = 0 AND date >= ? AND date < ? GROUP BY method ORDER BY amount DESC`,
        [t, f, tt],
      ),
      q.one<any>('SELECT COUNT(*) AS n, IFNULL(SUM(total),0) AS total, IFNULL(SUM(paid),0) AS paid FROM purchases WHERE tenant_id = ? AND deleted = 0 AND date >= ? AND date < ?', [t, f, tt]),
      q.one<any>('SELECT IFNULL(SUM(amount),0) AS t FROM supplier_payments WHERE tenant_id = ? AND deleted = 0 AND date >= ? AND date < ?', [t, f, tt]),
      q.one<any>('SELECT COUNT(*) AS n FROM customers WHERE tenant_id = ? AND deleted = 0 AND created_at >= ? AND created_at < ?', [t, f, tt]),
      q.all<any>(
        `SELECT SUBSTR(date,1,10) AS day, COUNT(*) AS n, SUM(total) AS total FROM sales
         WHERE tenant_id = ? AND deleted = 0 AND date >= ? AND date < ? GROUP BY day ORDER BY day`,
        [t, f, tt],
      ),
    ]);
    const types = byType.map((r) => {
      const amount = Number(r.amount);
      const cost = (Number(r.qty) + Number(r.kg)) * Number(r.purchase_price);
      return { type_uid: r.type_uid, type_name: r.type_name, unit: r.unit === 'kg' ? 'kg' : '', qty: Number(r.qty), kg: round2(Number(r.kg)), empty_qty: Number(r.empty_qty), amount, est_profit: round2(amount - cost) };
    });
    return {
      from: f,
      to: tt,
      sales: { count: Number(sales.n), subtotal: Number(sales.subtotal), deposit: Number(sales.deposit), discount: Number(sales.discount), total: Number(sales.total), paid_at_sale: Number(sales.paid) },
      qty: types.reduce((a, x) => a + x.qty, 0),
      est_profit: round2(types.reduce((a, x) => a + x.est_profit, 0) - Number(sales.discount)),
      by_type: types,
      money_in: byMethod.map((r) => ({ method: r.method || 'cash', count: Number(r.n), amount: Number(r.amount) })),
      money_in_total: round2(byMethod.reduce((a, r) => a + Number(r.amount), 0)),
      purchases: { count: Number(purchases.n), total: Number(purchases.total), paid_at_purchase: Number(purchases.paid) },
      supplier_paid: Number(supPaid?.t ?? 0),
      new_customers: Number(newCustomers?.n ?? 0),
      by_day: byDay.map((r) => ({ day: r.day, count: Number(r.n), total: Number(r.total) })),
    };
  }
}

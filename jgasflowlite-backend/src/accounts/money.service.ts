import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Db, Q } from '../db/db.service';
import { todayKey } from '../common/util';
import { r2 } from './accounts.engine';

/** Payment methods the app records on sales, payments and supplier payments. */
export const METHODS = ['cash', 'bank', 'jazzcash', 'easypaisa', 'cheque'] as const;
const MONEY_CODES = ['1001', '1002'];

export interface MoneyAccount {
  id: number;
  name: string;
  kind: 'cash' | 'bank';
  title: string;
  number: string;
  branch: string;
  opening_balance: number;
  opening_date: string;
  methods: string[];
}

export interface MoneyIn {
  name: string;
  kind: 'cash' | 'bank';
  title: string;
  number: string;
  branch: string;
  opening_balance: number;
  opening_date?: string;
  methods: string[];
}

const no = (prefix: string, n: unknown) => (n == null ? '' : `${prefix}-${String(n).padStart(5, '0')}`);

/** Synced records that can name their cash/bank account (acc_money_tags.ref_type). */
export type TagType = 'payment' | 'sup_pay' | 'return';

/** One money movement of one account: + in, - out. `src` 'v' = accounting entry, else the record type. */
export interface Move {
  id: number;
  date: string;
  ts: string;
  amount: number;
  description: string;
  ref_type: string;
  ref: string;
  link: string;
  src: string;
}

/** A planned movement checked before it is saved. */
export interface Change {
  id: number;
  date: string;
  amount: number;
}

const fmt = (v: number) => `Rs ${Math.round(v).toLocaleString('en-PK')}`;

/**
 * Cash drawers, banks and wallets. The chart of accounts only knows Cash (1001)
 * and Bank (1002); these accounts split that money by where it really is.
 * Every payment method is routed to one account, so money received or paid on
 * a phone or the web lands in the right account by itself, and the accounts of
 * each kind always add up to the chart balance.
 */
@Injectable()
export class MoneyService {
  constructor(private readonly db: Db) {}

  private async raw(t: number) {
    const rows = await this.db.all<any>(
      `SELECT id, name, kind, title, number, branch, opening_balance, DATE_FORMAT(IFNULL(opening_date, DATE(created_at)), '%Y-%m-%d') opening_date, methods
       FROM acc_money_accounts WHERE tenant_id = ? AND status = 1 ORDER BY kind = 'bank', id`,
      [t],
    );
    return rows.map<MoneyAccount>((r) => ({
      id: Number(r.id),
      name: r.name,
      kind: r.kind === 'cash' ? 'cash' : 'bank',
      title: r.title,
      number: r.number,
      branch: r.branch,
      opening_balance: r2(r.opening_balance),
      opening_date: r.opening_date,
      methods: String(r.methods || '').split(',').filter(Boolean),
    }));
  }

  /** The shop's accounts; the first time, a cash drawer and one bank account are made. */
  async accounts(t: number): Promise<MoneyAccount[]> {
    let list = await this.raw(t);
    if (!list.length) {
      await this.db.run("INSERT INTO acc_money_accounts (tenant_id, name, kind, methods) VALUES (?, 'Cash in hand', 'cash', 'cash')", [t]);
      await this.db.run("INSERT INTO acc_money_accounts (tenant_id, name, kind, methods) VALUES (?, 'Bank and wallets', 'bank', 'bank,jazzcash,easypaisa,cheque')", [t]);
      list = await this.raw(t);
    }
    return list;
  }

  /** Which account each payment method goes to, and the default account per chart code. */
  route(list: MoneyAccount[]) {
    const firstOf = (kind: 'cash' | 'bank') => list.find((a) => a.kind === kind);
    const byMethod = new Map<string, number>();
    for (const m of METHODS) {
      const owner = list.find((a) => a.methods.includes(m) && (m === 'cash' ? a.kind === 'cash' : a.kind === 'bank'));
      const fallback = m === 'cash' ? firstOf('cash') : firstOf('bank');
      const id = owner?.id ?? fallback?.id;
      if (id) byMethod.set(m, id);
    }
    const byCode = new Map<string, number | undefined>([
      ['1001', byMethod.get('cash') ?? firstOf('cash')?.id],
      ['1002', byMethod.get('bank') ?? firstOf('bank')?.id],
    ]);
    return { byMethod, byCode };
  }

  /**
   * Every money movement per account: + money in, - money out.
   * Sources: opening balance, customer payments, supplier payments, security refunds
   * (cash) and accounting entries that use cash or bank.
   */
  private async moves(t: number, list: MoneyAccount[]): Promise<Move[]> {
    const { byMethod, byCode } = this.route(list);
    const out: Move[] = [];
    const live = new Map(list.map((a) => [a.id, a]));
    const tags = new Map(
      (await this.db.all<any>('SELECT ref_type, uid, money_id FROM acc_money_tags WHERE tenant_id = ?', [t])).map((g) => [`${g.ref_type}:${g.uid}`, Number(g.money_id)]),
    );
    // Same rule as the ledger: no method or cash is cash, anything else is bank.
    // An account chosen on the web wins while it is of the same kind as the method.
    const methodAcc = (type: TagType, uid: string, m: unknown) => {
      const k = String(m || 'cash');
      const tagged = live.get(tags.get(`${type}:${uid}`) ?? 0);
      if (tagged && (tagged.kind === 'cash') === (k === 'cash')) return tagged.id;
      return k === 'cash' ? byCode.get('1001') : byMethod.get(k) ?? byCode.get('1002');
    };
    for (const a of list) {
      if (a.opening_balance) out.push({ id: a.id, date: a.opening_date, ts: `${a.opening_date} 00:00:00`, amount: a.opening_balance, description: 'Opening balance', ref_type: 'money_open', ref: '', link: String(a.id), src: 'money_open' });
    }
    const pays = await this.db.all<any>(
      `SELECT x.uid, x.no, x.date, x.amount, x.method, c.name FROM payments x LEFT JOIN customers c ON c.tenant_id = x.tenant_id AND c.uid = x.customer_uid
       WHERE x.tenant_id = ? AND x.deleted = 0 AND x.amount <> 0`,
      [t],
    );
    for (const p of pays) {
      const id = methodAcc('payment', p.uid, p.method);
      if (id) out.push({ id, date: String(p.date).slice(0, 10), ts: String(p.date), amount: r2(p.amount), description: `Payment ${no('R', p.no)}, ${p.name || 'Walk-in'}`, ref_type: 'payment', ref: no('R', p.no), link: p.uid, src: 'payment' });
    }
    const sups = await this.db.all<any>(
      `SELECT x.uid, x.date, x.amount, x.method, s.name FROM supplier_payments x LEFT JOIN suppliers s ON s.tenant_id = x.tenant_id AND s.uid = x.supplier_uid
       WHERE x.tenant_id = ? AND x.deleted = 0 AND x.amount <> 0`,
      [t],
    );
    for (const p of sups) {
      const id = methodAcc('sup_pay', p.uid, p.method);
      if (id) out.push({ id, date: String(p.date).slice(0, 10), ts: String(p.date), amount: -r2(p.amount), description: `Paid to ${p.name || 'supplier'}`, ref_type: 'sup_pay', ref: '', link: p.uid, src: 'sup_pay' });
    }
    const refunds = await this.db.all<any>(
      `SELECT x.uid, x.date, x.deposit_refund, c.name FROM cylinder_returns x LEFT JOIN customers c ON c.tenant_id = x.tenant_id AND c.uid = x.customer_uid
       WHERE x.tenant_id = ? AND x.deleted = 0 AND x.deposit_refund <> 0`,
      [t],
    );
    const cashId = byCode.get('1001');
    for (const r of refunds) {
      // The ledger takes a refund from the chosen account (any kind), else from cash.
      const id = live.get(tags.get(`return:${r.uid}`) ?? 0)?.id ?? cashId;
      if (id) out.push({ id, date: String(r.date).slice(0, 10), ts: String(r.date), amount: -r2(r.deposit_refund), description: `Security refund, ${r.name || ''}`, ref_type: 'return', ref: '', link: r.uid, src: 'return' });
    }
    const vs = await this.db.all<any>(
      `SELECT id, kind, DATE_FORMAT(date, '%Y-%m-%d') date, created_at, debit_code, credit_code, amount, note, money_id, to_id, party FROM acc_vouchers
       WHERE tenant_id = ? AND (debit_code IN ('1001', '1002') OR credit_code IN ('1001', '1002'))`,
      [t],
    );
    const pick = (id: unknown, code: string) => (id != null && live.has(Number(id)) ? Number(id) : byCode.get(code));
    for (const v of vs) {
      const ts = `${v.date} ${String(v.created_at ?? '').slice(11, 19) || '00:00:00'}`;
      const ref = `V-${String(v.id).padStart(5, '0')}`;
      const desc = v.note || [String(v.kind).replace('_', ' '), v.party].filter(Boolean).join(', ');
      if (MONEY_CODES.includes(v.debit_code)) {
        const id = pick(v.kind === 'transfer' ? v.to_id : v.money_id, v.debit_code);
        if (id) out.push({ id, date: v.date, ts, amount: r2(v.amount), description: desc, ref_type: v.kind, ref, link: String(v.id), src: 'v' });
      }
      if (MONEY_CODES.includes(v.credit_code)) {
        const id = pick(v.money_id, v.credit_code);
        if (id) out.push({ id, date: v.date, ts, amount: -r2(v.amount), description: desc, ref_type: v.kind, ref, link: String(v.id), src: 'v' });
      }
    }
    return out;
  }

  /**
   * Money never goes below zero. Checks planned movements (and records about to
   * be removed or replaced, `skip`) against every later day of each account:
   * the lowest running balance from the change onwards must stay at 0 or more.
   * Accounts that are already below zero (older phone records) are only kept
   * from getting worse, so a deposit is never blocked.
   */
  async verify(t: number, changes: Change[], skip?: (m: Move) => boolean) {
    const list = await this.accounts(t);
    const moves = await this.moves(t, list);
    const removed = skip ? moves.filter(skip) : [];
    const ids = new Set([...changes.map((c) => c.id), ...removed.map((m) => m.id)]);
    for (const id of ids) {
      const acc = list.find((a) => a.id === id);
      if (!acc) throw new BadRequestException('Choose a cash or bank account');
      const mine = changes.filter((c) => c.id === id);
      const gone = removed.filter((m) => m.id === id);
      const from = [...mine.map((c) => c.date), ...gone.map((m) => m.date)].sort()[0];
      const before = moves.filter((m) => m.id === id);
      const after = [...before.filter((m) => !skip?.(m)), ...mine];
      // Balance at the end of each day (records and entries use different clocks
      // within a day, so only whole days are compared).
      const low = (xs: { date: string; amount: number }[]) => {
        const days = new Map<string, number>();
        for (const m of xs) days.set(m.date, (days.get(m.date) ?? 0) + m.amount);
        let run = 0;
        let min = Infinity;
        let reached = false;
        for (const d of [...days.keys()].sort()) {
          // The balance carried into the first day of the change counts too.
          if (d >= from && !reached) {
            min = Math.min(min, run);
            reached = true;
          }
          run = r2(run + (days.get(d) ?? 0));
          if (d >= from) min = Math.min(min, run);
        }
        return reached ? min : run;
      };
      const was = low(before);
      const now = low(after);
      if (now < Math.min(0, was) - 0.005) {
        const out = -mine.filter((c) => c.amount < 0).reduce((s, c) => s + c.amount, 0);
        const available = r2(Math.max(0, now + out));
        throw new BadRequestException({
          statusCode: 400,
          message: `Not enough money in ${acc.name}. Available ${fmt(available)}. Choose another account or take a loan.`,
          code: 'LOW_BALANCE',
          account_id: acc.id,
          account_name: acc.name,
          available,
          short: r2(Math.max(0, -now)),
        });
      }
    }
  }

  /** The account chosen for a record, and the payment method to store on it so phones show it right. */
  async resolve(t: number, moneyId: number) {
    const list = await this.accounts(t);
    const a = list.find((x) => x.id === Number(moneyId));
    if (!a) throw new BadRequestException('Choose a cash or bank account');
    const { byMethod } = this.route(list);
    const mine = [...byMethod.entries()].filter(([m, id]) => id === a.id && m !== 'cash').map(([m]) => m);
    return { id: a.id, name: a.name, kind: a.kind, method: a.kind === 'cash' ? 'cash' : (mine[0] ?? 'bank') };
  }

  /** The account a payment method lands in when none was chosen. */
  async routeId(t: number, method: unknown) {
    const { byMethod, byCode } = this.route(await this.accounts(t));
    const k = String(method || 'cash');
    return k === 'cash' ? byCode.get('1001') : (byMethod.get(k) ?? byCode.get('1002'));
  }

  /** Remembers the account a synced record used (inside the record's write). */
  async tag(q: Q, t: number, type: TagType, uid: string, moneyId: number) {
    await q.run('INSERT INTO acc_money_tags (tenant_id, ref_type, uid, money_id) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE money_id = VALUES(money_id)', [t, type, uid, moneyId]);
  }

  /** Which account a record's money went to or came from (for its receipt). */
  async nameOf(t: number, type: TagType, uid: string) {
    const list = await this.accounts(t);
    const m = (await this.moves(t, list)).find((x) => x.src === type && x.link === uid);
    return m ? (list.find((a) => a.id === m.id)?.name ?? '') : '';
  }

  /** Accounts for a payment screen: names for everyone, balances only for owner and manager. */
  async choices(t: number, withBalance: boolean) {
    const rows = await this.list(t);
    return rows.map((a) => ({ id: a.id, name: a.name, kind: a.kind, methods: a.methods, ...(withBalance ? { balance: a.balance } : {}) }));
  }

  /** Accounts with their balance today and the methods routed to them. */
  async list(t: number) {
    const list = await this.accounts(t);
    const moves = await this.moves(t, list);
    const { byMethod } = this.route(list);
    return list.map((a) => ({
      ...a,
      code: a.kind === 'cash' ? '1001' : '1002',
      methods: [...byMethod.entries()].filter(([, id]) => id === a.id).map(([m]) => m),
      balance: r2(moves.filter((m) => m.id === a.id).reduce((s, m) => s + m.amount, 0)),
    }));
  }

  /** One account's statement: balance before `from`, then every movement with a running balance. */
  async statement(t: number, id: number, from?: string, to?: string) {
    const list = await this.accounts(t);
    const acc = list.find((a) => a.id === id);
    if (!acc) throw new NotFoundException('Account not found');
    let f = from && /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : '0000-01-01';
    let tt = to && /^\d{4}-\d{2}-\d{2}$/.test(to) ? to : '9999-12-31';
    if (f > tt) [f, tt] = [tt, f];
    const mine = (await this.moves(t, list)).filter((m) => m.id === id).sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));
    const opening = r2(mine.filter((m) => m.date < f).reduce((s, m) => s + m.amount, 0));
    let bal = opening;
    let tin = 0;
    let tout = 0;
    const entries = mine
      .filter((m) => m.date >= f && m.date <= tt)
      .map((m) => {
        bal = r2(bal + m.amount);
        if (m.amount > 0) tin += m.amount;
        else tout -= m.amount;
        return { date: m.date, description: m.description, ref_type: m.ref_type, ref: m.ref, link: m.link, money_in: m.amount > 0 ? m.amount : 0, money_out: m.amount < 0 ? -m.amount : 0, balance: bal };
      });
    return { account: acc, from: f, to: tt, opening, entries, total_in: r2(tin), total_out: r2(tout), closing: bal };
  }

  /** Methods allowed for an account kind: cash takes cash, a bank takes everything else. */
  private methodsFor(kind: 'cash' | 'bank', methods: string[]) {
    return [...new Set(methods)].filter((m) => (METHODS as readonly string[]).includes(m) && (kind === 'cash' ? m === 'cash' : m !== 'cash'));
  }

  async save(t: number, b: MoneyIn, id?: number) {
    const list = await this.accounts(t);
    const date = b.opening_date && /^\d{4}-\d{2}-\d{2}$/.test(b.opening_date) ? b.opening_date : todayKey();
    const methods = this.methodsFor(b.kind, b.methods);
    if (list.some((a) => a.id !== id && a.name.toLowerCase() === b.name.toLowerCase())) throw new BadRequestException('An account with this name already exists');
    if (b.opening_balance < 0) throw new BadRequestException('Opening balance cannot be below zero');
    if (id) await this.verify(t, b.opening_balance ? [{ id, date, amount: r2(b.opening_balance) }] : [], (m) => m.src === 'money_open' && m.id === id);
    return this.db.tx(async (q) => {
      let aid = id ?? 0;
      if (id) {
        const old = list.find((a) => a.id === id);
        if (!old) throw new NotFoundException('Account not found');
        if (old.kind !== b.kind) throw new BadRequestException('Cash or bank cannot be changed after the account is made');
        await q.run('UPDATE acc_money_accounts SET name = ?, title = ?, number = ?, branch = ?, opening_balance = ?, opening_date = ?, methods = ? WHERE id = ? AND tenant_id = ?', [
          b.name,
          b.title,
          b.number,
          b.branch,
          r2(b.opening_balance),
          date,
          methods.join(','),
          id,
          t,
        ]);
      } else {
        const r = await q.run('INSERT INTO acc_money_accounts (tenant_id, name, kind, title, number, branch, opening_balance, opening_date, methods) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [
          t,
          b.name,
          b.kind,
          b.title,
          b.number,
          b.branch,
          r2(b.opening_balance),
          date,
          methods.join(','),
        ]);
        aid = r.insertId;
      }
      // A method belongs to one account only: take it off the others.
      for (const other of list.filter((a) => a.id !== aid)) {
        const keep = other.methods.filter((m) => !methods.includes(m));
        if (keep.length !== other.methods.length) await q.run('UPDATE acc_money_accounts SET methods = ? WHERE id = ?', [keep.join(','), other.id]);
      }
      return { id: aid };
    });
  }

  async remove(t: number, id: number) {
    const rows = await this.list(t);
    const a = rows.find((x) => x.id === id);
    if (!a) throw new NotFoundException('Account not found');
    if (rows.filter((x) => x.kind === a.kind).length === 1) throw new BadRequestException(a.kind === 'cash' ? 'Keep at least one cash account' : 'Keep at least one bank account');
    if (a.methods.length) throw new BadRequestException('Payments go to this account. Move its payment methods to another account first.');
    const used =
      (await this.db.one('SELECT id FROM acc_vouchers WHERE tenant_id = ? AND (money_id = ? OR to_id = ?) LIMIT 1', [t, id, id])) ||
      (await this.db.one('SELECT money_id FROM acc_money_tags WHERE tenant_id = ? AND money_id = ? LIMIT 1', [t, id]));
    if (used || Math.abs(a.balance) >= 0.01 || a.opening_balance) throw new BadRequestException('This account has money or entries. Transfer its balance and delete its entries first.');
    await this.db.run('DELETE FROM acc_money_accounts WHERE id = ? AND tenant_id = ?', [id, t]);
    return { ok: true };
  }
}

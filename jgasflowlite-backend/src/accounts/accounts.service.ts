import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Db } from '../db/db.service';
import { todayKey } from '../common/util';
import { AccType, CODE_RANGE, isDebitNature, journal, linesSql, r2, reverseJournal, seedAccounts } from './accounts.engine';
import { MoneyService } from './money.service';

/** Kinds of accounting-only entries and which accounts each may use. */
export type VoucherKind = 'expense' | 'income' | 'capital' | 'drawing' | 'transfer' | 'opening' | 'journal' | LoanKind;
/** Loans: taken from someone (and repaid), or given to someone (and received back). */
export type LoanKind = 'loan_taken' | 'loan_repaid' | 'loan_given' | 'loan_back';
export const LOAN_KINDS: LoanKind[] = ['loan_taken', 'loan_repaid', 'loan_given', 'loan_back'];
const MONEY = ['1001', '1002'];
const isLoan = (k: string): k is LoanKind => (LOAN_KINDS as string[]).includes(k);

export interface VoucherIn {
  kind: VoucherKind;
  date: string;
  amount: number;
  /** expense: the expense account; income: the income account; journal: debit account. */
  account?: string;
  /** cash or bank chart code the money went from/into; journal: credit account. */
  money?: string;
  /** The cash drawer / bank / wallet used (Bank accounts). Transfer: money_id = from, to_id = to. */
  money_id?: number;
  to_id?: number;
  /** transfer by chart code (older form). */
  from?: string;
  to?: string;
  /** Loans: the person, shop or bank. */
  party?: string;
  note: string;
}

const day = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined);

/** Inclusive day range; missing ends mean "from the start" / "until today and after". */
function span(from?: string, to?: string): [string, string] {
  let f = day(from) ?? '0000-01-01';
  let t = day(to) ?? '9999-12-31';
  if (f > t) [f, t] = [t, f];
  return [f, t];
}

@Injectable()
export class AccountsService {
  constructor(
    private readonly db: Db,
    private readonly money: MoneyService,
  ) {}
  private seeded = new Set<number>();

  private async ready(t: number) {
    if (this.seeded.has(t)) return;
    await seedAccounts(this.db, t);
    this.seeded.add(t);
  }

  private async chart(t: number) {
    await this.ready(t);
    return this.db.all<any>('SELECT id, code, name, account_type, is_system, status FROM acc_accounts WHERE tenant_id = ? ORDER BY code', [t]);
  }

  /** Signed net (debit - credit) per account code for lines dated in [from, to]. */
  private async nets(t: number, from: string, to: string): Promise<Map<string, number>> {
    const rows = await this.db.all<any>(`SELECT L.code, SUM(L.v) net FROM ${linesSql(t)} WHERE L.d BETWEEN ? AND ? GROUP BY L.code`, [from, to]);
    return new Map(rows.map((r) => [String(r.code), Number(r.net) || 0]));
  }

  // ───────────── chart of accounts

  async accounts(t: number) {
    const chart = await this.chart(t);
    const nets = await this.nets(t, '0000-01-01', '9999-12-31');
    const used = await this.db.all<any>('SELECT DISTINCT a.code FROM acc_entries e JOIN acc_accounts a ON a.id = e.account_id WHERE e.tenant_id = ?', [t]);
    const usedSet = new Set(used.map((u) => u.code));
    return chart.map((a) => {
      const net = nets.get(a.code) ?? 0;
      return {
        code: a.code,
        name: a.name,
        type: a.account_type,
        system: !!a.is_system,
        active: !!a.status,
        balance: r2(isDebitNature(a.account_type) ? net : -net),
        used: usedSet.has(a.code) || nets.has(a.code),
      };
    });
  }

  async addAccount(t: number, b: { name: string; type: AccType }) {
    await this.ready(t);
    const [lo, hi] = CODE_RANGE[b.type];
    const top = await this.db.one<any>('SELECT MAX(CAST(code AS UNSIGNED)) m FROM acc_accounts WHERE tenant_id = ? AND CAST(code AS UNSIGNED) BETWEEN ? AND ?', [t, lo, hi]);
    const next = Math.max(lo, (Number(top?.m) || lo - 1) + 1);
    if (next > hi) throw new BadRequestException('No more account numbers for this type');
    const dupe = await this.db.one('SELECT id FROM acc_accounts WHERE tenant_id = ? AND name = ? AND status = 1', [t, b.name]);
    if (dupe) throw new BadRequestException('An account with this name already exists');
    await this.db.run('INSERT INTO acc_accounts (tenant_id, code, name, account_type, is_system, status) VALUES (?, ?, ?, ?, 0, 1)', [t, String(next), b.name, b.type]);
    return { code: String(next) };
  }

  async updateAccount(t: number, code: string, b: { name?: string; active?: boolean }) {
    await this.ready(t);
    const a = await this.db.one<any>('SELECT * FROM acc_accounts WHERE tenant_id = ? AND code = ?', [t, code]);
    if (!a) throw new NotFoundException('Account not found');
    if (b.active === false) {
      if (a.is_system) throw new BadRequestException('This account is needed by the app and cannot be turned off');
      const bal = (await this.nets(t, '0000-01-01', '9999-12-31')).get(code) ?? 0;
      if (Math.abs(bal) >= 0.01) throw new BadRequestException('Bring the balance to zero before turning this account off');
    }
    await this.db.run('UPDATE acc_accounts SET name = ?, status = ? WHERE id = ?', [b.name?.trim() || a.name, b.active === undefined ? a.status : b.active ? 1 : 0, a.id]);
    return { ok: true };
  }

  // ───────────── reports

  /** Money position as at `to` and profit for [from, to]. */
  async summary(t: number, from?: string, to?: string) {
    const [f, tt] = span(from, to);
    const chart = await this.chart(t);
    const asAt = await this.nets(t, '0000-01-01', tt);
    const range = await this.nets(t, f, tt);
    const bal = (code: string, debit = true) => r2((debit ? 1 : -1) * (asAt.get(code) ?? 0));
    let income = 0;
    let expense = 0;
    for (const a of chart) {
      const net = range.get(a.code) ?? 0;
      if (a.account_type === 'income') income += -net;
      if (a.account_type === 'expense') expense += net;
    }
    return {
      from: f,
      to: tt,
      cash: bal('1001'),
      bank: bal('1002'),
      receivable: bal('1003'),
      payable: bal('2001', false),
      security_held: bal('2002', false),
      income: r2(income),
      expense: r2(expense),
      profit: r2(income - expense),
      sales: r2(-(range.get('3001') ?? 0)),
      purchases: r2(range.get('4001') ?? 0),
    };
  }

  async profitLoss(t: number, from?: string, to?: string) {
    const [f, tt] = span(from, to);
    const chart = await this.chart(t);
    const range = await this.nets(t, f, tt);
    const income: any[] = [];
    const expense: any[] = [];
    for (const a of chart) {
      const net = range.get(a.code) ?? 0;
      if (Math.abs(net) < 0.005) continue;
      if (a.account_type === 'income') income.push({ code: a.code, name: a.name, amount: r2(-net) });
      if (a.account_type === 'expense') expense.push({ code: a.code, name: a.name, amount: r2(net) });
    }
    const ti = r2(income.reduce((s, x) => s + x.amount, 0));
    const te = r2(expense.reduce((s, x) => s + x.amount, 0));
    return { from: f, to: tt, income, expense, total_income: ti, total_expense: te, net_profit: r2(ti - te) };
  }

  async balanceSheet(t: number, asAt?: string) {
    const [, tt] = span(undefined, asAt);
    const chart = await this.chart(t);
    const nets = await this.nets(t, '0000-01-01', tt);
    const assets: any[] = [];
    const liabilities: any[] = [];
    const equity: any[] = [];
    let income = 0;
    let expense = 0;
    for (const a of chart) {
      const net = nets.get(a.code) ?? 0;
      const natural = isDebitNature(a.account_type) ? net : -net;
      const item = { code: a.code, name: a.name, balance: r2(natural) };
      if (a.account_type === 'income') income += natural;
      else if (a.account_type === 'expense') expense += natural;
      else if (Math.abs(natural) >= 0.005) (a.account_type === 'asset' ? assets : a.account_type === 'liability' ? liabilities : equity).push(item);
    }
    const sum = (xs: any[]) => r2(xs.reduce((s, x) => s + x.balance, 0));
    const retained = r2(income - expense);
    const ta = sum(assets);
    const tle = r2(sum(liabilities) + sum(equity) + retained);
    return {
      as_at: tt,
      assets,
      liabilities,
      equity,
      retained_earnings: retained,
      totals: { assets: ta, liabilities: sum(liabilities), equity: r2(sum(equity) + retained), liabilities_equity: tle },
      balanced: Math.abs(ta - tle) < 0.01,
    };
  }

  async trialBalance(t: number, asAt?: string) {
    const [, tt] = span(undefined, asAt);
    const chart = await this.chart(t);
    const nets = await this.nets(t, '0000-01-01', tt);
    let td = 0;
    let tc = 0;
    const lines = chart
      .map((a) => {
        const net = nets.get(a.code) ?? 0;
        const debit = net > 0 ? net : 0;
        const credit = net < 0 ? -net : 0;
        td += debit;
        tc += credit;
        return { code: a.code, name: a.name, type: a.account_type, debit: r2(debit), credit: r2(credit) };
      })
      .filter((l) => l.debit >= 0.005 || l.credit >= 0.005);
    return { as_at: tt, lines, total_debit: r2(td), total_credit: r2(tc), balanced: Math.abs(td - tc) < 0.01 };
  }

  /** One account's statement: balance before `from`, then every line with a running balance. */
  async ledger(t: number, code: string, from?: string, to?: string) {
    const [f, tt] = span(from, to);
    const chart = await this.chart(t);
    const acc = chart.find((a) => a.code === code);
    if (!acc) throw new NotFoundException('Account not found');
    const dn = isDebitNature(acc.account_type);
    const before = await this.db.one<any>(`SELECT IFNULL(SUM(L.v), 0) net FROM ${linesSql(t)} WHERE L.code = ? AND L.d < ?`, [code, f]);
    const rows = await this.db.all<any>(
      `SELECT L.d, L.descr, L.ref_type, L.ref, L.link, L.v FROM ${linesSql(t)} WHERE L.code = ? AND L.d BETWEEN ? AND ? ORDER BY L.ts, L.ref`,
      [code, f, tt],
    );
    const opening = r2(dn ? Number(before?.net) : -Number(before?.net));
    let bal = opening;
    let td = 0;
    let tc = 0;
    const entries = rows.map((r) => {
      const v = Number(r.v);
      const debit = v > 0 ? v : 0;
      const credit = v < 0 ? -v : 0;
      td += debit;
      tc += credit;
      bal = r2(bal + (dn ? v : -v));
      return { date: r.d, description: r.descr, ref_type: r.ref_type, ref: r.ref, link: r.link, debit: r2(debit), credit: r2(credit), balance: bal };
    });
    return { account: { code: acc.code, name: acc.name, type: acc.account_type }, from: f, to: tt, opening, entries, total_debit: r2(td), total_credit: r2(tc), closing: bal };
  }

  /** Every ledger line in [from, to], newest first (the day book of the accounts). */
  async journalLines(t: number, from?: string, to?: string, limit = 2000) {
    const [f, tt] = span(from, to);
    const chart = await this.chart(t);
    const names = new Map(chart.map((a) => [a.code, a.name]));
    const cap = Math.min(Math.max(Math.trunc(limit) || 2000, 1), 50000);
    const rows = await this.db.all<any>(
      `SELECT L.d, L.ts, L.code, L.v, L.descr, L.ref_type, L.ref, L.link FROM ${linesSql(t)} WHERE L.d BETWEEN ? AND ? ORDER BY L.ts DESC, L.ref, L.v DESC LIMIT ${cap}`,
      [f, tt],
    );
    let td = 0;
    let tc = 0;
    const lines = rows.map((r) => {
      const v = Number(r.v);
      const debit = v > 0 ? r2(v) : 0;
      const credit = v < 0 ? r2(-v) : 0;
      td += debit;
      tc += credit;
      return { date: r.d, code: r.code, account: names.get(String(r.code)) ?? r.code, description: r.descr, ref_type: r.ref_type, ref: r.ref, link: r.link, debit, credit };
    });
    return { from: f, to: tt, lines, total_debit: r2(td), total_credit: r2(tc) };
  }

  // ───────────── accounting-only entries (vouchers)

  async vouchers(t: number, from?: string, to?: string, kind?: string) {
    const [f, tt] = span(from, to);
    const chart = await this.chart(t);
    const names = new Map(chart.map((a) => [a.code, a.name]));
    const accs = new Map((await this.money.accounts(t)).map((a) => [a.id, a.name]));
    const rows = await this.db.all<any>(
      `SELECT id, kind, DATE_FORMAT(date, '%Y-%m-%d') date, debit_code, credit_code, amount, note, money_id, to_id, party, created_at FROM acc_vouchers
       WHERE tenant_id = ? AND date BETWEEN ? AND ? ${kind ? 'AND kind = ?' : ''} ORDER BY date DESC, id DESC LIMIT 5000`,
      kind ? [t, f, tt, kind] : [t, f, tt],
    );
    return rows.map((r) => ({
      id: r.id,
      ref: `V-${String(r.id).padStart(5, '0')}`,
      kind: r.kind,
      date: r.date,
      debit_code: r.debit_code,
      debit_name: names.get(r.debit_code) ?? r.debit_code,
      credit_code: r.credit_code,
      credit_name: names.get(r.credit_code) ?? r.credit_code,
      amount: r2(r.amount),
      note: r.note,
      party: r.party ?? '',
      money_id: r.money_id == null ? null : Number(r.money_id),
      to_id: r.to_id == null ? null : Number(r.to_id),
      money_name: r.money_id == null ? '' : (accs.get(Number(r.money_id)) ?? ''),
      to_name: r.to_id == null ? '' : (accs.get(Number(r.to_id)) ?? ''),
    }));
  }

  /** Which account is debited and which credited for a voucher. */
  private async sides(t: number, b: VoucherIn): Promise<[string, string]> {
    const chart = await this.chart(t);
    if (b.money_id != null || b.to_id != null) {
      const accs = await this.money.accounts(t);
      const codeOf = (id?: number) => {
        const a = accs.find((x) => x.id === Number(id));
        if (!a) throw new BadRequestException('Choose a cash or bank account');
        return a.kind === 'cash' ? '1001' : '1002';
      };
      if (b.kind === 'transfer') {
        if (Number(b.money_id) === Number(b.to_id)) throw new BadRequestException('Choose two different accounts');
        return [codeOf(b.to_id), codeOf(b.money_id)];
      }
      if (b.money_id != null) b = { ...b, money: codeOf(b.money_id) };
    }
    const type = (code?: string) => chart.find((a) => a.code === code && a.status)?.account_type as string | undefined;
    const money = (code?: string) => {
      if (!code || !MONEY.includes(code)) throw new BadRequestException('Choose Cash or Bank');
      return code;
    };
    switch (b.kind) {
      case 'expense':
        if (type(b.account) !== 'expense') throw new BadRequestException('Choose an expense account');
        return [b.account!, money(b.money)];
      case 'income':
        if (type(b.account) !== 'income' || b.account === '3001') throw new BadRequestException('Choose an income account');
        return [money(b.money), b.account!];
      case 'capital':
        return [money(b.money), '5001'];
      case 'drawing':
        return ['5002', money(b.money)];
      case 'transfer':
        if (money(b.from) === money(b.to)) throw new BadRequestException('Choose two different accounts');
        return [b.to!, b.from!];
      case 'opening':
        return [money(b.money), '9001'];
      case 'loan_taken':
        return [money(b.money), '2003'];
      case 'loan_repaid':
        return ['2003', money(b.money)];
      case 'loan_given':
        return ['1004', money(b.money)];
      case 'loan_back':
        return [money(b.money), '1004'];
      case 'journal':
        if (!type(b.account) || !type(b.money)) throw new BadRequestException('Choose both accounts');
        if (b.account === b.money) throw new BadRequestException('Choose two different accounts');
        return [b.account!, b.money!];
      default:
        throw new BadRequestException('Unknown entry type');
    }
  }

  /** What is still owed on loans with one person: taken minus repaid, given minus received back. */
  private async loanLeft(t: number, party: string, skipId?: number) {
    const rows = await this.db.all<any>(
      `SELECT kind, SUM(amount) a FROM acc_vouchers WHERE tenant_id = ? AND party = ? AND kind IN ('loan_taken', 'loan_repaid', 'loan_given', 'loan_back') AND id <> ? GROUP BY kind`,
      [t, party, skipId ?? 0],
    );
    const sum = (k: string) => Number(rows.find((r) => r.kind === k)?.a ?? 0);
    return { taken: r2(sum('loan_taken') - sum('loan_repaid')), given: r2(sum('loan_given') - sum('loan_back')) };
  }

  /** Loans per person: how much was taken or given, returned, and what is left. */
  async loans(t: number) {
    const rows = await this.db.all<any>(
      `SELECT party, kind, SUM(amount) a, COUNT(*) n, DATE_FORMAT(MAX(date), '%Y-%m-%d') last FROM acc_vouchers
       WHERE tenant_id = ? AND kind IN ('loan_taken', 'loan_repaid', 'loan_given', 'loan_back') GROUP BY party, kind`,
      [t],
    );
    const out = new Map<string, any>();
    for (const r of rows) {
      const side = r.kind === 'loan_taken' || r.kind === 'loan_repaid' ? 'taken' : 'given';
      const key = `${side}:${r.party}`;
      const x = out.get(key) ?? { party: r.party, side, amount: 0, returned: 0, balance: 0, entries: 0, last: '' };
      if (r.kind === 'loan_taken' || r.kind === 'loan_given') x.amount = r2(x.amount + Number(r.a));
      else x.returned = r2(x.returned + Number(r.a));
      x.balance = r2(x.amount - x.returned);
      x.entries += Number(r.n);
      if (r.last > x.last) x.last = r.last;
      out.set(key, x);
    }
    const list = [...out.values()].sort((a, b) => b.balance - a.balance || a.party.localeCompare(b.party));
    const left = (side: string) => r2(list.filter((x) => x.side === side).reduce((s, x) => s + x.balance, 0));
    return { list, total_taken: left('taken'), total_given: left('given') };
  }

  async saveVoucher(t: number, userId: number, b: VoucherIn, id?: number) {
    if (!(b.amount > 0)) throw new BadRequestException('Enter an amount');
    const date = day(b.date) ?? todayKey();
    const party = (b.party ?? '').trim();
    if (isLoan(b.kind)) {
      if (party.length < 2) throw new BadRequestException('Enter who the loan is with');
      const left = await this.loanLeft(t, party, id);
      if (b.kind === 'loan_repaid' && b.amount > left.taken + 0.005) throw new BadRequestException(`Only Rs ${left.taken} of the loan from ${party} is left to repay`);
      if (b.kind === 'loan_back' && b.amount > left.given + 0.005) throw new BadRequestException(`Only Rs ${left.given} of the loan to ${party} is left to get back`);
      if ((b.kind === 'loan_taken' && left.taken + b.amount < -0.005) || (b.kind === 'loan_given' && left.given + b.amount < -0.005)) throw new BadRequestException('More has been repaid than this loan. Fix the repayments first.');
    }
    const [dr, cr] = await this.sides(t, b);
    // Money in and out of the chosen cash/bank accounts never takes one below zero.
    const accs = await this.money.accounts(t);
    const idFor = (code: string, explicit?: number) => (explicit != null ? Number(explicit) : accs.find((a) => (a.kind === 'cash') === (code === '1001'))?.id);
    const changes: { id: number; date: string; amount: number }[] = [];
    const inId = MONEY.includes(dr) ? idFor(dr, b.kind === 'transfer' ? b.to_id : b.money_id) : undefined;
    const outId = MONEY.includes(cr) ? idFor(cr, b.money_id) : undefined;
    if (inId) changes.push({ id: inId, date, amount: r2(b.amount) });
    if (outId) changes.push({ id: outId, date, amount: -r2(b.amount) });
    await this.money.verify(t, changes, id ? (m) => m.src === 'v' && m.link === String(id) : undefined);
    const desc =
      b.note?.trim() ||
      {
        expense: 'Expense',
        income: 'Other income',
        capital: 'Capital added',
        drawing: 'Owner drawing',
        transfer: 'Transfer',
        opening: 'Opening balance',
        journal: 'Journal entry',
        loan_taken: `Loan taken from ${party}`,
        loan_repaid: `Loan repaid to ${party}`,
        loan_given: `Loan given to ${party}`,
        loan_back: `Loan received back from ${party}`,
      }[b.kind];
    return this.db.tx(async (q) => {
      let vid = id ?? 0;
      if (id) {
        const old = await q.one('SELECT id FROM acc_vouchers WHERE id = ? AND tenant_id = ? FOR UPDATE', [id, t]);
        if (!old) throw new NotFoundException('Entry not found');
        await q.run('UPDATE acc_vouchers SET kind = ?, date = ?, debit_code = ?, credit_code = ?, amount = ?, note = ?, money_id = ?, to_id = ?, party = ? WHERE id = ?', [
          b.kind,
          date,
          dr,
          cr,
          r2(b.amount),
          b.note ?? '',
          b.money_id ?? null,
          b.to_id ?? null,
          isLoan(b.kind) ? party : '',
          id,
        ]);
        await reverseJournal(q, t, 'voucher', id);
      } else {
        const r = await q.run('INSERT INTO acc_vouchers (tenant_id, kind, date, debit_code, credit_code, amount, note, money_id, to_id, party, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [
          t,
          b.kind,
          date,
          dr,
          cr,
          r2(b.amount),
          b.note ?? '',
          b.money_id ?? null,
          b.to_id ?? null,
          isLoan(b.kind) ? party : '',
          userId,
        ]);
        vid = r.insertId;
      }
      if (dr !== cr) await journal(q, t, date, dr, cr, b.amount, desc, 'voucher', vid);
      return { id: vid };
    });
  }

  async deleteVoucher(t: number, id: number) {
    const v = await this.db.one<any>('SELECT kind, party, amount FROM acc_vouchers WHERE id = ? AND tenant_id = ?', [id, t]);
    if (!v) throw new NotFoundException('Entry not found');
    // Taking away money that came in must not leave an account below zero.
    await this.money.verify(t, [], (m) => m.src === 'v' && m.link === String(id));
    // A loan cannot be deleted while repayments of it are still recorded.
    if (v.kind === 'loan_taken' || v.kind === 'loan_given') {
      const left = await this.loanLeft(t, v.party, id);
      if ((v.kind === 'loan_taken' ? left.taken : left.given) < -0.005) throw new BadRequestException('Delete the repayments of this loan first');
    }
    return this.db.tx(async (q) => {
      const v = await q.one('SELECT id FROM acc_vouchers WHERE id = ? AND tenant_id = ? FOR UPDATE', [id, t]);
      if (!v) throw new NotFoundException('Entry not found');
      await reverseJournal(q, t, 'voucher', id);
      await q.run('DELETE FROM acc_vouchers WHERE id = ?', [id]);
      return { ok: true };
    });
  }
}

import type { Q } from '../db/db.service';

/**
 * Double-entry accounting for a shop.
 *
 * Every money event is a debit and a credit of the same amount, so the books
 * always balance. Two kinds of ledger lines exist:
 *  - lines worked out from the shop's own records (sales, payments, purchases,
 *    supplier payments, cylinder refunds, opening balances) by LINES_SQL. These
 *    records are made on phones and on the web and arrive through sync, so the
 *    ledger is derived from them rather than posted once: an edit or delete on
 *    any device is reflected at once and nothing can go stale.
 *  - lines that exist only in accounting (expenses, other income, capital,
 *    drawings, cash/bank transfers, opening cash, journals) are posted with
 *    journal() into acc_entries and undone with reverseJournal().
 */

export type AccType = 'asset' | 'liability' | 'income' | 'expense' | 'equity';

/** Round to 2 dp. */
export const r2 = (v: unknown) => Math.round((Number(v) || 0) * 100) / 100;

export const isDebitNature = (type: string) => type === 'asset' || type === 'expense';

/** [code, name, type, system]. System accounts are used by the derived lines and cannot be removed. */
export const SEED_ACCOUNTS: [string, string, AccType, number][] = [
  ['1001', 'Cash in hand', 'asset', 1],
  ['1002', 'Bank and wallets', 'asset', 1],
  ['1003', 'Customers to receive', 'asset', 1],
  ['1004', 'Loans given', 'asset', 1],
  ['2001', 'Suppliers to pay', 'liability', 1],
  ['2002', 'Cylinder security held', 'liability', 1],
  ['2003', 'Loans taken', 'liability', 1],
  ['3001', 'Gas sales', 'income', 1],
  ['3002', 'Other income', 'income', 1],
  ['4001', 'Gas purchases', 'expense', 1],
  ['4002', 'Salaries and wages', 'expense', 1],
  ['4003', 'Discounts given', 'expense', 1],
  ['4004', 'Rent', 'expense', 0],
  ['4005', 'Electricity and bills', 'expense', 0],
  ['4006', 'Transport and fuel', 'expense', 0],
  ['4007', 'Repairs and maintenance', 'expense', 0],
  ['4010', 'Other expenses', 'expense', 1],
  ['5001', 'Owner capital', 'equity', 1],
  ['5002', 'Owner drawings', 'equity', 1],
  ['9001', 'Opening balance equity', 'equity', 1],
];

/** Code ranges for new accounts per type. */
export const CODE_RANGE: Record<AccType, [number, number]> = {
  asset: [1005, 1999],
  liability: [2004, 2999],
  income: [3003, 3999],
  expense: [4011, 4999],
  equity: [5003, 5999],
};

/** Adds any missing standard account (safe to run every time). */
export async function seedAccounts(q: Q, t: number) {
  for (const [code, name, type, sys] of SEED_ACCOUNTS) {
    await q.run('INSERT IGNORE INTO acc_accounts (tenant_id, code, name, account_type, is_system, status) VALUES (?, ?, ?, ?, ?, 1)', [t, code, name, type, sys]);
  }
}

async function accountId(q: Q, t: number, code: string): Promise<number | null> {
  const r = await q.one<any>('SELECT id FROM acc_accounts WHERE tenant_id = ? AND code = ?', [t, code]);
  return r ? Number(r.id) : null;
}

/** Debit one account and credit another with the same amount. Run inside a transaction. */
export async function journal(q: Q, t: number, date: string, debitCode: string, creditCode: string, amount: number, desc: string, refType: string, refId: number) {
  amount = r2(amount);
  if (amount <= 0) return;
  const d = await accountId(q, t, debitCode);
  const c = await accountId(q, t, creditCode);
  if (!d || !c) throw new Error(`Unknown account ${!d ? debitCode : creditCode}`);
  const sql = 'INSERT INTO acc_entries (tenant_id, date, account_id, entry_type, amount, description, ref_type, ref_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)';
  await q.run(sql, [t, date, d, 'debit', amount, desc.slice(0, 255), refType, refId]);
  await q.run(sql, [t, date, c, 'credit', amount, desc.slice(0, 255), refType, refId]);
}

/** Removes every ledger line of one source record (before an edit, or on delete). */
export async function reverseJournal(q: Q, t: number, refType: string, refId: number) {
  await q.run('DELETE FROM acc_entries WHERE tenant_id = ? AND ref_type = ? AND ref_id = ?', [t, refType, refId]);
}

const day = (col: string) => `SUBSTR(${col}, 1, 10)`;
const created = (col: string) => `IF(${col} IS NULL OR ${col} = '', '2000-01-01', SUBSTR(${col}, 1, 10))`;
/** Cash for cash payments, the bank/wallet account for everything else. */
const moneyAcc = (col: string) => `IF(IFNULL(${col}, 'cash') = 'cash', '1001', '1002')`;
const no = (prefix: string, col: string) => `IF(${col} IS NULL, '', CONCAT('${prefix}-', LPAD(${col}, 5, '0')))`;

/**
 * Every ledger line of one shop as a derived table with columns:
 * d (yyyy-MM-dd), ts (sort key), code, v (signed: + debit, - credit), descr,
 * ref_type, ref (document number), link (uid or voucher id for opening the record).
 * Each source row produces lines whose v add up to 0, so the ledger always balances.
 */
export function linesSql(tenantId: number): string {
  const t = Math.trunc(Number(tenantId)) || 0;
  const cust = `LEFT JOIN customers c ON c.tenant_id = x.tenant_id AND c.uid = x.customer_uid`;
  const sup = `LEFT JOIN suppliers s ON s.tenant_id = x.tenant_id AND s.uid = x.supplier_uid`;
  const who = `IFNULL(c.name, 'Walk-in')`;
  const parts: string[] = [
    // Sale: Dr customers (total) + Dr discounts = Cr gas sales + Cr security held.
    `SELECT ${day('x.date')} d, x.date ts, '1003' code, x.total v, CONCAT('Sale ', ${no('S', 'x.no')}, ', ', ${who}) descr, 'sale' ref_type, ${no('S', 'x.no')} ref, x.uid link
       FROM sales x ${cust} WHERE x.tenant_id = ${t} AND x.deleted = 0 AND x.total <> 0`,
    `SELECT ${day('x.date')}, x.date, '4003', x.discount, CONCAT('Discount on ', ${no('S', 'x.no')}), 'sale', ${no('S', 'x.no')}, x.uid
       FROM sales x WHERE x.tenant_id = ${t} AND x.deleted = 0 AND x.discount <> 0`,
    `SELECT ${day('x.date')}, x.date, '2002', -x.deposit, CONCAT('Security on ', ${no('S', 'x.no')}), 'sale', ${no('S', 'x.no')}, x.uid
       FROM sales x WHERE x.tenant_id = ${t} AND x.deleted = 0 AND x.deposit <> 0`,
    `SELECT ${day('x.date')}, x.date, '3001', -(x.total + x.discount - x.deposit), CONCAT('Sale ', ${no('S', 'x.no')}, ', ', ${who}), 'sale', ${no('S', 'x.no')}, x.uid
       FROM sales x ${cust} WHERE x.tenant_id = ${t} AND x.deleted = 0 AND (x.total + x.discount - x.deposit) <> 0`,
    // Payment received: Dr cash/bank, Cr customers.
    `SELECT ${day('x.date')}, x.date, ${moneyAcc('x.method')}, x.amount, CONCAT('Payment ', ${no('R', 'x.no')}, ', ', ${who}), 'payment', ${no('R', 'x.no')}, x.uid
       FROM payments x ${cust} WHERE x.tenant_id = ${t} AND x.deleted = 0 AND x.amount <> 0`,
    `SELECT ${day('x.date')}, x.date, '1003', -x.amount, CONCAT('Payment ', ${no('R', 'x.no')}, ', ', ${who}), 'payment', ${no('R', 'x.no')}, x.uid
       FROM payments x ${cust} WHERE x.tenant_id = ${t} AND x.deleted = 0 AND x.amount <> 0`,
    // Security refunded on a cylinder return: Dr security held, Cr cash (or the bank chosen on the web).
    `SELECT ${day('x.date')}, x.date, '2002', x.deposit_refund, CONCAT('Security refund, ', ${who}), 'return', '', x.uid
       FROM cylinder_returns x ${cust} WHERE x.tenant_id = ${t} AND x.deleted = 0 AND x.deposit_refund <> 0`,
    `SELECT ${day('x.date')}, x.date, IF(ma.kind = 'bank', '1002', '1001'), -x.deposit_refund, CONCAT('Security refund, ', ${who}), 'return', '', x.uid
       FROM cylinder_returns x ${cust}
       LEFT JOIN acc_money_tags g ON g.tenant_id = x.tenant_id AND g.ref_type = 'return' AND g.uid = x.uid
       LEFT JOIN acc_money_accounts ma ON ma.id = g.money_id AND ma.tenant_id = x.tenant_id AND ma.status = 1
       WHERE x.tenant_id = ${t} AND x.deleted = 0 AND x.deposit_refund <> 0`,
    // Security set by hand (opening / correction): Dr opening equity, Cr security held.
    `SELECT ${day('x.date')}, x.date, '9001', x.deposit_delta, CONCAT('Opening security, ', ${who}), 'held', '', x.uid
       FROM held_moves x ${cust} WHERE x.tenant_id = ${t} AND x.deleted = 0 AND x.reason IN ('set', 'opening') AND x.deposit_delta <> 0`,
    `SELECT ${day('x.date')}, x.date, '2002', -x.deposit_delta, CONCAT('Opening security, ', ${who}), 'held', '', x.uid
       FROM held_moves x ${cust} WHERE x.tenant_id = ${t} AND x.deleted = 0 AND x.reason IN ('set', 'opening') AND x.deposit_delta <> 0`,
    // Customer opening balance: Dr customers, Cr opening equity (an advance is the reverse).
    `SELECT ${created('c.created_at')}, c.created_at, '1003', c.opening_balance, CONCAT('Opening balance, ', c.name), 'cust_open', '', c.uid
       FROM customers c WHERE c.tenant_id = ${t} AND c.deleted = 0 AND c.opening_balance <> 0`,
    `SELECT ${created('c.created_at')}, c.created_at, '9001', -c.opening_balance, CONCAT('Opening balance, ', c.name), 'cust_open', '', c.uid
       FROM customers c WHERE c.tenant_id = ${t} AND c.deleted = 0 AND c.opening_balance <> 0`,
    // Purchase: Dr gas purchases, Cr suppliers.
    `SELECT ${day('x.date')}, x.date, '4001', x.total, CONCAT('Purchase ', ${no('P', 'x.no')}, ', ', IFNULL(s.name, 'Cash purchase')), 'purchase', ${no('P', 'x.no')}, x.uid
       FROM purchases x ${sup} WHERE x.tenant_id = ${t} AND x.deleted = 0 AND x.total <> 0`,
    `SELECT ${day('x.date')}, x.date, '2001', -x.total, CONCAT('Purchase ', ${no('P', 'x.no')}, ', ', IFNULL(s.name, 'Cash purchase')), 'purchase', ${no('P', 'x.no')}, x.uid
       FROM purchases x ${sup} WHERE x.tenant_id = ${t} AND x.deleted = 0 AND x.total <> 0`,
    // Payment to a supplier: Dr suppliers, Cr cash/bank.
    `SELECT ${day('x.date')}, x.date, '2001', x.amount, CONCAT('Paid to ', IFNULL(s.name, 'supplier')), 'sup_pay', '', x.uid
       FROM supplier_payments x ${sup} WHERE x.tenant_id = ${t} AND x.deleted = 0 AND x.amount <> 0`,
    `SELECT ${day('x.date')}, x.date, ${moneyAcc('x.method')}, -x.amount, CONCAT('Paid to ', IFNULL(s.name, 'supplier')), 'sup_pay', '', x.uid
       FROM supplier_payments x ${sup} WHERE x.tenant_id = ${t} AND x.deleted = 0 AND x.amount <> 0`,
    // Supplier opening balance (what we owe): Dr opening equity, Cr suppliers.
    `SELECT ${created('s.created_at')}, s.created_at, '9001', s.opening_balance, CONCAT('Opening balance, ', s.name), 'sup_open', '', s.uid
       FROM suppliers s WHERE s.tenant_id = ${t} AND s.deleted = 0 AND s.opening_balance <> 0`,
    `SELECT ${created('s.created_at')}, s.created_at, '2001', -s.opening_balance, CONCAT('Opening balance, ', s.name), 'sup_open', '', s.uid
       FROM suppliers s WHERE s.tenant_id = ${t} AND s.deleted = 0 AND s.opening_balance <> 0`,
    // Opening balance of a cash drawer / bank / wallet: Dr cash or bank, Cr opening equity.
    `SELECT DATE_FORMAT(IFNULL(m.opening_date, DATE(m.created_at)), '%Y-%m-%d'), DATE_FORMAT(IFNULL(m.opening_date, DATE(m.created_at)), '%Y-%m-%d 00:00:00'),
            IF(m.kind = 'cash', '1001', '1002'), m.opening_balance, CONCAT('Opening balance, ', m.name), 'money_open', '', CAST(m.id AS CHAR)
       FROM acc_money_accounts m WHERE m.tenant_id = ${t} AND m.status = 1 AND m.opening_balance <> 0`,
    `SELECT DATE_FORMAT(IFNULL(m.opening_date, DATE(m.created_at)), '%Y-%m-%d'), DATE_FORMAT(IFNULL(m.opening_date, DATE(m.created_at)), '%Y-%m-%d 00:00:00'),
            '9001', -m.opening_balance, CONCAT('Opening balance, ', m.name), 'money_open', '', CAST(m.id AS CHAR)
       FROM acc_money_accounts m WHERE m.tenant_id = ${t} AND m.status = 1 AND m.opening_balance <> 0`,
    // Accounting-only entries posted with journal().
    `SELECT DATE_FORMAT(e.date, '%Y-%m-%d'), CONCAT(DATE_FORMAT(e.date, '%Y-%m-%d'), ' ', DATE_FORMAT(e.created_at, '%H:%i:%s')), a.code,
            IF(e.entry_type = 'debit', e.amount, -e.amount), e.description, e.ref_type, CONCAT('V-', LPAD(e.ref_id, 5, '0')), CAST(e.ref_id AS CHAR)
       FROM acc_entries e JOIN acc_accounts a ON a.id = e.account_id AND a.tenant_id = e.tenant_id WHERE e.tenant_id = ${t}`,
  ];
  return `(${parts.join('\n UNION ALL \n')}) L`;
}

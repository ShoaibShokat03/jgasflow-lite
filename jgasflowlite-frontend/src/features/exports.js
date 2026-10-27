/**
 * What each list exports: readable columns only (names, dates, amounts).
 * No ids, uids or internal codes. Labels follow the chosen language.
 */
import { fDate, fTime, getCurrency } from '@/lib/format';
import { methodLabel, moveLabel, t } from '@/lib/i18n';

const money = (label) => ({ label: `${label} (${getCurrency()})`, type: 'money' });
const date = (key = 'date') => ({ label: t('col_date'), value: (r) => fDate(r[key]) });
const time = (key = 'date') => ({ label: t('col_time'), value: (r) => fTime(r[key]) });
const yes = (v) => (v ? t('x_yes') : t('x_no'));

const saleStatus = (s) => (s.due <= 0.009 ? t('st_paid') : s.paid > 0.009 ? t('st_partial') : t('st_udhaar'));

export const salesColumns = () => [
  { label: t('col_bill_no'), value: (s) => s.ref },
  date(),
  time(),
  { label: t('col_customer'), value: (s) => s.customer_name || t('walk_in') },
  { label: t('col_phone'), value: (s) => s.customer_phone || '' },
  { label: t('col_items'), value: (s) => s.items_text || '' },
  { label: t('col_full_sold'), type: 'number', value: (s) => s.qty },
  { ...money(t('col_subtotal')), value: (s) => s.subtotal },
  { ...money(t('col_deposit')), value: (s) => s.deposit },
  { ...money(t('col_discount')), value: (s) => s.discount },
  { ...money(t('col_total')), value: (s) => s.total },
  { ...money(t('col_paid')), value: (s) => s.paid },
  { ...money(t('col_udhaar')), value: (s) => Math.max(0, s.due) },
  { label: t('col_status'), value: saleStatus },
  { label: t('col_note'), value: (s) => s.note || '' },
];

export const customerColumns = () => [
  { label: t('col_name'), value: (c) => c.name },
  { label: t('col_phone'), value: (c) => c.phone || '' },
  { label: t('col_address'), value: (c) => c.address || '' },
  { label: t('col_customer_type'), value: (c) => t(c.type) },
  { label: t('col_held'), type: 'number', value: (c) => c.held },
  { ...money(t('col_opening')), value: (c) => c.opening_balance },
  { ...money(t('col_balance')), value: (c) => c.balance },
  { label: t('col_note'), value: (c) => c.note || '' },
  { label: t('col_added'), value: (c) => fDate(c.created_at) },
];

export const paymentColumns = () => [
  { label: t('col_receipt_no'), value: (p) => p.ref },
  date(),
  time(),
  { label: t('col_customer'), value: (p) => p.customer_name || t('walk_in') },
  { label: t('col_phone'), value: (p) => p.customer_phone || '' },
  { ...money(t('col_amount')), value: (p) => p.amount },
  { label: t('col_method'), value: (p) => methodLabel(p.method) },
  { label: t('col_against_bill'), value: (p) => p.sale_ref || '' },
  { label: t('col_note'), value: (p) => p.note || '' },
];

export const purchaseColumns = () => [
  { label: t('col_purchase_no'), value: (p) => p.ref },
  date(),
  { label: t('col_supplier'), value: (p) => p.supplier_name || '' },
  { label: t('col_items'), value: (p) => p.items_text || '' },
  { ...money(t('col_total')), value: (p) => p.total },
  { ...money(t('col_paid')), value: (p) => p.paid },
  { ...money(t('col_payable')), value: (p) => Math.max(0, p.due) },
  { label: t('col_note'), value: (p) => p.note || '' },
];

export const supplierColumns = () => [
  { label: t('col_name'), value: (s) => s.name },
  { label: t('col_phone'), value: (s) => s.phone || '' },
  { label: t('col_address'), value: (s) => s.address || '' },
  { ...money(t('col_opening')), value: (s) => s.opening_balance },
  { ...money(t('col_supplier_balance')), value: (s) => s.balance },
  { label: t('col_note'), value: (s) => s.note || '' },
  { label: t('col_added'), value: (s) => fDate(s.created_at) },
];

export const stockColumns = () => [
  { label: t('col_cylinder'), value: (x) => x.name },
  { label: t('col_kg'), type: 'number', value: (x) => x.kg },
  { label: t('col_full'), type: 'number', value: (x) => x.full_qty },
  { label: t('col_empty'), type: 'number', value: (x) => x.empty_qty },
  { label: t('col_gas_kg'), type: 'number', value: (x) => (x.unit === 'kg' ? x.gas_kg : '') },
  { label: t('col_with_customers'), type: 'number', value: (x) => x.with_customers },
  { label: t('col_total_owned'), type: 'number', value: (x) => x.full_qty + x.empty_qty + x.with_customers },
  { label: t('col_low_level'), type: 'number', value: (x) => x.low_level },
  { label: t('col_stock_status'), value: (x) => (x.is_low ? t('st_low') : t('st_ok')) },
  { ...money(t('col_sale_price')), value: (x) => x.price },
  { ...money(t('col_wholesale_price')), value: (x) => x.wholesale_price },
  { ...money(t('col_purchase_price')), value: (x) => x.purchase_price },
  { ...money(t('col_deposit_rate')), value: (x) => x.deposit },
  { label: t('col_shown'), value: (x) => yes(x.active) },
];

export const moveColumns = () => [
  date(),
  time(),
  { label: t('col_cylinder'), value: (m) => m.type_name },
  { label: t('col_reason'), value: (m) => moveLabel(m.reason) },
  { label: t('col_full_change'), type: 'number', value: (m) => m.full_delta },
  { label: t('col_empty_change'), type: 'number', value: (m) => m.empty_delta },
  { label: t('col_kg_change'), type: 'number', value: (m) => Number(m.kg_delta) || '' },
  { label: t('col_reference'), value: (m) => m.ref || '' },
];

export const priceColumns = () => [
  { label: t('col_cylinder'), value: (x) => x.name },
  { ...money(t('col_sale_price')), value: (x) => x.price },
  { ...money(t('col_wholesale_price')), value: (x) => x.wholesale_price },
  { ...money(t('col_purchase_price')), value: (x) => x.purchase_price },
  { ...money(t('col_deposit_rate')), value: (x) => x.deposit },
];

export const priceHistoryColumns = () => [
  date(),
  { label: t('col_cylinder'), value: (h) => h.type_name },
  { label: t('col_price_kind'), value: (h) => t(`pk_${h.kind}`) },
  { ...money(t('col_old_price')), value: (h) => h.old_price },
  { ...money(t('col_new_price')), value: (h) => h.price },
  { label: t('col_note'), value: (h) => (h.note === 'opening' ? t('mv_opening') : h.note || '') },
];

export const specialPriceColumns = () => [
  { label: t('col_customer'), value: (r) => r.customer_name },
  { label: t('col_cylinder'), value: (r) => r.type_name },
  { ...money(t('col_normal_price')), value: (r) => r.default_price },
  { ...money(t('col_special_price')), value: (r) => r.price },
];

/** Customer statement (ledger) rows. */
export const ledgerColumns = () => [
  { label: t('col_date'), value: (e) => (e.kind === 'opening' ? '' : fDate(e.date)) },
  { label: t('col_entry'), value: (e) => (e.kind === 'opening' ? t('opening_balance') : e.kind === 'sale' ? `${t('sale')} ${e.ref}` : `${t('payment_received')} ${e.ref}`) },
  {
    label: t('col_detail'),
    value: (e) => (e.kind === 'payment' ? [methodLabel(e.method), ...(String(e.detail).includes('S-') ? [String(e.detail).split(' · ').pop()] : [])].join(', ') : e.detail || ''),
  },
  { ...money(t('col_debit')), value: (e) => e.debit || '' },
  { ...money(t('col_credit')), value: (e) => e.credit || '' },
  { ...money(t('col_running_balance')), value: (e) => e.balance },
];

/** Supplier statement (ledger) rows. */
export const supplierLedgerColumns = () => [
  { label: t('col_date'), value: (e) => (e.kind === 'opening' ? '' : fDate(e.date)) },
  { label: t('col_entry'), value: (e) => (e.kind === 'opening' ? t('opening_balance') : e.kind === 'purchase' ? `${t('purchase')} ${e.ref}` : t('paid_to_supplier')) },
  { label: t('col_detail'), value: (e) => (e.kind === 'payment' ? [methodLabel(e.method), e.ref].filter(Boolean).join(', ') : e.detail || '') },
  { ...money(t('col_debit_sup')), value: (e) => e.debit || '' },
  { ...money(t('col_credit')), value: (e) => e.credit || '' },
  { ...money(t('col_running_balance')), value: (e) => e.balance },
];

export const teamColumns = (lastSeen) => [
  { label: t('col_name'), value: (u) => u.name },
  { label: t('col_phone'), value: (u) => u.phone || '' },
  { label: t('col_email'), value: (u) => u.email || '' },
  { label: t('col_role'), value: (u) => t(`role_${u.role}`) },
  { label: t('col_account'), value: (u) => (u.active ? t('active') : t('turned_off')) },
  { label: t('col_last_seen'), value: (u) => (u.last_seen_at ? lastSeen(u.last_seen_at) : '') },
];

/** The report as one sheet: section, item, count, amount. */
export function reportRows(r, rangeText) {
  const rows = [{ section: t('x_report_period'), item: rangeText }];
  const add = (section, item, count, amount) => rows.push({ section, item, count, amount });
  add(t('summary'), t('sales'), r.sales.count, r.sales.total);
  add(t('summary'), t('col_full_sold'), r.qty, null);
  add(t('summary'), t('cash_received'), null, r.money_in_total);
  add(t('summary'), t('purchases'), r.purchases.count, r.purchases.total);
  add(t('summary'), t('est_profit'), null, r.est_profit);
  add(t('summary'), t('subtotal'), null, r.sales.subtotal);
  add(t('summary'), t('security_deposit'), null, r.sales.deposit);
  add(t('summary'), t('discount'), null, r.sales.discount);
  add(t('summary'), t('paid_to_supplier'), null, r.supplier_paid);
  add(t('summary'), t('new_customers'), r.new_customers, null);
  for (const x of r.by_type) {
    add(t('sales_by_type'), x.type_name, x.qty, x.amount);
    add(t('sales_by_type'), `${x.type_name}: ${t('col_margin')}`, null, x.est_profit);
  }
  for (const m of r.money_in) add(t('money_in'), methodLabel(m.method), m.count, m.amount);
  for (const d of r.by_day) add(t('sales_by_day'), fDate(d.day), d.count, d.total);
  return rows;
}

export const reportColumns = () => [
  { label: t('col_section'), value: (r) => r.section },
  { label: t('col_item'), value: (r) => r.item },
  { label: t('col_count'), type: 'number', value: (r) => r.count },
  { ...money(t('col_amount')), value: (r) => r.amount },
];

/**
 * Formatting crew data by type, so figures read like the rest of the app:
 * money with its currency and two decimals (unit prices up to four), counts
 * and quantities with thousands separators, percentages, days, readable dates
 * and Yes / No for flags. The type comes from the field name and the value.
 */

const MONEY = /(^|_)(price|unit_price|cost|unit_cost|value|revenue|total|amount|balance|paid|spend|gp|gross_profit|subtotal|tax|credit_limit|ar_open|ar_overdue|stock_value|line_value|lowest_price|highest_price)(_|$)|_main$|_eur$/i;
const UNIT_PRICE = /(^|_)(price|unit_price|unit_cost|lowest_price|highest_price|avg_buy_price|avg_sell_price)(_|$)/i;
const PCT = /(_pct$|^pct_|percent|margin_pct|share_pct|win_rate|collection_rate|repeat_rate)/i;
/** Digits that are identifiers, not quantities: never grouped or rounded. */
const TEXTY = /(^|_)(code|date_code|number|no|ref|reference|tracking|batch|bin|lot|stock_no|vat|phone|mobile|postal|zip|iban|bic|po|so_no|invoice|year_code)(_|$)/i;
const DAYS = /(^|_)days(_|$)|_days$|^dso/i;
const FLAG = /^(is_|has_)|(^|_)(overdue|primary|active|rohs|authorized_distributor|ok)$/i;
const DATE = /^\d{4}-\d{2}-\d{2}([T ][\d:.]+Z?)?$/;
const MONTH = /^\d{4}-\d{2}$/;
const NUMERIC = /^-?\d+(\.\d+)?$/;
const HIDDEN = /^(id|.*_id|__more|tracking_token)$/;

const LABELS = {
  gp: 'Gross profit', gp_main: 'Gross profit', qty: 'Qty', dso_days: 'DSO', pct: '%', hhi: 'HHI', rfqs: 'RFQs', rfq: 'RFQ',
  rate_to_main: 'Rate to main currency', po: 'PO', so: 'SO', coo: 'Origin', mpn: 'MPN', pn: 'Part number', avg: 'Avg', ar: 'Receivables', eur: 'EUR', uom: 'Unit',
};

const nf = (min, max) => new Intl.NumberFormat('en-US', { minimumFractionDigits: min, maximumFractionDigits: max });
const N0 = nf(0, 0);
const N2 = nf(2, 2);
const N3 = nf(0, 3);
const N4 = nf(2, 4);

export const hiddenKey = (k) => HIDDEN.test(k);

/** "value_main" → "Value", "qty_sold" → "Qty sold", "dso_days" → "DSO". */
export function labelFor(key) {
  if (LABELS[key]) return LABELS[key];
  const words = String(key).replace(/_main$|_eur$/i, '').split('_').filter(Boolean);
  return words.map((w, i) => LABELS[w] ?? (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w)).join(' ');
}

const currencyOf = (key, row, ctx) => {
  if (/_main$/i.test(key)) return ctx.main ?? row?.currency ?? '';
  if (/_eur$/i.test(key)) return 'EUR';
  return row?.price_currency ?? row?.currency ?? ctx.currency ?? ctx.main ?? '';
};

const fmtDate = (s) => {
  const d = new Date(s.length === 10 ? `${s}T00:00:00` : s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};
const fmtMonth = (s) => {
  const d = new Date(`${s}-01T00:00:00`);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
};

/**
 * Format one value. Returns { text, numeric } where numeric means it should be
 * right-aligned in a table.
 */
export function formatValue(key, value, row = null, ctx = {}) {
  if (value === null || value === undefined || value === '') return { text: 'n/a', numeric: false, empty: true };
  if (typeof value === 'boolean' || (FLAG.test(key) && (value === 0 || value === 1 || value === '0' || value === '1'))) {
    return { text: value === true || value === 1 || value === '1' ? 'Yes' : 'No', numeric: false };
  }
  if (TEXTY.test(key)) return { text: String(value), numeric: false };
  if (typeof value === 'string' && !NUMERIC.test(value)) {
    if (DATE.test(value)) return { text: fmtDate(value), numeric: false };
    if (MONTH.test(value)) return { text: fmtMonth(value), numeric: false };
    return { text: value, numeric: false };
  }
  if (typeof value === 'object') return { text: JSON.stringify(value), numeric: false };
  const n = Number(value);
  if (!Number.isFinite(n)) return { text: String(value), numeric: false };
  if (/(^|_)year$/.test(key)) return { text: String(n), numeric: true };
  if (/rate_to_main|rate_to_eur/.test(key)) return { text: nf(0, 6).format(n), numeric: true };
  if (PCT.test(key)) return { text: `${nf(0, 1).format(n)}%`, numeric: true };
  if (DAYS.test(key)) return { text: `${N0.format(n)} d`, numeric: true };
  if (MONEY.test(key)) {
    const cur = currencyOf(key, row, ctx);
    const body = UNIT_PRICE.test(key) || (Math.abs(n) < 1 && n !== 0) ? N4.format(n) : N2.format(n);
    return { text: cur ? `${body} ${cur}` : body, numeric: true };
  }
  return { text: Number.isInteger(n) ? N0.format(n) : N3.format(n), numeric: true };
}

/** Plain numbers and ISO dates inside markdown table cells. */
export function formatCell(text) {
  const t = String(text).trim();
  if (DATE.test(t)) return fmtDate(t);
  if (MONTH.test(t)) return fmtMonth(t);
  if (/^-?\d{4,}(\.\d+)?$/.test(t)) return Number(t) % 1 === 0 ? N0.format(Number(t)) : N2.format(Number(t));
  const money = t.match(/^(-?\d{4,}(?:\.\d+)?)\s?([A-Z]{3})$/);
  if (money) return `${N2.format(Number(money[1]))} ${money[2]}`;
  return text;
}

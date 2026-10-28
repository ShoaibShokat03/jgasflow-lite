/** Same number and date formats as the mobile app (lib/core/fmt.dart). */

let currency = 'Rs';
export const setCurrency = (c) => {
  currency = c || 'Rs';
};
export const getCurrency = () => currency;

const n0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const n2 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

export const num0 = (v) => {
  const x = Number(v) || 0;
  return x === Math.round(x) ? n0.format(x) : n2.format(x);
};

export const money = (v) => {
  const x = Number(v) || 0;
  return `${currency} ${x < 0 ? '-' : ''}${num0(Math.abs(x))}`;
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const parts = (s) => {
  const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
  if (!m) return null;
  return { y: +m[1], mo: +m[2], d: +m[3], h: m[4] ? +m[4] : 0, mi: m[5] ? +m[5] : 0 };
};

export const fDate = (s) => {
  const p = parts(s);
  return p ? `${String(p.d).padStart(2, '0')} ${MONTHS[p.mo - 1]} ${p.y}` : '';
};
export const fDateShort = (s) => {
  const p = parts(s);
  return p ? `${String(p.d).padStart(2, '0')} ${MONTHS[p.mo - 1]}` : '';
};
export const fTime = (s) => {
  const p = parts(s);
  if (!p) return '';
  const h12 = p.h % 12 || 12;
  return `${String(h12).padStart(2, '0')}:${String(p.mi).padStart(2, '0')} ${p.h < 12 ? 'AM' : 'PM'}`;
};
export const fDateTime = (s) => (parts(s) ? `${fDate(s)}, ${fTime(s)}` : '');
export const fDay = (d = new Date()) => `${DAYS[d.getDay()]}, ${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;

const pad = (n) => String(n).padStart(2, '0');
/** 'yyyy-MM-dd' for a local Date. */
export const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** 'yyyy-MM-dd HH:mm:ss' for a local Date. */
export const toDb = (d = new Date()) => `${dayKey(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

/** Period chips: today | week | month | all -> {from, to} day keys. */
export function periodRange(p) {
  const now = new Date();
  const today = dayKey(now);
  if (p === 'today') return { from: today, to: today };
  if (p === 'week') {
    const d = new Date(now);
    d.setDate(d.getDate() - 6);
    return { from: dayKey(d), to: today };
  }
  if (p === 'month') return { from: dayKey(new Date(now.getFullYear(), now.getMonth(), 1)), to: today };
  return { from: undefined, to: undefined };
}

export const initials = (name = '') => {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (!p.length) return '?';
  if (p.length === 1) return p[0][0].toUpperCase();
  return (p[0][0] + p[1][0]).toUpperCase();
};

export const PAYMENT_METHODS = ['cash', 'bank', 'jazzcash', 'easypaisa', 'cheque'];

/** Text for a number input: empty for zero. */
export const numInput = (v) => (!v ? '' : String(v));
export const parseNum = (s) => Number(String(s ?? '').replace(/,/g, '').trim()) || 0;

/** One cylinder's price or deposit; the API refuses more (same limit). */
export const MAX_UNIT_PRICE = 500000;
/** One amount (payment, balance, discount, entry): at most Rs 1 crore, same as the server. */
export const MAX_AMOUNT = 10000000;
/** Loss per cylinder when buying costs more than selling, else 0. */
export const lossPerCylinder = (sale, purchase) => (sale > 0 && purchase > 0 && purchase > sale ? purchase - sale : 0);

export const daysAgo = (s) => {
  if (!s) return '';
  const t = new Date(String(s).replace(' ', 'T')).getTime();
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
};

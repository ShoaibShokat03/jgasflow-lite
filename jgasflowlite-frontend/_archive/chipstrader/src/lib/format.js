const nf = new Map();
const numberFormat = (min, max) => {
  const key = `${min}-${max}`;
  if (!nf.has(key)) nf.set(key, new Intl.NumberFormat('en-US', { minimumFractionDigits: min, maximumFractionDigits: max }));
  return nf.get(key);
};

export const fmtMoney = (v, currency) => {
  if (v === null || v === undefined || v === '') return '';
  const s = numberFormat(2, 2).format(Number(v));
  return currency ? `${s} ${currency}` : s;
};

/** Unit prices for components often need more than two decimals. */
export const fmtPrice = (v) => (v === null || v === undefined || v === '' ? '' : numberFormat(2, 6).format(Number(v)));

export const fmtQty = (v) => (v === null || v === undefined || v === '' ? '' : numberFormat(0, 3).format(Number(v)));

/** 12.4k, 1.2M, for dashboard tiles. */
export const fmtCompact = (v) =>
  new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(Number(v) || 0);

export const fmtDate = (v) => {
  if (!v) return '';
  const d = typeof v === 'string' && v.length === 10 ? new Date(`${v}T00:00:00`) : new Date(v);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

export const fmtDateTime = (v) =>
  v ? new Date(v).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

export const fmtRelative = (v) => {
  if (!v) return '';
  const diff = (Date.now() - new Date(v).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
  return fmtDate(v);
};

export const today = () => new Date().toISOString().slice(0, 10);

export const humanize = (s) => (s ? String(s).replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()) : '');

export const fmtBytes = (n) => {
  if (!n) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), u.length - 1);
  return `${(n / 1024 ** i).toFixed(i ? 1 : 0)} ${u[i]}`;
};

export const personName = (p) => (p ? [p.salutation, p.first_name, p.last_name].filter(Boolean).join(' ') : '');

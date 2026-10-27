import { useState } from 'react';
import { dayKey, fDate, periodRange } from '@/lib/format';
import { t } from '@/lib/i18n';
import { Chips, DateInput } from './form';
import { cn } from './kit';

const KEY = 'jgf-period:';
const read = (k, fallback) => {
  try {
    const v = JSON.parse(sessionStorage.getItem(KEY + k) || 'null');
    return v ?? fallback;
  } catch {
    return fallback;
  }
};
const write = (k, v) => {
  try {
    sessionStorage.setItem(KEY + k, JSON.stringify(v));
  } catch {
    /* storage blocked: the choice lasts until reload */
  }
};

export const PERIOD_OPTIONS = () => [
  { value: 'today', label: t('today') },
  { value: 'week', label: t('last_7_days') },
  { value: 'month', label: t('this_month') },
  { value: 'all', label: t('all') },
  { value: 'custom', label: t('custom') },
];

/** A custom range is always from <= to, and never empty. */
function tidy(c) {
  let from = c?.from || dayKey();
  let to = c?.to || from;
  if (from > to) [from, to] = [to, from];
  return { from, to };
}

/**
 * The period a list or report shows: Today, Last 7 days, This month, All or a
 * custom range. `key` remembers the choice per page while the tab is open.
 * range = { from, to } day keys (both undefined for All).
 */
export function usePeriod(key, initial = 'today') {
  const [period, setPeriodState] = useState(() => read(`${key}:p`, initial));
  const [custom, setCustomState] = useState(() => tidy(read(`${key}:c`, { from: dayKey(), to: dayKey() })));
  const setPeriod = (p) => (setPeriodState(p), write(`${key}:p`, p));
  const setCustom = (c) => {
    const next = typeof c === 'function' ? c(custom) : c;
    setCustomState(next);
    write(`${key}:c`, next);
  };
  const range = period === 'custom' ? tidy(custom) : periodRange(period);
  const label = range.from ? (range.from === range.to ? fDate(range.from) : `${fDate(range.from)} ${t('to')} ${fDate(range.to)}`) : t('all');
  return { period, setPeriod, custom, setCustom, range, label, isAll: !range.from };
}

/** Period chips, with From and To dates when Custom is chosen. */
export function PeriodFilter({ p, className, right }) {
  return (
    <div className={cn('no-print', className)}>
      <div className="flex flex-col sm:flex-row gap-2.5">
        <Chips value={p.period} onChange={p.setPeriod} options={PERIOD_OPTIONS()} />
        {right}
      </div>
      {p.period === 'custom' && (
        <div className="grid grid-cols-2 gap-3 max-w-md mt-2.5">
          <DateInput label={t('from')} value={p.custom.from} onChange={(v) => p.setCustom((s) => ({ ...s, from: v }))} max={dayKey()} />
          <DateInput label={t('to')} value={p.custom.to} onChange={(v) => p.setCustom((s) => ({ ...s, to: v }))} max={dayKey()} />
        </div>
      )}
    </div>
  );
}

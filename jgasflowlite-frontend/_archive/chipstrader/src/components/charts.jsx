import { useState } from 'react';
import { fmtCompact, fmtMoney } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * Tiny SVG charts, no chart library, so the dashboard ships in a few KB and
 * renders instantly. Colours come from the brand tokens and adapt to dark mode.
 */

const monthLabel = (ym) => new Date(`${ym}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'short' });

/** Revenue bars with a gross-profit line. */
export function RevenueChart({ data, currency, height = 220 }) {
  const [hover, setHover] = useState(null);
  const w = 640;
  const h = height;
  const pad = { l: 44, r: 8, t: 12, b: 26 };
  const max = Math.max(1, ...data.map((d) => Math.max(d.revenue, d.gp)));
  const nice = niceMax(max);
  const iw = w - pad.l - pad.r;
  const ih = h - pad.t - pad.b;
  const bw = (iw / data.length) * 0.56;
  const x = (i) => pad.l + (iw / data.length) * (i + 0.5);
  const y = (v) => pad.t + ih - (Math.max(0, v) / nice) * ih;
  const line = data.map((d, i) => `${i ? 'L' : 'M'}${x(i)},${y(d.gp)}`).join(' ');

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto" role="img" aria-label="Revenue and gross profit by month">
        <defs>
          <linearGradient id="bar" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--ct-chart-1)" />
            <stop offset="1" stopColor="var(--ct-chart-1)" stopOpacity="0.85" />
          </linearGradient>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={w - pad.r} y1={y(nice * t)} y2={y(nice * t)} stroke="var(--color-line)" strokeDasharray={t ? '3 4' : undefined} />
            <text x={pad.l - 8} y={y(nice * t) + 4} textAnchor="end" className="fill-faint text-[11px]">
              {fmtCompact(nice * t)}
            </text>
          </g>
        ))}
        {data.map((d, i) => (
          <g key={d.month} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <rect x={x(i) - (iw / data.length) / 2} y={pad.t} width={iw / data.length} height={ih} fill="transparent" />
            <rect x={x(i) - bw / 2} y={y(d.revenue)} width={bw} height={Math.max(0, pad.t + ih - y(d.revenue))} rx="4" fill="url(#bar)" opacity={hover === null || hover === i ? 1 : 0.45} className="transition-opacity" />
            <text x={x(i)} y={h - 8} textAnchor="middle" className="fill-faint text-[11px]">
              {monthLabel(d.month)}
            </text>
          </g>
        ))}
        <path d={line} fill="none" stroke="var(--ct-chart-2)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {data.map((d, i) => (
          <circle key={i} cx={x(i)} cy={y(d.gp)} r={hover === i ? 4.5 : 3} fill="var(--color-surface)" stroke="var(--ct-chart-2)" strokeWidth="2" />
        ))}
      </svg>
      {hover !== null && (
        <div className="absolute top-2 card shadow-[var(--shadow-pop)] px-3 py-2 text-xs pointer-events-none" style={{ left: `${Math.min(70, (x(hover) / w) * 100)}%` }}>
          <p className="font-semibold mb-1">{new Date(`${data[hover].month}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</p>
          <p className="flex justify-between gap-4"><span className="text-muted">Revenue</span>{fmtMoney(data[hover].revenue, currency)}</p>
          <p className="flex justify-between gap-4"><span className="text-muted">Gross profit</span>{fmtMoney(data[hover].gp, currency)}</p>
          <p className="flex justify-between gap-4"><span className="text-muted">Invoices</span>{data[hover].invoices}</p>
        </div>
      )}
      <div className="flex items-center gap-4 text-xs text-muted mt-1 pl-11">
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-[var(--ct-chart-1)]" />Revenue</span>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full border-2 border-[var(--ct-chart-2)]" />Gross profit</span>
      </div>
    </div>
  );
}

/** Ranked horizontal bars, top customers, top parts, leaderboard. */
export function BarList({ items, valueKey = 'value', labelKey = 'label', format = (v) => fmtCompact(v), sub, onClick }) {
  const max = Math.max(1, ...items.map((i) => i[valueKey]));
  if (!items.length) return <p className="text-sm text-muted py-6 text-center">No data yet</p>;
  return (
    <ul className="space-y-2.5">
      {items.map((it, i) => (
        <li key={i} className={cn(onClick && 'cursor-pointer group')} onClick={onClick ? () => onClick(it) : undefined}>
          <div className="flex items-center justify-between text-[13px] mb-1 gap-3">
            <span className="truncate group-hover:text-link">{it[labelKey]}</span>
            <span className="font-medium tabular-nums shrink-0">{format(it[valueKey])}</span>
          </div>
          <div className="h-1.5 rounded-full bg-surface-3 overflow-hidden">
            <div className="h-full rounded-full bg-brand-600 dark:bg-brand-400" style={{ width: `${(it[valueKey] / max) * 100}%` }} />
          </div>
          {sub && <p className="text-[11px] text-faint mt-0.5">{sub(it)}</p>}
        </li>
      ))}
    </ul>
  );
}

/**
 * Pipeline funnel. Text never sits on top of a bar: the stage name, count and
 * value are on their own line in ink/muted, so contrast holds in both themes
 * whatever the bar length.
 */
export function Funnel({ stages, currency }) {
  const max = Math.max(1, ...stages.map((s) => s.value));
  return (
    <div className="space-y-3.5">
      {stages.map((s) => (
        <div key={s.stage}>
          <div className="flex items-baseline justify-between gap-3 text-[13px] mb-1.5">
            <span className="text-muted">
              {s.stage} <span className="chip h-5 px-1.5 ml-1 bg-surface-3 text-ink">{s.count}</span>
            </span>
            <span className="font-semibold tabular-nums">{fmtMoney(s.value, currency)}</span>
          </div>
          <div className="h-2 rounded-full bg-surface-3 overflow-hidden">
            <div className="h-full rounded-full bg-brand-600 dark:bg-brand-400 transition-[width] duration-700" style={{ width: `${s.value > 0 ? Math.max(3, (s.value / max) * 100) : 0}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Stacked aging bar with a legend. */
export function AgingBar({ buckets, currency }) {
  const total = buckets.reduce((a, b) => a + b.amount, 0);
  const colors = ['bg-emerald-500', 'bg-amber-400', 'bg-orange-500', 'bg-rose-500', 'bg-rose-700'];
  return (
    <div>
      <div className="flex h-3 rounded-full overflow-hidden bg-surface-3">
        {total > 0 && buckets.map((b, i) => b.amount > 0 && <div key={b.bucket} className={colors[i]} style={{ width: `${(b.amount / total) * 100}%` }} title={`${b.bucket}: ${fmtMoney(b.amount, currency)}`} />)}
      </div>
      <div className="grid grid-cols-5 gap-2 mt-3">
        {buckets.map((b, i) => (
          <div key={b.bucket}>
            <div className="flex items-center gap-1.5 text-[11px] text-muted"><span className={cn('size-2 rounded-full', colors[i])} />{b.bucket}</div>
            <p className="text-[13px] font-semibold tabular-nums mt-0.5">{fmtCompact(b.amount)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function niceMax(v) {
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}

import { useState } from 'react';
import { fmtCompact, fmtMoney } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * SVG charts for the Analytics tab. Same rules as charts.jsx: no library,
 * colours from theme tokens, text never drawn on top of a filled shape.
 */

const monthShort = (ym) => new Date(`${ym}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'short' });
const monthLong = (ym) => new Date(`${ym}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

function niceMax(v) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}

function Tooltip({ x, w, children }) {
  return (
    <div className="absolute top-2 card shadow-[var(--shadow-pop)] px-3 py-2 text-xs pointer-events-none z-10 min-w-[180px]" style={{ left: `${Math.min(62, Math.max(0, (x / w) * 100 - 10))}%` }}>
      {children}
    </div>
  );
}

const Row = ({ label, children }) => (
  <p className="flex justify-between gap-4"><span className="text-muted">{label}</span><span className="tabular-nums">{children}</span></p>
);

function Legend({ items }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted mt-1 pl-11">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5">
          {i.swatch}
          {i.label}
        </span>
      ))}
    </div>
  );
}

/**
 * Monthly revenue with its 3-month moving average, the fitted trend line and a
 * 3-month forecast drawn dashed inside its 95% prediction band. Outlier months
 * get a ring.
 */
export function ForecastChart({ trend, forecast, anomalies = [], currency, height = 260 }) {
  const [hover, setHover] = useState(null);
  const points = [...trend.map((t) => ({ ...t, kind: 'actual' })), ...forecast.months.map((f) => ({ month: f.month, value: f.value, low: f.low, high: f.high, kind: 'forecast' }))];
  const w = 680;
  const h = height;
  const pad = { l: 44, r: 10, t: 14, b: 26 };
  const iw = w - pad.l - pad.r;
  const ih = h - pad.t - pad.b;
  const max = niceMax(Math.max(1, ...trend.map((t) => Math.max(t.revenue, t.ma3, t.trend)), ...forecast.months.map((f) => f.high)));
  const step = iw / Math.max(1, points.length - 1);
  const x = (i) => pad.l + i * step;
  const y = (v) => pad.t + ih - (Math.max(0, v) / max) * ih;
  const n = trend.length;
  const path = (vals, from = 0) => vals.map((v, i) => `${i ? 'L' : 'M'}${x(i + from)},${y(v)}`).join(' ');
  const outlierSet = new Set(anomalies.map((a) => a.month));

  // Forecast band starts at the last actual point so the shape joins the line.
  const last = trend[n - 1];
  const bandTop = [{ i: n - 1, v: last.revenue }, ...forecast.months.map((f, k) => ({ i: n + k, v: f.high }))];
  const bandLow = [...forecast.months.map((f, k) => ({ i: n + k, v: f.low })).reverse(), { i: n - 1, v: last.revenue }];
  const band = [...bandTop, ...bandLow].map((p, k) => `${k ? 'L' : 'M'}${x(p.i)},${y(p.v)}`).join(' ') + 'Z';
  const area = `${path(trend.map((t) => t.revenue))} L${x(n - 1)},${pad.t + ih} L${x(0)},${pad.t + ih}Z`;
  const hp = hover !== null ? points[hover] : null;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto" role="img" aria-label="Monthly revenue with trend and forecast">
        <defs>
          <linearGradient id="fc-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--ct-chart-1)" stopOpacity="0.18" />
            <stop offset="1" stopColor="var(--ct-chart-1)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={w - pad.r} y1={y(max * t)} y2={y(max * t)} stroke="var(--color-line)" strokeDasharray={t ? '3 4' : undefined} />
            <text x={pad.l - 8} y={y(max * t) + 4} textAnchor="end" className="fill-faint text-[11px]">{fmtCompact(max * t)}</text>
          </g>
        ))}
        <rect x={x(n - 1)} y={pad.t} width={x(points.length - 1) - x(n - 1) + pad.r} height={ih} fill="var(--color-surface-2)" />
        <text x={x(n - 1) + 6} y={pad.t + 12} className="fill-faint text-[10.5px]">Forecast</text>
        <path d={band} fill="var(--ct-chart-1)" opacity="0.14" />
        <path d={area} fill="url(#fc-area)" />
        <path d={path(trend.map((t) => t.trend))} fill="none" stroke="var(--color-faint)" strokeWidth="1.5" strokeDasharray="2 4" />
        <path d={path(trend.map((t) => t.ma3))} fill="none" stroke="var(--ct-chart-2)" strokeWidth="2" strokeLinejoin="round" />
        <path d={path(trend.map((t) => t.revenue))} fill="none" stroke="var(--ct-chart-1)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        <path d={path([last.revenue, ...forecast.months.map((f) => f.value)], n - 1)} fill="none" stroke="var(--ct-chart-1)" strokeWidth="2.5" strokeDasharray="6 5" strokeLinecap="round" />
        {points.map((p, i) => (
          <g key={p.month} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <rect x={x(i) - step / 2} y={pad.t} width={step} height={ih} fill="transparent" />
            {(points.length <= 15 || i % 2 === 0) && (
              <text x={x(i)} y={h - 8} textAnchor="middle" className="fill-faint text-[11px]">{monthShort(p.month)}</text>
            )}
            {p.kind === 'actual' && outlierSet.has(p.month) && <circle cx={x(i)} cy={y(p.revenue)} r="8" fill="none" stroke="var(--color-warning)" strokeWidth="2" />}
            <circle cx={x(i)} cy={y(p.kind === 'actual' ? p.revenue : p.value)} r={hover === i ? 4.5 : 3} fill="var(--color-surface)" stroke="var(--ct-chart-1)" strokeWidth="2" />
          </g>
        ))}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + ih} stroke="var(--color-line-strong)" />}
      </svg>
      {hp && (
        <Tooltip x={x(hover)} w={w}>
          <p className="font-semibold mb-1">{monthLong(hp.month)}{hp.kind === 'forecast' && <span className="text-muted font-normal"> (forecast)</span>}</p>
          {hp.kind === 'actual' ? (
            <>
              <Row label="Revenue">{fmtMoney(hp.revenue, currency)}</Row>
              <Row label="3-month average">{fmtMoney(hp.ma3, currency)}</Row>
              <Row label="Trend">{fmtMoney(hp.trend, currency)}</Row>
              <Row label="Invoices">{hp.invoices}</Row>
              {outlierSet.has(hp.month) && <p className="text-warning mt-1">Unusual month compared with the trend</p>}
            </>
          ) : (
            <>
              <Row label="Expected">{fmtMoney(hp.value, currency)}</Row>
              <Row label="Likely range">{fmtCompact(hp.low)} to {fmtCompact(hp.high)}</Row>
            </>
          )}
        </Tooltip>
      )}
      <Legend
        items={[
          { label: 'Revenue', swatch: <span className="w-4 h-0.5 rounded bg-[var(--ct-chart-1)]" /> },
          { label: '3-month average', swatch: <span className="w-4 h-0.5 rounded bg-[var(--ct-chart-2)]" /> },
          { label: 'Trend', swatch: <span className="w-4 border-t-2 border-dotted border-faint" /> },
          { label: 'Forecast (95% range)', swatch: <span className="w-4 h-2.5 rounded-sm bg-[var(--ct-chart-1)] opacity-30" /> },
          ...(anomalies.length ? [{ label: 'Unusual month', swatch: <span className="size-2.5 rounded-full border-2 border-warning" /> }] : []),
        ]}
      />
    </div>
  );
}

const CLASS_FILL = { A: 'var(--ct-chart-1)', B: 'var(--ct-chart-2)', C: 'var(--color-faint)' };

/** Pareto: customers ranked by revenue (bars) with the cumulative share (line). */
export function ParetoChart({ rows, currency, onClick, height = 240 }) {
  const [hover, setHover] = useState(null);
  if (!rows.length) return <p className="text-sm text-muted py-10 text-center">No customer revenue in this period</p>;
  const w = 680;
  const h = height;
  const pad = { l: 44, r: 40, t: 14, b: 30 };
  const iw = w - pad.l - pad.r;
  const ih = h - pad.t - pad.b;
  const max = niceMax(Math.max(...rows.map((r) => r.revenue)));
  const slot = iw / rows.length;
  const bw = Math.min(36, slot * 0.66);
  const x = (i) => pad.l + slot * (i + 0.5);
  const y = (v) => pad.t + ih - (v / max) * ih;
  const yp = (p) => pad.t + ih - (p / 100) * ih;
  const line = rows.map((r, i) => `${i ? 'L' : 'M'}${x(i)},${yp(r.cumulative_pct)}`).join(' ');
  const hr = hover !== null ? rows[hover] : null;
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto" role="img" aria-label="Pareto chart of revenue by customer">
        {[0, 0.5, 1].map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={w - pad.r} y1={y(max * t)} y2={y(max * t)} stroke="var(--color-line)" strokeDasharray={t ? '3 4' : undefined} />
            <text x={pad.l - 8} y={y(max * t) + 4} textAnchor="end" className="fill-faint text-[11px]">{fmtCompact(max * t)}</text>
          </g>
        ))}
        {[0, 50, 80, 100].map((p) => (
          <text key={p} x={w - pad.r + 6} y={yp(p) + 4} className={cn('text-[11px]', p === 80 ? 'fill-warning font-semibold' : 'fill-faint')}>{p}%</text>
        ))}
        <line x1={pad.l} x2={w - pad.r} y1={yp(80)} y2={yp(80)} stroke="var(--color-warning)" strokeDasharray="5 4" />
        {rows.map((r, i) => (
          <g key={r.id} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onClick={onClick ? () => onClick(r) : undefined} className={onClick ? 'cursor-pointer' : undefined}>
            <rect x={x(i) - slot / 2} y={pad.t} width={slot} height={ih} fill="transparent" />
            <rect x={x(i) - bw / 2} y={y(r.revenue)} width={bw} height={pad.t + ih - y(r.revenue)} rx="3" fill={CLASS_FILL[r.class]} opacity={hover === null || hover === i ? 1 : 0.5} />
            <text x={x(i)} y={h - 10} textAnchor="middle" className="fill-faint text-[11px]">{i + 1}</text>
          </g>
        ))}
        <path d={line} fill="none" stroke="var(--color-ink)" strokeWidth="1.75" strokeLinejoin="round" />
        {rows.map((r, i) => <circle key={r.id} cx={x(i)} cy={yp(r.cumulative_pct)} r={hover === i ? 4 : 2.5} fill="var(--color-surface)" stroke="var(--color-ink)" strokeWidth="1.5" />)}
      </svg>
      {hr && (
        <Tooltip x={x(hover)} w={w}>
          <p className="font-semibold mb-1 truncate max-w-[220px]">{hover + 1}. {hr.name}</p>
          <Row label="Revenue">{fmtMoney(hr.revenue, currency)}</Row>
          <Row label="Share">{hr.share_pct}%</Row>
          <Row label="Running total">{hr.cumulative_pct}%</Row>
          <Row label="Class">{hr.class}</Row>
        </Tooltip>
      )}
      <Legend
        items={[
          { label: 'Class A', swatch: <span className="size-2.5 rounded-sm bg-[var(--ct-chart-1)]" /> },
          { label: 'Class B', swatch: <span className="size-2.5 rounded-sm bg-[var(--ct-chart-2)]" /> },
          { label: 'Class C', swatch: <span className="size-2.5 rounded-sm bg-faint" /> },
          { label: 'Running share of revenue', swatch: <span className="w-4 h-0.5 rounded bg-ink" /> },
        ]}
      />
    </div>
  );
}

/** Invoice value distribution. Count above each bar, value range below. */
export function Histogram({ bins, currency }) {
  if (!bins.length) return <p className="text-sm text-muted py-10 text-center">No invoices in this period</p>;
  const max = Math.max(...bins.map((b) => b.count));
  return (
    <div>
      <div className="flex items-end gap-1.5 h-40">
        {bins.map((b) => (
          <div key={b.from} className="flex-1 flex flex-col items-center justify-end h-full min-w-0" title={`${fmtCompact(b.from)} to ${fmtCompact(b.to)} ${currency}: ${b.count} invoices, ${fmtMoney(b.total, currency)}`}>
            <span className="text-[11px] font-semibold tabular-nums mb-1">{b.count}</span>
            <div className="w-full rounded-t-md bg-brand-600 dark:bg-brand-400" style={{ height: `${Math.max(4, (b.count / max) * 100)}%` }} />
          </div>
        ))}
      </div>
      <div className="flex gap-1.5 mt-1.5 border-t border-line pt-1.5">
        {bins.map((b) => (
          <span key={b.from} className="flex-1 min-w-0 text-center text-[10.5px] text-faint tabular-nums truncate">{fmtCompact(b.from)}+</span>
        ))}
      </div>
      <p className="text-[11px] text-faint mt-1 text-center">Invoice value ({currency})</p>
    </div>
  );
}

const DAY_LABELS = ['Mon', '', 'Wed', '', 'Fri', '', ''];

/** Calendar heatmap of invoiced revenue per day, weeks as columns. */
export function Heatmap({ days, currency }) {
  const [hover, setHover] = useState(null);
  const weeks = [];
  days.forEach((d, i) => {
    if (i % 7 === 0) weeks.push([]);
    weeks[weeks.length - 1].push(d);
  });
  const positives = days.map((d) => d.value).filter((v) => v > 0).sort((a, b) => a - b);
  // Quartile thresholds so a single huge day does not wash out the rest.
  const q = (p) => positives[Math.min(positives.length - 1, Math.floor(p * positives.length))] ?? 0;
  const cuts = [q(0.25), q(0.5), q(0.75)];
  const level = (v) => (v <= 0 ? 0 : v <= cuts[0] ? 1 : v <= cuts[1] ? 2 : v <= cuts[2] ? 3 : 4);
  const fills = ['var(--color-surface-3)', 'color-mix(in oklab, var(--ct-chart-1) 30%, var(--color-surface))', 'color-mix(in oklab, var(--ct-chart-1) 55%, var(--color-surface))', 'color-mix(in oklab, var(--ct-chart-1) 78%, var(--color-surface))', 'var(--ct-chart-1)'];
  const activeDays = positives.length;
  return (
    <div>
      <div className="flex gap-2">
        <div className="grid grid-rows-7 gap-[3px] text-[10px] text-faint pt-4">
          {DAY_LABELS.map((l, i) => <span key={i} className="h-3 leading-3">{l}</span>)}
        </div>
        <div className="flex-1 overflow-x-auto">
          <div className="flex gap-[3px] text-[10px] text-faint h-4">
            {weeks.map((wk, i) => {
              const first = new Date(`${wk[0].date}T00:00:00`);
              const show = i === 0 || first.getDate() <= 7;
              return <span key={i} className="w-3 shrink-0 overflow-visible whitespace-nowrap">{show ? first.toLocaleDateString('en-GB', { month: 'short' }) : ''}</span>;
            })}
          </div>
          <div className="flex gap-[3px]">
            {weeks.map((wk, i) => (
              <div key={i} className="grid grid-rows-7 gap-[3px]">
                {wk.map((d) => (
                  <span key={d.date} className="size-3 rounded-[3px]" style={{ background: fills[level(d.value)] }} onMouseEnter={() => setHover(d)} onMouseLeave={() => setHover(null)} />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 mt-2 text-[11px] text-muted min-h-5">
        <span>{hover ? <><span className="font-medium text-ink">{new Date(`${hover.date}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</span>: {hover.value ? fmtMoney(hover.value, currency) : 'no invoices'}</> : `${activeDays} invoicing day${activeDays === 1 ? '' : 's'} in 26 weeks`}</span>
        <span className="flex items-center gap-1">Less{fills.map((f, i) => <span key={i} className="size-3 rounded-[3px]" style={{ background: f }} />)}More</span>
      </div>
    </div>
  );
}

/** Gross margin % per month as a small line with the period average. */
export function MarginChart({ trend, height = 150 }) {
  const pts = trend.map((t, i) => ({ i, m: t.margin, month: t.month })).filter((p) => p.m !== null);
  if (pts.length < 2) return <p className="text-sm text-muted py-8 text-center">Needs at least two months with sales</p>;
  const w = 680;
  const h = height;
  const pad = { l: 44, r: 10, t: 12, b: 24 };
  const iw = w - pad.l - pad.r;
  const ih = h - pad.t - pad.b;
  const lo = Math.min(0, ...pts.map((p) => p.m));
  const hi = Math.max(10, ...pts.map((p) => p.m));
  const x = (i) => pad.l + (iw / Math.max(1, trend.length - 1)) * i;
  const y = (v) => pad.t + ih - ((v - lo) / (hi - lo || 1)) * ih;
  const avg = pts.reduce((s, p) => s + p.m, 0) / pts.length;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto" role="img" aria-label="Gross margin by month">
      {[lo, (lo + hi) / 2, hi].map((v) => (
        <g key={v}>
          <line x1={pad.l} x2={w - pad.r} y1={y(v)} y2={y(v)} stroke="var(--color-line)" strokeDasharray="3 4" />
          <text x={pad.l - 8} y={y(v) + 4} textAnchor="end" className="fill-faint text-[11px]">{Math.round(v)}%</text>
        </g>
      ))}
      <line x1={pad.l} x2={w - pad.r} y1={y(avg)} y2={y(avg)} stroke="var(--ct-chart-2)" strokeDasharray="6 4" />
      <text x={w - pad.r} y={y(avg) - 5} textAnchor="end" className="fill-info text-[11px] font-medium">avg {avg.toFixed(1)}%</text>
      <path d={pts.map((p, k) => `${k ? 'L' : 'M'}${x(p.i)},${y(p.m)}`).join(' ')} fill="none" stroke="var(--ct-chart-1)" strokeWidth="2.25" strokeLinejoin="round" />
      {pts.map((p) => (
        <circle key={p.i} cx={x(p.i)} cy={y(p.m)} r="3" fill="var(--color-surface)" stroke="var(--ct-chart-1)" strokeWidth="2"><title>{`${monthLong(p.month)}: ${p.m}%`}</title></circle>
      ))}
      {trend.map((t, i) => (trend.length <= 12 || i % 2 === 0) && <text key={t.month} x={x(i)} y={h - 6} textAnchor="middle" className="fill-faint text-[11px]">{monthShort(t.month)}</text>)}
    </svg>
  );
}

/** Horizontal bars for stock aging buckets, value on the right. */
export function BucketBars({ buckets, currency, tones = ['bg-emerald-500', 'bg-amber-400', 'bg-orange-500', 'bg-rose-600'] }) {
  const max = Math.max(1, ...buckets.map((b) => b.value));
  return (
    <ul className="space-y-2.5">
      {buckets.map((b, i) => (
        <li key={b.bucket}>
          <div className="flex items-center justify-between text-[13px] mb-1 gap-3">
            <span className="text-muted">{b.bucket} <span className="text-faint text-xs">· {b.lots} lot{b.lots === 1 ? '' : 's'}</span></span>
            <span className="font-medium tabular-nums">{fmtMoney(b.value, currency)}</span>
          </div>
          <div className="h-2 rounded-full bg-surface-3 overflow-hidden">
            <div className={cn('h-full rounded-full', tones[i])} style={{ width: `${(b.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  AlertOctagon, AlertTriangle, Boxes, CalendarClock, CheckCircle2, Clock, FileClock, Gauge, Info, Lightbulb, PackageX, Percent, PieChart, Receipt,
  Timer, TrendingDown, TrendingUp, TriangleAlert, Trophy, Truck, Wallet,
} from 'lucide-react';
import { get } from '@/lib/api';
import { fmtCompact, fmtDate, fmtMoney, fmtQty } from '@/lib/format';
import { useMaster, useMe } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { Card, CardHeader, PageHeader, Skeleton, StatTile } from '@/components/ui/core';
import { StatusBadge } from '@/components/ui/status';
import { AgingBar, BarList, Funnel } from '@/components/charts';
import { BucketBars, ForecastChart, Heatmap, Histogram, MarginChart, ParetoChart } from '@/components/analytics-charts';

/**
 * One dashboard: today's operational numbers and the analytics for the chosen
 * period, laid out on a 3-column grid. Every row's cards stretch to the same
 * height, and short labels never wrap.
 */

const PERIODS = [
  { value: 'today', label: 'Today' },
  { value: 'month', label: 'This month' },
  { value: '6m', label: '6 months' },
  { value: '12m', label: '12 months' },
  { value: '24m', label: '24 months' },
  { value: 'all', label: 'All time' },
];
const DEFAULT_PERIOD = 'all';

const FINDING = {
  good: { icon: CheckCircle2, cls: 'text-success' },
  warn: { icon: TriangleAlert, cls: 'text-warning' },
  bad: { icon: AlertOctagon, cls: 'text-danger' },
  info: { icon: Info, cls: 'text-info' },
};

const SEGMENTS = {
  Champions: { tip: 'Bought recently and often', cls: 'text-success' },
  Loyal: { tip: 'Order regularly', cls: 'text-success' },
  Promising: { tip: 'Recent buyers with a few orders', cls: 'text-info' },
  New: { tip: 'First order recently', cls: 'text-info' },
  'Needs attention': { tip: 'Activity slowing down', cls: 'text-warning' },
  'At risk': { tip: 'Used to buy often, not lately', cls: 'text-danger' },
  Hibernating: { tip: 'Few orders, long ago', cls: 'text-muted' },
};

const pct = (v) => (v === null || v === undefined ? 'n/a' : `${v}%`);
const days = (v) => (v === null || v === undefined ? 'n/a' : `${v} d`);

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
};

/** Compact metric: icon, one-line label, number. Detail on hover. */
function Metric({ icon: Icon, label, value, hint, tone }) {
  return (
    <div className="card px-3.5 py-3 min-w-0" title={hint}>
      <div className="flex items-center gap-1.5 text-[12px] font-medium text-muted min-w-0">
        <Icon className="size-3.5 shrink-0 text-faint" />
        <span className="truncate">{label}</span>
      </div>
      <p className={cn('mt-1.5 text-[20px] leading-none font-semibold tabular-nums truncate', tone)}>{value}</p>
    </div>
  );
}

const Row = ({ className, children }) => <div className={cn('grid gap-4 lg:grid-cols-3', className)}>{children}</div>;
const Empty = ({ children }) => <p className="px-4 pb-6 pt-2 text-sm text-muted">{children}</p>;

export default function DashboardPage() {
  const { me, can } = useMe();
  const { name } = useMaster();
  const navigate = useNavigate();
  const [sp, setSp] = useSearchParams();
  const canAnalytics = can('dashboard.kpis.view_self', 'dashboard.kpis.view_others');
  const period = PERIODS.some((p) => p.value === sp.get('period')) ? sp.get('period') : DEFAULT_PERIOD;
  const periodLabel = PERIODS.find((p) => p.value === period).label;
  const setPeriod = (m) => {
    const next = new URLSearchParams(sp);
    next.delete('months');
    if (m === DEFAULT_PERIOD) next.delete('period');
    else next.set('period', m);
    setSp(next, { replace: true });
  };

  const oq = useQuery({ queryKey: ['dashboard'], queryFn: () => get('/dashboard'), staleTime: 60_000, refetchInterval: 5 * 60_000 });
  const aq = useQuery({
    queryKey: ['dashboard-analytics', period],
    queryFn: () => get('/dashboard/analytics', { period }),
    enabled: canAnalytics,
    staleTime: 5 * 60_000,
    placeholderData: (prev) => prev,
  });

  const d = oq.data;
  const t = d?.tiles ?? {};
  const k = t.kpis;
  const ops = t.ops;
  const a = aq.data;
  const cur = a?.currency ?? d?.currency;
  const c = a?.customers;

  const alerts = ops
    ? [
        { label: 'Overdue sales orders', rows: ops.overdue_sales_orders, icon: Clock, to: (r) => `/sales-orders/${r.id}` },
        { label: 'Overdue purchase orders', rows: ops.overdue_purchase_orders, icon: Truck, to: (r) => `/purchase-orders/${r.id}` },
        { label: 'Old draft quotes', rows: ops.stale_quotes, icon: FileClock, to: (r) => `/quotes/${r.id}` },
        { label: 'Draft invoices', rows: ops.draft_invoices, icon: Receipt, to: (r) => `/invoices/${r.id}` },
      ]
    : [];

  const loading = oq.isLoading || (canAnalytics && aq.isLoading);
  const growthSub = (r) => (r.pct === null ? 'new this period' : `${r.pct > 0 ? '+' : ''}${Math.round(r.pct)}% vs previous`);

  return (
    <div className={cn('space-y-4 transition-opacity', aq.isFetching && !aq.isLoading && 'opacity-80')}>
      <PageHeader
        title={`${greeting()}, ${(me?.full_name || me?.username || '').split(' ')[0]}`}
        subtitle={new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        actions={
          canAnalytics && (
            <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-surface-3 max-w-full overflow-x-auto" role="group" aria-label="Analysis period">
              {PERIODS.map(({ value: m, label }) => (
                <button
                  key={m}
                  onClick={() => setPeriod(m)}
                  aria-pressed={period === m}
                  className={cn('h-8 px-3 rounded-md text-[12.5px] font-medium whitespace-nowrap transition-colors', period === m ? 'bg-surface text-ink shadow-[var(--shadow-card)]' : 'text-muted hover:text-ink')}
                >
                  {label}
                </button>
              ))}
            </div>
          )
        }
      />

      {a?.scope === 'own' && (
        <p className="text-[12.5px] text-muted flex items-center gap-2"><Info className="size-4 shrink-0 text-info" />Showing your own customers and documents only.</p>
      )}

      {/* ── headline numbers ── */}
      {loading && !k && !a ? (
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-[108px] rounded-[14px]" />)}</div>
      ) : (
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
          {a ? (
            <>
              <StatTile label="Revenue" value={fmtCompact(a.summary.revenue)} trend={a.summary.revenue_change_pct} sub={periodLabel} icon={TrendingUp} />
              <StatTile label="Gross profit" value={fmtCompact(a.summary.gp)} sub={a.summary.margin_pct === null ? cur : `${a.summary.margin_pct}% margin`} icon={Percent} tone="cyan" />
            </>
          ) : k ? (
            <>
              <StatTile label={`Revenue ${d.year}`} value={fmtCompact(k.revenue_ytd)} trend={k.revenue_yoy_pct} sub={`${k.invoices_ytd} invoices`} icon={TrendingUp} />
              <StatTile label="Gross profit YTD" value={fmtCompact(k.gp_ytd)} sub={k.gp_margin_pct !== null ? `${k.gp_margin_pct}% margin` : cur} icon={Percent} tone="cyan" />
            </>
          ) : null}
          {k && (
            <>
              <StatTile label="Open receivables" value={fmtCompact(k.ar_open)} sub={`${k.ar_open_count} invoices`} icon={Wallet} tone="green" to="/invoices?unpaid=1" />
              <StatTile label="Overdue" value={fmtCompact(k.ar_overdue)} sub={`${k.ar_overdue_count} invoices`} icon={AlertTriangle} tone={k.ar_overdue > 0 ? 'rose' : 'green'} to="/invoices?overdue=1" />
              <StatTile label="Stock value" value={fmtCompact(k.stock_value)} sub={`${k.stock_lots} lots`} icon={Boxes} tone="amber" to="/stock" />
            </>
          )}
        </div>
      )}

      {/* ── ratios ── */}
      {a && (
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 2xl:grid-cols-8">
          <Metric icon={CalendarClock} label="DSO" value={days(a.cash.dso_days)} hint="Days of sales still unpaid" tone={a.cash.dso_days > 60 ? 'text-warning' : undefined} />
          <Metric icon={Wallet} label="Collected" value={pct(a.cash.collection_rate_pct)} hint="Share of invoiced value already paid" />
          <Metric icon={Timer} label="Days to pay" value={days(a.cash.avg_days_to_pay)} hint="Average from invoice to full payment" />
          <Metric icon={Clock} label="On time" value={pct(a.cash.on_time_pct)} hint="Paid invoices settled by the due date" />
          <Metric icon={Trophy} label="Win rate" value={pct(a.funnel.win_rate_pct)} hint={`${a.funnel.quotes_won} won of ${a.funnel.quotes_decided} decided quotes`} />
          <Metric icon={Gauge} label="RFQs quoted" value={pct(a.funnel.rfq_to_quote_pct)} hint={`${a.funnel.rfqs_quoted} of ${a.funnel.rfqs} requirements got a quote`} />
          <Metric icon={Timer} label="Quote to order" value={days(a.funnel.avg_days_to_order)} hint={`${a.funnel.open_quotes} quotes still open`} />
          <Metric icon={PieChart} label="Repeat buyers" value={pct(c.repeat_rate_pct)} hint={`${a.summary.customers} active customers. Concentration (HHI) ${c.hhi}: ${c.hhi_label}`} />
        </div>
      )}

      {/* ── trend + findings ── */}
      {a && (
        <Row>
          <Card className="lg:col-span-2 min-w-0">
            <CardHeader
              title="Revenue and forecast"
              subtitle={`${cur} · ${a.months} months of history`}
              actions={
                <span className={cn('chip', a.forecast.reliable ? 'bg-emerald-50 text-success dark:bg-emerald-500/15' : 'bg-amber-50 text-warning dark:bg-amber-500/15')} title="How well the trend line explains past months (1 is perfect)">
                  R² {a.forecast.r2}
                </span>
              }
            />
            <div className="px-3 pb-3"><ForecastChart trend={a.trend} forecast={a.forecast} anomalies={a.anomalies} currency={cur} /></div>
          </Card>
          <Card className="min-w-0">
            <CardHeader title="Key findings" icon={Lightbulb} />
            <ul className="px-4 pb-4 space-y-3">
              {a.findings.map((fd, i) => {
                const F = FINDING[fd.tone] ?? FINDING.info;
                return (
                  <li key={i} className="flex gap-2.5 text-[13px] leading-relaxed">
                    <F.icon className={cn('size-4 shrink-0 mt-0.5', F.cls)} />
                    <span>{fd.text}</span>
                  </li>
                );
              })}
            </ul>
          </Card>
        </Row>
      )}

      {/* ── what needs doing ── */}
      {(ops || t.pipeline) && (
        <Row>
          {ops && (
            <Card className={cn('min-w-0', t.pipeline ? 'lg:col-span-2' : 'lg:col-span-3')}>
              <CardHeader title="Needs attention" />
              <div className="grid sm:grid-cols-2 gap-px bg-line border-t border-line">
                {alerts.map((al) => (
                  <div key={al.label} className="bg-surface p-4 min-w-0">
                    <div className="flex items-center gap-2 mb-2 min-w-0">
                      <al.icon className="size-4 shrink-0 text-faint" />
                      <p className="text-[13px] font-medium truncate">{al.label}</p>
                      <span className={`chip ml-auto shrink-0 ${al.rows.length ? 'bg-amber-50 text-warning dark:bg-amber-500/15' : 'bg-surface-3 text-faint'}`}>{al.rows.length}</span>
                    </div>
                    {al.rows.length === 0 ? (
                      <p className="text-xs text-faint">All clear</p>
                    ) : (
                      <ul className="space-y-1">
                        {al.rows.slice(0, 4).map((r) => (
                          <li key={r.id}>
                            <Link to={al.to(r)} className="flex items-center justify-between gap-2 text-[12.5px] hover:text-link">
                              <span className="mono truncate">{r.no}</span>
                              <span className="text-faint shrink-0">{fmtDate(r.date)}</span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
              {ops.low_stock.length > 0 && (
                <div className="px-4 py-3 border-t border-line">
                  <p className="text-[13px] font-medium flex items-center gap-2 mb-2"><PackageX className="size-4 shrink-0 text-faint" />Low stock</p>
                  <div className="flex flex-wrap gap-1.5">
                    {ops.low_stock.map((s) => (
                      <Link key={s.part_number} to={`/stock?pn=${encodeURIComponent(s.part_number)}`} className="chip bg-surface-3 hover:bg-brand-50 text-muted">
                        <span className="mono">{s.part_number}</span> · {fmtQty(s.available)}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          )}
          {t.pipeline && (
            <Card className="min-w-0">
              <CardHeader title="Sales pipeline" subtitle={d.currency} />
              <div className="px-4 pb-4"><Funnel stages={t.pipeline} currency={d.currency} /></div>
            </Card>
          )}
        </Row>
      )}

      {/* ── customers ── */}
      {c && (
        <Row>
          <Card className="lg:col-span-2 min-w-0">
            <CardHeader title="Customer Pareto" subtitle={`Top ${c.pareto.length} by revenue`} />
            <div className="px-3 pb-3"><ParetoChart rows={c.pareto} currency={cur} onClick={(r) => navigate(`/companies/${r.id}`)} /></div>
          </Card>
          <Card className="min-w-0">
            <CardHeader title="ABC classes" subtitle={`Top 20% bring ${c.top20_share_pct}%`} />
            <div className="px-4 pb-4 space-y-3">
              {c.abc.map((g) => (
                <div key={g.class} className="flex items-center gap-3">
                  <span className={cn('grid place-items-center size-9 shrink-0 rounded-lg font-bold text-sm', g.class === 'A' ? 'bg-brand-50 text-link dark:bg-brand-500/15' : g.class === 'B' ? 'bg-cyan-50 text-info dark:bg-cyan-500/15' : 'bg-surface-3 text-muted')}>{g.class}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between gap-2 text-[13px]"><span className="font-medium truncate">{g.customers} customer{g.customers === 1 ? '' : 's'}</span><span className="tabular-nums font-semibold shrink-0">{g.share}%</span></div>
                    <div className="h-1.5 rounded-full bg-surface-3 mt-1 overflow-hidden"><div className="h-full rounded-full bg-brand-600 dark:bg-brand-400" style={{ width: `${g.share}%` }} /></div>
                    <p className="text-[11px] text-faint mt-0.5 truncate">{fmtMoney(g.revenue, cur)}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </Row>
      )}

      {c && (
        <Row>
          <Card className="lg:col-span-2 min-w-0">
            <CardHeader title="Customer segments" />
            {c.segments.length === 0 ? (
              <Empty>No customers yet</Empty>
            ) : (
              <div className="px-4 pb-4 grid gap-3 grid-cols-2 xl:grid-cols-4">
                {c.segments.map((sg) => (
                  <div key={sg.segment} className="rounded-xl border border-line p-3 min-w-0" title={SEGMENTS[sg.segment]?.tip}>
                    <div className="flex items-baseline justify-between gap-2">
                      <p className={cn('text-[13px] font-semibold truncate', SEGMENTS[sg.segment]?.cls)}>{sg.segment}</p>
                      <span className="text-[18px] font-semibold tabular-nums shrink-0">{sg.customers}</span>
                    </div>
                    <p className="text-[12px] text-muted tabular-nums truncate">{fmtMoney(sg.revenue, cur)}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>
          <Card className="min-w-0">
            <CardHeader title="Churn risk" icon={TriangleAlert} />
            {c.churn_risk.length === 0 ? (
              <Empty>No customers at risk</Empty>
            ) : (
              <ul className="divide-y divide-line border-t border-line">
                {c.churn_risk.map((r) => (
                  <li key={r.id}>
                    <Link to={`/companies/${r.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium truncate">{r.name}</p>
                        <p className="text-[11.5px] text-muted truncate">Silent {r.days_silent} d, usually {r.usual_gap_days} d</p>
                      </div>
                      <span className="text-[13px] tabular-nums font-medium shrink-0">{fmtCompact(r.revenue)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </Row>
      )}

      {/* ── rankings ── */}
      {(t.top_customers || a || t.leaderboard || t.top_parts) && (
        <Row>
          {t.top_customers && (
            <Card className="min-w-0">
              <CardHeader title="Top customers" subtitle={`Revenue ${d.year}`} />
              <div className="px-4 pb-4"><BarList items={t.top_customers} labelKey="name" valueKey="revenue" onClick={(x) => navigate(`/companies/${x.id}`)} sub={(x) => `${x.invoices} invoices`} /></div>
            </Card>
          )}
          {a ? (
            <Card className="min-w-0">
              <CardHeader title="Most profitable parts" subtitle={`Gross profit, ${periodLabel.toLowerCase()}`} />
              <div className="px-4 pb-4"><BarList items={a.parts} labelKey="part_number" valueKey="gp" sub={(p) => `${fmtQty(p.qty)} pcs · ${p.margin === null ? 'n/a' : `${p.margin}%`} margin`} /></div>
            </Card>
          ) : t.top_parts ? (
            <Card className="min-w-0">
              <CardHeader title="Top parts" subtitle={`Revenue ${d.year}`} />
              <div className="px-4 pb-4"><BarList items={t.top_parts} labelKey="part_number" valueKey="revenue" sub={(p) => `${fmtQty(p.qty)} pcs`} /></div>
            </Card>
          ) : null}
          {t.leaderboard && (
            <Card className="min-w-0">
              <CardHeader title="Sales leaderboard" subtitle={`Revenue ${d.year}`} />
              <div className="px-4 pb-4"><BarList items={t.leaderboard} labelKey="name" valueKey="revenue" sub={(u) => `${u.invoices} invoices`} /></div>
            </Card>
          )}
        </Row>
      )}

      {(c || t.ar_aging) && (
        <Row>
          {c && (
            <Card className="min-w-0">
              <CardHeader title="Growing customers" icon={TrendingUp} />
              <div className="px-4 pb-4"><BarList items={c.growing} labelKey="name" valueKey="change" format={(v) => `+${fmtCompact(v)}`} sub={growthSub} onClick={(r) => navigate(`/companies/${r.id}`)} /></div>
            </Card>
          )}
          {c && (
            <Card className="min-w-0">
              <CardHeader title="Declining customers" icon={TrendingDown} />
              <div className="px-4 pb-4"><BarList items={c.declining.map((r) => ({ ...r, drop: -r.change }))} labelKey="name" valueKey="drop" format={(v) => `-${fmtCompact(v)}`} sub={growthSub} onClick={(r) => navigate(`/companies/${r.id}`)} /></div>
            </Card>
          )}
          {t.ar_aging && (
            <Card className="min-w-0">
              <CardHeader title="Receivables aging" subtitle={d.currency} />
              <div className="px-4 pb-4"><AgingBar buckets={t.ar_aging} currency={d.currency} /></div>
            </Card>
          )}
        </Row>
      )}

      {/* ── patterns ── */}
      {a && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="min-w-0">
            <CardHeader title="Invoice sizes" subtitle={cur} />
            <div className="px-4 pb-4"><Histogram bins={a.invoice_histogram} currency={cur} /></div>
          </Card>
          <Card className="min-w-0">
            <CardHeader title="Invoicing activity" subtitle="Last 26 weeks" />
            <div className="px-4 pb-4"><Heatmap days={a.heatmap} currency={cur} /></div>
          </Card>
        </div>
      )}

      {(a || d?.recent_invoices?.length > 0) && (
        <Row>
          {a && (
            <Card className="lg:col-span-2 min-w-0">
              <CardHeader
                title="Gross margin"
                actions={a.margin_momentum.last3_pct !== null && a.margin_momentum.prev3_pct !== null && (
                  <span className="text-[12px] text-muted whitespace-nowrap">Last 3 months <b className="text-ink">{a.margin_momentum.last3_pct}%</b> vs {a.margin_momentum.prev3_pct}%</span>
                )}
              />
              <div className="px-3 pb-3"><MarginChart trend={a.trend} /></div>
            </Card>
          )}
          {d?.recent_invoices?.length > 0 && (
            <Card className={cn('min-w-0', !a && 'lg:col-span-3')}>
              <CardHeader title="Recent invoices" actions={<Link to="/invoices" className="text-xs text-link hover:underline whitespace-nowrap">All invoices</Link>} />
              <ul className="divide-y divide-line border-t border-line">
                {d.recent_invoices.map((i) => (
                  <li key={i.id}>
                    <Link to={`/invoices/${i.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium truncate">{i.customer}</p>
                        <p className="text-xs text-muted mono truncate">{i.invoice_no} · {fmtDate(i.invoice_date)}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[13px] tabular-nums font-medium">{fmtMoney(i.grand_total, name('currencies', i.currency_id))}</p>
                        <StatusBadge status={i.status} className="mt-0.5" />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </Row>
      )}

      {/* ── stock ── */}
      {a?.stock && (
        <Row>
          <Card className="min-w-0">
            <CardHeader title="Stock age" subtitle={fmtMoney(a.stock.total_value, cur)} />
            <div className="px-4 pb-4"><BucketBars buckets={a.stock.aging} currency={cur} /></div>
          </Card>
          <Card className="lg:col-span-2 min-w-0">
            <CardHeader
              title="Slow movers"
              subtitle="Idle over 90 days"
              actions={<span className={cn('chip', a.stock.slow_share_pct >= 25 ? 'bg-amber-50 text-warning dark:bg-amber-500/15' : 'bg-surface-3 text-muted')}>{a.stock.slow_share_pct}% of value</span>}
            />
            {a.stock.slow_movers.length === 0 ? (
              <Empty>No slow movers</Empty>
            ) : (
              <div className="overflow-x-auto border-t border-line">
                <table className="w-full text-[13px] whitespace-nowrap">
                  <thead className="text-left text-[11.5px] text-muted bg-surface-2">
                    <tr><th className="px-4 py-2 font-medium">Part number</th><th className="px-3 py-2 font-medium">Lot</th><th className="px-3 py-2 font-medium text-right">Qty</th><th className="px-3 py-2 font-medium text-right">Idle</th><th className="px-4 py-2 font-medium text-right">Value</th></tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {a.stock.slow_movers.map((l) => (
                      <tr key={l.id} className="hover:bg-surface-2 cursor-pointer" onClick={() => navigate(`/stock/${l.id}`)}>
                        <td className="px-4 py-2 mono">{l.part_number}</td>
                        <td className="px-3 py-2 mono text-muted">{l.stock_no}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtQty(l.qty)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{l.idle_days} d</td>
                        <td className="px-4 py-2 text-right tabular-nums font-medium">{fmtMoney(l.value, cur)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </Row>
      )}

      {aq.isError && <Card className="p-6 text-center text-sm text-muted">Analytics could not be loaded. {aq.error?.message}</Card>}
    </div>
  );
}

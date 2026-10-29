import { useState } from 'react';
import { BarChart3, Printer } from 'lucide-react';
import { useGet } from '@/lib/api';
import { reportColumns, reportRows } from '@/features/exports';
import { ExportMenu } from '@/ui/ExportMenu';
import { useAuth } from '@/lib/auth';
import { dayKey, fDate, money, num0, periodRange } from '@/lib/format';
import { methodLabel, nBills, nItems, t } from '@/lib/i18n';
import { Async, Bars, Button, Card, Empty, KV, PageHeader, SectionHeader } from '@/ui/kit';
import { PeriodFilter, usePeriod } from '@/ui/PeriodFilter';
import { Summary } from './Sales';
import { printNow } from '@/lib/print';
import { PrintCredit, useShopLogo } from '@/ui/receipt';

export default function Reports() {
  const p = usePeriod('reports', 'month');
  const range = p.range;
  const q = useGet('/reports/summary', range);
  const { shop } = useAuth();
  const logo = useShopLogo();
  return (
    <div>
      <PageHeader
        title={t('reports')}
        actions={
          <>
            <ExportMenu
              title={`${t('x_report')} ${range.from ? `${range.from} ${t('to')} ${range.to}` : t('all')}`}
              columns={reportColumns}
              rows={q.data ? reportRows(q.data, range.from ? `${fDate(range.from)} ${t('to')} ${fDate(range.to)}` : t('all')) : undefined}
            />
            <Button data-shortcut="print" variant="outline" icon={Printer} onClick={() => printNow('doc')}>
              {t('print')}
            </Button>
          </>
        }
      />
      <PeriodFilter className="mb-3" p={p} />
      <Async q={q}>
        {(r) => (
          <div className="print-area">
            <div className="hidden print:block mb-3">
              {logo && <img src={logo} alt="" className="shop-logo max-h-12 max-w-[140px] object-contain mb-1" />}
              <div className="font-black text-[18px]">{shop?.name}</div>
              <div className="text-[13px]">
                {t('reports')}: {range.from ? `${fDate(range.from)} ${t('to')} ${fDate(range.to)}` : t('all')}
              </div>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
              <Summary
                label={t('sales')}
                value={money(r.sales.total)}
                sub={[nBills(r.sales.count), `${r.qty} ${t('cyl')}`, r.items_qty ? nItems(r.items_qty) : '', r.cyl_sold ? `${r.cyl_sold} ${t('cyl_bodies_short')}` : ''].filter(Boolean).join(' · ')}
              />
              <Summary label={t('cash_received')} value={money(r.money_in_total)} tone="green" />
              <Summary label={t('purchases')} value={money(r.purchases.total)} sub={nBills(r.purchases.count)} />
              <Summary label={t('est_profit')} value={money(r.est_profit)} sub={t('est_profit_sub')} tone={r.est_profit >= 0 ? 'green' : 'red'} />
            </div>

            {r.by_day.length > 0 && <SalesChart byDay={r.by_day} range={range} />}

            <div className="grid lg:grid-cols-2 gap-x-5">
              <div>
                <SectionHeader title={t('sales_by_type')} />
                <Card className="overflow-hidden">
                  {r.by_type.length === 0 ? (
                    <Empty icon={BarChart3} title={t('no_sales_period')} />
                  ) : (
                    <table className="w-full text-[13px]">
                      <thead>
                        <tr className="bg-bg text-muted text-[12px]">
                          <th className="text-left font-semibold px-4 py-2.5">{t('type')}</th>
                          <th className="text-right font-semibold px-2">{t('qty')}</th>
                          <th className="text-right font-semibold px-2">{t('amount')}</th>
                          <th className="text-right font-semibold px-4">{t('margin')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {r.by_type.map((x) => (
                          <tr key={x.type_uid} className="border-t border-line">
                            <td className="px-4 py-2.5 font-semibold">
                              <div className="truncate max-w-[220px]">{x.type_name}</div>
                              {(x.cyl_sold > 0 || x.unit === 'pcs') && (
                                <div className="text-[11.5px] text-muted font-normal truncate max-w-[220px]">
                                  {x.unit === 'pcs' ? x.category || t('cat_other_items') : `${x.cyl_sold} ${t('cyl_bodies_short')} · ${money(x.cyl_amount)}`}
                                </div>
                              )}
                            </td>
                            <td className="px-2 text-right num whitespace-nowrap">{x.unit === 'kg' ? `${num0(x.kg)} ${t('kg')}` : num0(x.qty)}</td>
                            <td className="px-2 text-right num">{money(x.amount)}</td>
                            <td className="px-4 text-right num text-good">{money(x.est_profit)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </Card>
              </div>
              <div>
                <SectionHeader title={t('money_in')} />
                <Card className="p-4">
                  {r.money_in.length === 0 ? (
                    <div className="text-muted text-[13px]">{t('no_payments_period')}</div>
                  ) : (
                    r.money_in.map((m) => <KV key={m.method} label={`${methodLabel(m.method)} (${m.count})`} value={money(m.amount)} />)
                  )}
                  <div className="border-t border-line mt-2 pt-2">
                    <KV label={t('total')} value={money(r.money_in_total)} strong />
                  </div>
                </Card>
                <SectionHeader title={t('summary')} />
                <Card className="p-4">
                  <KV label={t('subtotal')} value={money(r.sales.subtotal)} />
                  <KV label={t('security_deposit')} value={money(r.sales.deposit)} />
                  <KV label={t('discount')} value={money(r.sales.discount)} />
                  <KV label={t('paid_to_supplier')} value={money(r.supplier_paid)} />
                  <KV label={t('new_customers')} value={r.new_customers} />
                </Card>
              </div>
            </div>
            <PrintCredit className="hidden print:block" />
          </div>
        )}
      </Async>
    </div>
  );
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Sales chart with every day of the period (days without sales show a thin
 * mark), so bars sit next to each other instead of far apart. Long periods
 * and "All" are shown by month.
 */
function SalesChart({ byDay, range }) {
  const total = new Map(byDay.map((d) => [String(d.day).slice(0, 10), Number(d.total) || 0]));
  const keys = [...total.keys()].sort();
  const from = range.from || keys[0];
  const to = range.to || keys.at(-1);
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  const days = Math.round((end - start) / 864e5) + 1;
  const today = dayKey(new Date());
  let bars;
  if (days > 0 && days <= 62) {
    bars = Array.from({ length: days }, (_, i) => {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      const k = dayKey(d);
      return { key: k, value: total.get(k) || 0, label: String(d.getDate()), title: fDate(k), highlight: k === today };
    });
  } else {
    const byMonth = new Map();
    for (const [k, v] of total) byMonth.set(k.slice(0, 7), (byMonth.get(k.slice(0, 7)) || 0) + v);
    bars = [];
    for (let d = new Date(start.getFullYear(), start.getMonth(), 1); d <= end; d.setMonth(d.getMonth() + 1)) {
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      bars.push({ key: k, value: byMonth.get(k) || 0, label: MON[d.getMonth()], title: `${MON[d.getMonth()]} ${d.getFullYear()}`, highlight: k === today.slice(0, 7) });
    }
  }
  const monthly = !(days > 0 && days <= 62);
  if (bars.length < 2) return null;
  const sum = bars.reduce((a, b) => a + b.value, 0);
  const best = bars.reduce((a, b) => (b.value > a.value ? b : a), bars[0]);
  return (
    <>
      <SectionHeader title={monthly ? t('sales_by_month') : t('sales_by_day')} />
      <Card className="p-4">
        <div className="flex flex-wrap gap-x-5 gap-y-1 mb-3 text-[12.5px]">
          <span className="text-muted whitespace-nowrap">
            {t('chart_best')}: <b className="text-ink">{best?.value ? `${best.title}, ${money(best.value)}` : '-'}</b>
          </span>
          <span className="text-muted whitespace-nowrap">
            {monthly ? t('chart_avg_month') : t('chart_avg_day')}: <b className="text-ink">{money(bars.length ? Math.round(sum / bars.length) : 0)}</b>
          </span>
        </div>
        <div className={bars.length > 40 ? 'overflow-x-auto' : ''}>
          <div style={{ minWidth: bars.length > 40 ? bars.length * 14 : undefined }}>
            <Bars data={bars} height={170} showValues={bars.length <= 12} />
          </div>
        </div>
      </Card>
    </>
  );
}

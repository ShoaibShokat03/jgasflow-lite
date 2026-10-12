import { useState } from 'react';
import { BarChart3, Printer } from 'lucide-react';
import { useGet } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { dayKey, fDate, fDateShort, money, num0, periodRange } from '@/lib/format';
import { methodLabel, t } from '@/lib/i18n';
import { Async, Bars, Button, Card, Empty, KV, PageHeader, SectionHeader } from '@/ui/kit';
import { Chips, DateInput } from '@/ui/form';
import { Summary } from './Sales';
import { printNow } from '@/lib/print';
import { PrintCredit } from '@/ui/receipt';

export default function Reports() {
  const [period, setPeriod] = useState('month');
  const [custom, setCustom] = useState({ from: dayKey(), to: dayKey() });
  const range = period === 'custom' ? custom : periodRange(period);
  const q = useGet('/reports/summary', range);
  const { shop } = useAuth();
  return (
    <div>
      <PageHeader title={t('reports')} actions={<Button variant="outline" icon={Printer} onClick={() => printNow('doc')}>{t('print')}</Button>} />
      <Chips
        className="mb-3 no-print"
        value={period}
        onChange={setPeriod}
        options={[
          { value: 'today', label: t('today') },
          { value: 'week', label: t('last_7_days') },
          { value: 'month', label: t('this_month') },
          { value: 'all', label: t('all') },
          { value: 'custom', label: t('custom') },
        ]}
      />
      {period === 'custom' && (
        <div className="grid grid-cols-2 gap-3 max-w-md mb-3 no-print">
          <DateInput label={t('from')} value={custom.from} onChange={(v) => setCustom((s) => ({ ...s, from: v }))} max={dayKey()} />
          <DateInput label={t('to')} value={custom.to} onChange={(v) => setCustom((s) => ({ ...s, to: v }))} max={dayKey()} />
        </div>
      )}
      <Async q={q}>
        {(r) => (
          <div className="print-area">
            <div className="hidden print:block mb-3">
              <div className="font-black text-[18px]">{shop?.name}</div>
              <div className="text-[13px]">
                {t('reports')}: {range.from ? `${fDate(range.from)} ${t('to')} ${fDate(range.to)}` : t('all')}
              </div>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
              <Summary label={t('sales')} value={money(r.sales.total)} sub={`${r.sales.count} ${t('bills')} · ${r.qty} ${t('cyl')}`} />
              <Summary label={t('cash_received')} value={money(r.money_in_total)} tone="green" />
              <Summary label={t('purchases')} value={money(r.purchases.total)} sub={`${r.purchases.count} ${t('bills')}`} />
              <Summary label={t('est_profit')} value={money(r.est_profit)} sub={t('est_profit_sub')} tone={r.est_profit >= 0 ? 'green' : 'red'} />
            </div>

            {r.by_day.length > 1 && (
              <>
                <SectionHeader title={t('sales_by_day')} />
                <Card className="p-4 overflow-x-auto">
                  <div style={{ minWidth: Math.max(300, r.by_day.length * 28) }}>
                    <Bars data={r.by_day.map((d) => ({ value: d.total, label: fDateShort(d.day).slice(0, 2) }))} height={150} />
                  </div>
                </Card>
              </>
            )}

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
                            <td className="px-4 py-2.5 font-semibold">{x.type_name}</td>
                            <td className="px-2 text-right num">{num0(x.qty)}</td>
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

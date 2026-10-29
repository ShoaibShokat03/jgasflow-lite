import { useState } from 'react';
import { Plus, ReceiptText } from 'lucide-react';
import { api, useGet } from '@/lib/api';
import { salesColumns } from '@/features/exports';
import { money, periodRange } from '@/lib/format';
import { nBills, t } from '@/lib/i18n';
import { Async, Button, Card, Empty, PageHeader } from '@/ui/kit';
import { Chips, SearchBox } from '@/ui/form';
import { PeriodFilter, usePeriod } from '@/ui/PeriodFilter';
import { ExportMenu } from '@/ui/ExportMenu';
import { SaleRow } from './Dashboard';

export const PERIODS = () => [
  { value: 'today', label: t('today') },
  { value: 'week', label: t('last_7_days') },
  { value: 'month', label: t('this_month') },
  { value: 'all', label: t('all') },
];

export default function Sales() {
  const p = usePeriod('sales', 'today');
  const [q, setQ] = useState('');
  const sales = useGet('/sales', { ...p.range, q, limit: 50000 });
  return (
    <div>
      <PageHeader
        title={t('sales')}
        actions={
          <>
            <ExportMenu title={t('sales')} columns={salesColumns} rows={sales.data} all={() => api.get('/sales', { params: { limit: 50000 } })} />
            <Button variant="accent" icon={Plus} to="/app/sales/new">
              {t('new_sale')}
            </Button>
          </>
        }
      />
      <PeriodFilter className="mb-3" p={p} right={<SearchBox value={q} onChange={setQ} placeholder={t('search_sale')} className="sm:ml-auto sm:w-72" />} />
      <Async q={sales}>
        {(list) => {
          const total = list.reduce((a, s) => a + s.total, 0);
          const due = list.reduce((a, s) => a + Math.max(0, s.due), 0);
          const qty = list.reduce((a, s) => a + s.qty, 0);
          return (
            <>
              <div className="grid grid-cols-3 gap-2.5 mb-3">
                <Summary label={t('sales')} value={money(total)} sub={nBills(list.length)} />
                <Summary label={t('cylinders')} value={qty} sub={t('full_sold')} />
                <Summary label={t('udhaar')} value={money(due)} sub={t('on_these_bills')} tone="red" />
              </div>
              <Card className="overflow-hidden">
                {list.length === 0 ? (
                  <Empty icon={ReceiptText} title={t('no_sales_period')} action={<Button variant="accent" icon={Plus} to="/app/sales/new">{t('new_sale')}</Button>} />
                ) : (
                  <div className="divide-rows">
                    {list.map((s) => (
                      <SaleRow key={s.uid} s={s} showDate={p.period !== 'today'} />
                    ))}
                  </div>
                )}
              </Card>
            </>
          );
        }}
      </Async>
    </div>
  );
}

export function Summary({ label, value, sub, tone }) {
  return (
    <Card className="p-3 min-w-0">
      <div className="text-[12px] font-medium text-muted truncate">{label}</div>
      <div className={`text-[18px] font-extrabold num truncate ${tone === 'red' ? 'text-bad' : tone === 'green' ? 'text-good' : ''}`}>{value}</div>
      {sub && <div className="text-[11.5px] text-muted truncate">{sub}</div>}
    </Card>
  );
}

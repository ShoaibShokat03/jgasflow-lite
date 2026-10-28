import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowDownLeft, HandCoins, PartyPopper, Wallet } from 'lucide-react';
import { api, useGet } from '@/lib/api';
import { customerColumns, paymentColumns } from '@/features/exports';
import { fDateShort, fTime, money, periodRange } from '@/lib/format';
import { methodLabel, t } from '@/lib/i18n';
import { Async, Balance, Button, Card, Empty, Initials, PageHeader } from '@/ui/kit';
import { Chips, SearchBox } from '@/ui/form';
import { ExportMenu } from '@/ui/ExportMenu';
import { ReceivePayment } from './forms';
import { Summary } from './Sales';
import { PeriodFilter, usePeriod } from '@/ui/PeriodFilter';

export default function Udhaar() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'history' ? 'history' : 'list';
  const receive = params.get('receive') === '1';
  const setTab = (v) => setParams(v === 'history' ? { tab: v } : {}, { replace: true });
  return (
    <div>
      <PageHeader title={t('udhaar_payments_title')} actions={<Button variant="good" icon={HandCoins} onClick={() => setParams({ ...(tab === 'history' ? { tab } : {}), receive: '1' })}>{t('receive_payment')}</Button>} />
      <Chips
        className="mb-3"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'list', label: t('udhaar_list'), icon: Wallet },
          { value: 'history', label: t('payment_history'), icon: ArrowDownLeft },
        ]}
      />
      {tab === 'list' ? <UdhaarList /> : <History />}
      <ReceivePayment open={receive} onClose={() => setParams(tab === 'history' ? { tab } : {}, { replace: true })} />
    </div>
  );
}

function UdhaarList() {
  const [q, setQ] = useState('');
  // Owing customers, or every customer (so the count matches Customers on the home screen).
  const [all, setAll] = useState(false);
  const navigate = useNavigate();
  const list = useGet('/customers', { filter: all ? 'all' : 'udhaar', q });
  return (
    <>
      <div className="flex flex-wrap items-center gap-2.5 mb-3">
        <SearchBox value={q} onChange={setQ} placeholder={t('search_customer')} className="w-full sm:w-80" />
        <Chips
          value={all ? 'all' : 'owe'}
          onChange={(v) => setAll(v === 'all')}
          options={[
            { value: 'owe', label: t('owe_money') },
            { value: 'all', label: t('all_customers') },
          ]}
        />
        <ExportMenu className="ml-auto" title={t('x_udhaar_list')} columns={customerColumns} rows={list.data} all={() => api.get('/customers', { params: { filter: 'udhaar' } })} />
      </div>
      <Async q={list}>
        {(rows) =>
          rows.length === 0 ? (
            <Card>
              <Empty
                icon={PartyPopper}
                title={q ? t('nothing_found') : t('no_udhaar')}
                action={!q && !all ? <Button variant="outline" onClick={() => setAll(true)}>{t('all_customers')}</Button> : undefined}
              />
            </Card>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2.5 mb-3">
                <Summary label={t('total_outstanding')} value={money(rows.reduce((a, c) => a + Math.max(0, c.balance), 0))} tone="red" />
                <Summary label={t('customers')} value={all ? `${rows.filter((c) => c.balance > 0.009).length} / ${rows.length}` : rows.length} />
              </div>
              <Card className="overflow-hidden divide-rows">
                {rows.map((c) => (
                  <button key={c.uid} type="button" className="row-link w-full text-left" onClick={() => navigate(`/app/customers/${c.uid}`)}>
                    <Initials name={c.name} tone="red" />
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold truncate">{c.name}</div>
                      <div className="text-[12px] text-muted truncate">{c.phone || t(c.type)}</div>
                    </div>
                    <Balance value={c.balance} className="text-[14px]" />
                  </button>
                ))}
              </Card>
            </>
          )
        }
      </Async>
    </>
  );
}

function History() {
  const p = usePeriod('payments', 'today');
  const period = p.period;
  const navigate = useNavigate();
  const list = useGet('/payments', { ...p.range, limit: 50000 });
  return (
    <>
      <PeriodFilter
        className="mb-3"
        p={p}
        right={<ExportMenu className="sm:ml-auto" title={t('x_payments')} columns={paymentColumns} rows={list.data} all={() => api.get('/payments', { params: { limit: 50000 } })} />}
      />
      <Async q={list}>
        {(rows) =>
          rows.length === 0 ? (
            <Card>
              <Empty icon={ArrowDownLeft} title={t('no_payments_period')} />
            </Card>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2.5 mb-3">
                <Summary label={t('cash_received')} value={money(rows.reduce((a, p) => a + p.amount, 0))} tone="green" />
                <Summary label={t('payments_count')} value={rows.length} />
              </div>
              <Card className="overflow-hidden divide-rows">
                {rows.map((p) => (
                  <button key={p.uid} type="button" className="row-link w-full text-left" onClick={() => navigate(`/app/payments/${p.uid}`)}>
                    <Initials name={p.customer_name || t('walk_in')} tone="green" />
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold truncate">{p.customer_name || t('walk_in')}</div>
                      <div className="text-[12px] text-muted truncate">
                        {p.ref} · {period !== 'today' ? `${fDateShort(p.date)}, ` : ''}
                        {fTime(p.date)} · {methodLabel(p.method)}
                        {p.sale_ref ? ` · ${p.sale_ref}` : ''}
                      </div>
                    </div>
                    <span className="font-bold text-good num whitespace-nowrap">{money(p.amount)}</span>
                  </button>
                ))}
              </Card>
            </>
          )
        }
      </Async>
    </>
  );
}

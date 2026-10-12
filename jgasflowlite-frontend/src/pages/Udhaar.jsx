import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowDownLeft, HandCoins, PartyPopper, Wallet } from 'lucide-react';
import { useGet } from '@/lib/api';
import { fDateShort, fTime, money, periodRange } from '@/lib/format';
import { methodLabel, t } from '@/lib/i18n';
import { Async, Balance, Button, Card, Empty, Initials, PageHeader } from '@/ui/kit';
import { Chips, SearchBox } from '@/ui/form';
import { ReceivePayment } from './forms';
import { PERIODS, Summary } from './Sales';

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
  const navigate = useNavigate();
  const list = useGet('/customers', { filter: 'udhaar', q });
  return (
    <>
      <SearchBox value={q} onChange={setQ} placeholder={t('search_customer')} className="mb-3 sm:w-80" />
      <Async q={list}>
        {(rows) =>
          rows.length === 0 ? (
            <Card>
              <Empty icon={PartyPopper} title={q ? t('nothing_found') : t('no_udhaar')} />
            </Card>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2.5 mb-3">
                <Summary label={t('total_outstanding')} value={money(rows.reduce((a, c) => a + c.balance, 0))} tone="red" />
                <Summary label={t('customers')} value={rows.length} />
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
  const [period, setPeriod] = useState('today');
  const navigate = useNavigate();
  const list = useGet('/payments', periodRange(period));
  return (
    <>
      <Chips className="mb-3" value={period} onChange={setPeriod} options={PERIODS()} />
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

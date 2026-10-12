import { useState } from 'react';
import { Check, Clock, Crown, Landmark, MessageCircle, Send, Smartphone } from 'lucide-react';
import { api, useAct, useGet } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fDate, fDateTime, money } from '@/lib/format';
import { t } from '@/lib/i18n';
import { Async, Button, Card, cn, IconBox, PageHeader, SectionHeader, Tag } from '@/ui/kit';
import { Chips, TextInput } from '@/ui/form';
import { toast } from '@/ui/overlay';

const STATUS_TONE = { pending: 'amber', approved: 'green', rejected: 'red' };

export default function Billing() {
  const q = useGet('/billing');
  const auth = useAuth();
  return (
    <div>
      <PageHeader title={t('subscription')} />
      <Async q={q}>
        {(b) => (
          <>
            <Current s={b.subscription} />
            <PayForm b={b} onDone={auth.refresh} />
            {b.requests.length > 0 && (
              <>
                <SectionHeader title={t('payment_history_billing')} />
                <Card className="overflow-hidden divide-rows">
                  {b.requests.map((r) => (
                    <div key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold">
                          {b.plans.find((p) => p.key === r.plan)?.name} · {t('months_n', { n: r.months })} · {money(r.amount)}
                        </div>
                        <div className="text-[12px] text-muted">
                          {fDateTime(r.created_at)} · {t(`pm_${r.method}`)} {r.txn_ref}
                          {r.review_note ? ` · ${r.review_note}` : ''}
                        </div>
                      </div>
                      <Tag tone={STATUS_TONE[r.status]}>{t(`req_${r.status}`)}</Tag>
                    </div>
                  ))}
                </Card>
              </>
            )}
          </>
        )}
      </Async>
    </div>
  );
}

function Current({ s }) {
  const active = s.status === 'active';
  return (
    <Card className="p-5 bg-gradient-to-br from-primary to-primary-2 border-0 text-white">
      <div className="flex flex-wrap items-center gap-4">
        <div className="grid place-items-center size-12 rounded-[var(--radius-card)] bg-white/10">
          <Crown className="size-6 text-[#FFC23D]" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[12.5px] text-white/60">{t('current_plan')}</div>
          <div className="text-[22px] font-black">{s.plan_name}</div>
        </div>
        <div className="text-right">
          <span className={cn('inline-flex items-center h-7 px-3 rounded-full text-[12px] font-bold', active ? 'bg-[#5BE49B]/20 text-[#5BE49B]' : 'bg-[#ff8a80]/20 text-[#ff9a8a]')}>{active ? t('active') : s.status === 'expired' ? t('expired') : t('suspended')}</span>
          {s.expires_at && (
            <div className="text-[12.5px] text-white/70 mt-1">
              {active ? t('valid_till') : t('ended_on')} {fDate(s.expires_at)}
              {active ? ` (${t('days_left', { n: s.days_left })})` : ''}
            </div>
          )}
        </div>
      </div>
      {!active && <div className="mt-3 rounded-[var(--radius-ctl)] bg-white/10 px-3 py-2 text-[13px]">{t('banner_expired')}</div>}
    </Card>
  );
}

function PayForm({ b, onDone }) {
  const paid = b.plans.filter((p) => p.price > 0);
  const [plan, setPlan] = useState(paid[0]?.key);
  const [months, setMonths] = useState(1);
  const [method, setMethod] = useState('jazzcash');
  const [ref, setRef] = useState('');
  const pending = b.requests.find((r) => r.status === 'pending');
  const p = paid.find((x) => x.key === plan);
  const amount = p?.prices.find((x) => x.months === months)?.amount ?? 0;
  const send = useAct((body) => api.post('/billing/requests', body), {
    onSuccess: () => {
      toast(t('payment_sent'));
      setRef('');
      onDone?.();
    },
    onError: (e) => toast(e.message, 'error'),
  });
  const payTo = { jazzcash: b.pay_to.jazzcash, easypaisa: b.pay_to.easypaisa, bank: b.pay_to.bank };

  return (
    <>
      <SectionHeader title={t('choose_plan')} />
      <div className="grid md:grid-cols-2 gap-3">
        {paid.map((x) => (
          <button key={x.key} type="button" onClick={() => setPlan(x.key)} className={cn('card p-4 text-left transition', plan === x.key ? '!border-primary ring-2 ring-primary/25' : 'hover:border-[#cfd2e6]')}>
            <div className="flex items-center justify-between">
              <div className="font-bold text-[16px]">{x.name}</div>
              <div className="font-black num">
                Rs {x.price.toLocaleString('en-US')} <span className="text-[12px] text-muted font-semibold">{t('per_month')}</span>
              </div>
            </div>
            <ul className="mt-2 space-y-1">
              {x.features.map((f) => (
                <li key={f} className="flex gap-2 text-[13px] text-muted">
                  <Check className="size-4 text-good shrink-0" /> {f}
                </li>
              ))}
            </ul>
          </button>
        ))}
      </div>

      <SectionHeader title={t('pay_and_activate')} />
      <div className="grid lg:grid-cols-2 gap-4 items-start">
        <Card className="p-4 space-y-3.5">
          <div>
            <div className="label">{t('months')}</div>
            <Chips
              value={months}
              onChange={setMonths}
              options={(p?.prices ?? []).map((x) => ({ value: x.months, label: x.months === 12 ? t('one_year') : t('months_n', { n: x.months }) }))}
            />
          </div>
          <div className="rounded-[var(--radius-ctl)] bg-bg px-3 py-2.5 flex items-center justify-between">
            <span className="text-muted font-medium">{t('amount_to_pay')}</span>
            <span className="text-[20px] font-black num">{money(amount)}</span>
          </div>
          <div>
            <div className="label">{t('paid_by')}</div>
            <Chips
              value={method}
              onChange={setMethod}
              options={[
                { value: 'jazzcash', label: 'JazzCash', icon: Smartphone },
                { value: 'easypaisa', label: 'Easypaisa', icon: Smartphone },
                { value: 'bank', label: t('pm_bank'), icon: Landmark },
              ]}
            />
          </div>
          <TextInput label={t('txn_id')} value={ref} onChange={setRef} maxLength={80} hint={t('txn_id_hint')} />
          {pending ? (
            <div className="flex items-center gap-2 rounded-[var(--radius-ctl)] bg-[#fff8e6] px-3 py-2.5 text-[13px] font-medium">
              <Clock className="size-4 text-warn" /> {t('payment_waiting')}
            </div>
          ) : (
            <Button full size="lg" variant="accent" icon={Send} loading={send.isPending} onClick={() => (ref.trim().length < 4 ? toast(t('txn_id_needed'), 'error') : send.mutate({ plan, months, method, txn_ref: ref.trim(), note: '' }))}>
              {t('send_payment_details')}
            </Button>
          )}
        </Card>
        <Card className="p-4">
          <div className="font-bold mb-3">{t('how_to_pay')}</div>
          <ol className="space-y-3 text-[13.5px]">
            <li className="flex gap-3">
              <Step n={1} /> <span>{t('pay_step1', { amount: money(amount) })}</span>
            </li>
            <li className="flex gap-3">
              <Step n={2} /> <span>{t('pay_step2')}</span>
            </li>
            <li className="flex gap-3">
              <Step n={3} /> <span>{t('pay_step3')}</span>
            </li>
          </ol>
          <div className="mt-4 rounded-[var(--radius-card)] border border-line p-3 flex gap-3">
            <IconBox icon={method === 'bank' ? Landmark : Smartphone} color="#020033" />
            <div className="min-w-0">
              <div className="text-[12px] text-muted">{t('send_to')}</div>
              <div className="font-bold break-words">{payTo[method] || '-'}</div>
            </div>
          </div>
          {b.pay_to.whatsapp && (
            <Button className="mt-3" variant="good" icon={MessageCircle} onClick={() => window.open(`https://wa.me/${b.pay_to.whatsapp.replace(/[^0-9]/g, '').replace(/^0/, '92')}`, '_blank', 'noopener')}>
              {t('whatsapp_support')}
            </Button>
          )}
        </Card>
      </div>
    </>
  );
}

function Step({ n }) {
  return <span className="grid place-items-center size-6 rounded-full bg-primary text-white text-[12px] font-bold shrink-0">{n}</span>;
}

import { useState } from 'react';
import { Check, Clock, Copy, Crown, Landmark, MessageCircle, Send } from 'lucide-react';
import { postForm, useAct, useGet } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fDate, fDateTime, money } from '@/lib/format';
import { t } from '@/lib/i18n';
import { Async, Button, Card, cn, IconBox, PageHeader, SectionHeader, Tag } from '@/ui/kit';
import { Chips, TextInput } from '@/ui/form';
import { ScreenshotPicker, SecureImage } from '@/ui/attach';
import { PlanMode } from '@/ui/PlanMode';
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
                        {r.proofs > 0 && (
                          <div className="mt-2 flex gap-2">
                            {Array.from({ length: r.proofs }, (_, n) => (
                              <SecureImage key={n} src={`/billing/requests/${r.id}/proof/${n}`} className="size-12" />
                            ))}
                          </div>
                        )}
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
  // ?plan=pro preselects a plan (from the welcome screen after sign up).
  const wanted = new URLSearchParams(window.location.search).get('plan');
  const [plan, setPlan] = useState(paid.find((x) => x.key === wanted)?.key ?? paid[0]?.key);
  const [months, setMonths] = useState(1);
  const [ref, setRef] = useState('');
  const [shots, setShots] = useState([]);
  const [shotErr, setShotErr] = useState('');
  const pending = b.requests.find((r) => r.status === 'pending');
  const p = paid.find((x) => x.key === plan);
  const amount = p?.prices.find((x) => x.months === months)?.amount ?? 0;
  const send = useAct(() => postForm('/billing/requests', { plan, months, txn_ref: ref.trim() }, shots), {
    onSuccess: () => {
      toast(t('payment_sent'));
      setRef('');
      setShots([]);
      onDone?.();
    },
    onError: (e) => toast(e.message, 'error'),
  });
  const submit = () => {
    if (!shots.length) {
      setShotErr(t('shot_needed'));
      return toast(t('shot_needed'), 'error');
    }
    setShotErr('');
    send.mutate();
  };
  const bank = b.pay_to.bank_details;

  return (
    <>
      <SectionHeader title={t('choose_plan')} />
      <div className="grid md:grid-cols-2 gap-3">
        {paid.map((x) => (
          <button key={x.key} type="button" onClick={() => setPlan(x.key)} className={cn('card p-4 text-left transition', plan === x.key ? '!border-primary ring-2 ring-primary/25' : 'hover:border-[#cfd2e6]')}>
            <div className="flex items-center justify-between">
              <div className="font-bold text-[16px] flex items-center gap-2 min-w-0">
                <span className="truncate">{x.name}</span> <PlanMode mode={x.mode} />
              </div>
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
        {/* 1. where to send the money */}
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <IconBox icon={Landmark} color="#020033" />
            <div className="min-w-0">
              <div className="font-bold">{t('pay_by_bank')}</div>
              <div className="text-[12.5px] text-muted">{t('pay_by_bank_sub')}</div>
            </div>
          </div>
          <div className="mt-3 rounded-[var(--radius-ctl)] bg-bg px-3 py-2.5 flex items-center justify-between">
            <span className="text-muted font-medium">{t('amount_to_pay')}</span>
            <span className="text-[20px] font-black num">{money(amount)}</span>
          </div>
          {bank ? (
            <div className="mt-3 rounded-[var(--radius-card)] border border-line divide-rows">
              {[
                ['bank_name', bank.bank],
                ['account_title', bank.title],
                ['account_number', bank.account],
                ['iban', bank.iban],
                ['branch', bank.branch],
              ]
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <div key={k} className="flex items-center gap-3 px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="text-[11.5px] text-muted">{t(k)}</div>
                      <div className="font-bold num [overflow-wrap:anywhere]">{v}</div>
                    </div>
                    {k !== 'bank_name' && k !== 'branch' && (
                      <Button
                        size="sm"
                        variant="soft"
                        icon={Copy}
                        aria-label={t('copy')}
                        title={t('copy')}
                        onClick={() => navigator.clipboard?.writeText(v).then(() => toast(t('copied')), () => toast(v, 'info'))}
                      />
                    )}
                  </div>
                ))}
            </div>
          ) : b.pay_to.bank ? (
            <div className="mt-3 rounded-[var(--radius-card)] border border-line p-3 font-bold [overflow-wrap:anywhere]">{b.pay_to.bank}</div>
          ) : (
            <div className="mt-3 rounded-[var(--radius-card)] bg-[#fff8e6] p-3 text-[13px]">{t('bank_ask_support')}</div>
          )}
          <ol className="mt-4 space-y-2.5 text-[13.5px]">
            <li className="flex gap-3">
              <Step n={1} /> <span>{t('bank_step1', { amount: money(amount) })}</span>
            </li>
            <li className="flex gap-3">
              <Step n={2} /> <span>{t('bank_step2')}</span>
            </li>
            <li className="flex gap-3">
              <Step n={3} /> <span>{t('bank_step3')}</span>
            </li>
          </ol>
          {b.pay_to.whatsapp && (
            <Button className="mt-4" variant="good" icon={MessageCircle} onClick={() => window.open(`https://wa.me/${b.pay_to.whatsapp.replace(/[^0-9]/g, '').replace(/^0/, '92')}`, '_blank', 'noopener')}>
              {t('whatsapp_support')}
            </Button>
          )}
        </Card>

        {/* 2. the proof */}
        <Card className="p-4 space-y-3.5">
          <div>
            <div className="label">{t('months')}</div>
            <Chips
              value={months}
              onChange={setMonths}
              options={(p?.prices ?? []).map((x) => ({ value: x.months, label: x.months === 12 ? t('one_year') : t('months_n', { n: x.months }) }))}
            />
          </div>
          <ScreenshotPicker files={shots} onChange={(f) => (setShots(f), f.length && setShotErr(''))} label={t('payment_screenshots')} required error={shotErr} hint={t('payment_screenshots_hint')} />
          <TextInput label={t('bank_ref_optional')} value={ref} onChange={setRef} maxLength={80} hint={t('bank_ref_hint')} />
          {pending ? (
            <div className="flex items-center gap-2 rounded-[var(--radius-ctl)] bg-[#fff8e6] px-3 py-2.5 text-[13px] font-medium">
              <Clock className="size-4 text-warn shrink-0" /> {t('payment_waiting')}
            </div>
          ) : (
            <Button full size="lg" variant="accent" icon={Send} loading={send.isPending} onClick={submit}>
              {t('send_payment_proof')}
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

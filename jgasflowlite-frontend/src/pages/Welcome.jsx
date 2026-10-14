import { ArrowRight, Check, Crown, PartyPopper } from 'lucide-react';
import { useGet } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fDate, money } from '@/lib/format';
import { t } from '@/lib/i18n';
import { Async, Button, Card, cn, Tag } from '@/ui/kit';
import { PlanMode } from '@/ui/PlanMode';
import { AppDownloadCard } from '@/ui/AppDownload';

/**
 * Shown once after sign up: confirms the plan the shop is on (the free trial)
 * and lets the owner pick a paid plan straight away, or carry on with the trial.
 */
export default function Welcome() {
  const auth = useAuth();
  const plans = useGet('/billing/plans');
  const sub = auth.sub;
  return (
    <div className="max-w-5xl mx-auto">
      <Card className="p-6 bg-gradient-to-br from-primary to-primary-2 border-0 text-white">
        <div className="flex flex-wrap items-center gap-4">
          <div className="grid place-items-center size-12 rounded-[var(--radius-card)] bg-white/10 shrink-0">
            <PartyPopper className="size-6 text-[#FFC23D]" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-[22px] font-black">{t('welcome_title', { shop: auth.shop?.name ?? '' })}</h1>
            <p className="text-white/75 mt-0.5">
              {sub?.expires_at ? t('welcome_trial_until', { n: sub.days_left, date: fDate(String(sub.expires_at).slice(0, 10)) }) : t('welcome_sub')}
            </p>
          </div>
          <Button variant="accent" size="lg" iconRight={ArrowRight} to="/app">
            {t('continue_trial')}
          </Button>
        </div>
        {sub?.mode === 'offline' && <div className="mt-4 rounded-[var(--radius-ctl)] bg-white/10 px-3 py-2.5 text-[13.5px]">{t('welcome_offline_app')}</div>}
      </Card>

      <AppDownloadCard className="mt-4" />

      <h2 className="mt-7 mb-1 text-[18px] font-black">{t('choose_your_plan')}</h2>
      <p className="text-[13.5px] text-muted mb-4">{t('choose_plan_help')}</p>
      <Async q={plans}>
        {({ plans: list }) => (
          <div className="grid md:grid-cols-3 gap-4">
            {list.filter((p) => p.mode === 'any' || p.mode === (sub?.mode ?? 'online') || sub?.mode === 'offline').map((p) => {
              const current = p.key === sub?.plan;
              return (
                <Card key={p.key} className={cn('p-5 flex flex-col', current && 'border-accent ring-2 ring-accent/25')}>
                  <div className="flex items-center gap-2">
                    {p.price > 0 && <Crown className="size-5 text-accent" />}
                    <div className="font-black text-[17px] flex-1 min-w-0 truncate">{p.name}</div>
                    <PlanMode mode={p.mode} />
                    {current && <Tag tone="orange">{t('your_plan')}</Tag>}
                  </div>
                  <div className="mt-2 text-[26px] font-black num">{p.price ? money(p.price) : t('free')}</div>
                  {p.price > 0 && <div className="text-[12.5px] text-muted -mt-1">{t('per_month')}</div>}
                  <ul className="mt-3 space-y-1.5 flex-1">
                    {p.features.map((x) => (
                      <li key={x} className="flex gap-2 text-[13.5px]">
                        <Check className="size-4 text-good shrink-0 mt-0.5" /> <span className="min-w-0 break-words">{x}</span>
                      </li>
                    ))}
                  </ul>
                  {current ? (
                    <Button className="mt-5" full variant="accent" to="/app">
                      {t('continue_trial')}
                    </Button>
                  ) : p.price > 0 && auth.isOwner ? (
                    <Button className="mt-5" full variant="outline" to={`/app/billing?plan=${p.key}`}>
                      {t('choose_plan')}
                    </Button>
                  ) : null}
                </Card>
              );
            })}
          </div>
        )}
      </Async>
      <p className="text-center text-[12.5px] text-muted mt-5">{t('welcome_pay_note')}</p>
    </div>
  );
}

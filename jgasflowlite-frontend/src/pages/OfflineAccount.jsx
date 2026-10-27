import { ArrowRight, Check, CloudOff, Crown, RefreshCw, Smartphone } from 'lucide-react';
import { useGet } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { money } from '@/lib/format';
import { t } from '@/lib/i18n';
import { Async, Button, Card, IconBox } from '@/ui/kit';
import { AppDownloadCard } from '@/ui/AppDownload';

/** Screens an Offline shop may still open on the web. */
export const OFFLINE_ALLOWED = ['/app/billing', '/app/support', '/app/account', '/app/manual', '/app/welcome'];

/** Shown on the web to a shop on the Offline plan: its data lives on the phone. */
export default function OfflineAccount() {
  const auth = useAuth();
  const plans = useGet('/billing/plans');
  return (
    <div className="max-w-4xl mx-auto">
      <Card className="p-6 bg-gradient-to-br from-primary to-primary-2 border-0 text-white">
        <div className="flex flex-wrap items-center gap-4">
          <div className="grid place-items-center size-12 rounded-[var(--radius-card)] bg-white/10 shrink-0">
            <CloudOff className="size-6 text-[#FFC23D]" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-[21px] font-black">{t('offline_title', { shop: auth.shop?.name ?? '' })}</h1>
            <p className="text-white/75 mt-0.5">{t('offline_sub')}</p>
          </div>
        </div>
      </Card>

      <div className="grid md:grid-cols-2 gap-4 mt-5">
        <Card className="p-5">
          <IconBox icon={Smartphone} color="#020033" />
          <div className="font-bold mt-3">{t('offline_use_phone')}</div>
          <p className="text-[13.5px] text-muted mt-1">{t('offline_use_phone_sub')}</p>
        </Card>
        <Card className="p-5">
          <IconBox icon={RefreshCw} color="#F26B1D" />
          <div className="font-bold mt-3">{t('offline_why_upgrade')}</div>
          <ul className="mt-2 space-y-1.5">
            {['offline_up1', 'offline_up2', 'offline_up3'].map((k) => (
              <li key={k} className="flex gap-2 text-[13.5px]">
                <Check className="size-4 text-good shrink-0 mt-0.5" /> {t(k)}
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <AppDownloadCard className="mt-4" />

      <h2 className="mt-7 mb-3 text-[18px] font-black">{t('upgrade_to_online')}</h2>
      <Async q={plans}>
        {({ plans: list }) => (
          <div className="grid md:grid-cols-2 gap-4">
            {list
              .filter((p) => p.mode === 'online')
              .map((p) => (
                <Card key={p.key} className="p-5 flex flex-col">
                  <div className="flex items-center gap-2">
                    <Crown className="size-5 text-accent" />
                    <div className="font-black text-[17px] flex-1 truncate">{p.name}</div>
                  </div>
                  <div className="mt-2 text-[24px] font-black num">
                    {money(p.price)} <span className="text-[12.5px] text-muted font-semibold">{t('per_month')}</span>
                  </div>
                  {p.lifetime_price > 0 && <div className="text-[12.5px] font-bold text-accent-dark">{t('or_lifetime', { amount: money(p.lifetime_price) })}</div>}
                  <ul className="mt-3 space-y-1.5 flex-1">
                    {p.features.map((x) => (
                      <li key={x} className="flex gap-2 text-[13.5px]">
                        <Check className="size-4 text-good shrink-0 mt-0.5" /> <span className="min-w-0 break-words">{x}</span>
                      </li>
                    ))}
                  </ul>
                  {auth.isOwner && (
                    <Button className="mt-5" full variant="accent" iconRight={ArrowRight} to={`/app/billing?plan=${p.key}`}>
                      {t('upgrade_now')}
                    </Button>
                  )}
                </Card>
              ))}
          </div>
        )}
      </Async>
      <p className="text-center text-[12.5px] text-muted mt-5">{t('offline_data_note')}</p>
    </div>
  );
}

import { BookOpen, ChevronDown, Copy, Headphones, MessageCircle, Phone, Printer } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { telHref, useSupport } from '@/lib/support';
import { t } from '@/lib/i18n';
import { Button, Card, IconBox, KV, PageHeader, SectionHeader } from '@/ui/kit';
import { toast } from '@/ui/overlay';
import SupportRequests from './SupportRequests';
import { AppDownloadCard } from '@/ui/AppDownload';

const TOPICS = ['sale', 'udhaar', 'stock', 'phone', 'print', 'staff', 'renew', 'password', 'backup'];

export default function Support() {
  const auth = useAuth();
  const sup = useSupport();
  const hello = encodeURIComponent(`${t('support_wa_text')} ${auth.shop?.name ?? ''} (${auth.user?.phone || auth.user?.email || ''})`);
  return (
    <div>
      <PageHeader title={t('support')} sub={t('support_sub')} />
      <div className="grid lg:grid-cols-[1.2fr_1fr] gap-5 items-start">
        <Card className="p-5 lg:p-6 bg-gradient-to-br from-primary to-primary-2 border-0 text-white">
          <div className="flex items-center gap-3">
            <div className="grid place-items-center size-12 rounded-[var(--radius-card)] bg-white/10">
              <Headphones className="size-6 text-[#FFC23D]" />
            </div>
            <div className="min-w-0">
              <div className="text-[13px] text-white/60">{t('support_by')}</div>
              <div className="text-[20px] font-black">{sup.company}</div>
            </div>
          </div>
          <p className="mt-4 text-[13.5px] text-white/80">{t('support_intro')}</p>
          {sup.phone && <div className="mt-4 text-[26px] font-black tracking-tight num">{sup.phone}</div>}
          {sup.hours && <div className="mt-1 text-[12.5px] text-white/60">{sup.hours}</div>}
          <div className="mt-4 flex flex-wrap gap-2">
            {sup.whatsapp && (
              <Button variant="good" icon={MessageCircle} onClick={() => window.open(`https://wa.me/${sup.whatsapp}?text=${hello}`, '_blank', 'noopener')}>
                WhatsApp
              </Button>
            )}
            {sup.phone && (
              <Button variant="light" icon={Phone} onClick={() => (window.location.href = telHref(sup.phone))}>
                {t('call')}
              </Button>
            )}
            {sup.phone && (
              <Button
                variant="light"
                icon={Copy}
                onClick={() =>
                  navigator.clipboard?.writeText(sup.phone).then(
                    () => toast(t('copied')),
                    () => toast(sup.phone, 'info'),
                  )
                }
              >
                {t('copy')}
              </Button>
            )}
          </div>
        </Card>
        <Card className="p-4">
          <div className="font-bold mb-2">{t('support_share')}</div>
          <p className="text-[12.5px] text-muted mb-3">{t('support_share_sub')}</p>
          <KV label={t('shop_name')} value={auth.shop?.name ?? '-'} />
          <KV label={t('shop_id')} value={auth.shop ? `#${auth.shop.id}` : '-'} />
          <KV label={t('logged_in_as')} value={`${auth.user?.name ?? ''} · ${t(`role_${auth.role}`)}`} />
          {auth.sub && <KV label={t('current_plan')} value={`${auth.sub.plan_name} · ${auth.sub.status !== 'active' ? t('expired') : auth.sub.lifetime ? t('lifetime_access') : t('days_left', { n: auth.sub.days_left })}`} />}
          <KV label={t('app_version')} value="JGasFlow Online 1.1" />
          <div className="mt-3 flex gap-2">
            <Button size="sm" variant="soft" icon={BookOpen} to="/app/manual">
              {t('user_manual')}
            </Button>
            <Button size="sm" variant="soft" icon={Printer} to="/app/settings#printer">
              {t('printer_settings')}
            </Button>
          </div>
        </Card>
      </div>

      <AppDownloadCard className="mt-5" />

      <SupportRequests />

      <SectionHeader title={t('help_topics')} />
      <div className="grid lg:grid-cols-2 gap-3 items-start">
        {TOPICS.map((k) => (
          <details key={k} className="card group overflow-hidden">
            <summary className="flex items-center gap-3 px-4 py-3.5 list-none [&::-webkit-details-marker]:hidden hover:bg-soft/50">
              <IconBox icon={Headphones} color="#3B3A8F" size={32} />
              <span className="flex-1 font-semibold">{t(`help_${k}_q`)}</span>
              <ChevronDown className="size-4 text-muted transition group-open:rotate-180" />
            </summary>
            <div className="px-4 pb-4 pl-[60px] text-[13.5px] text-ink/85 whitespace-pre-line">{t(`help_${k}_a`)}</div>
          </details>
        ))}
      </div>
    </div>
  );
}

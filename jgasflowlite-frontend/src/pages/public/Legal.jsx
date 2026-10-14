import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Clock, Languages, Mail, MessageCircle, Phone } from 'lucide-react';
import { useGet } from '@/lib/api';
import { getLang, setLang, t, useLang } from '@/lib/i18n';
import { SUPPORT } from '@/lib/print';
import { LEGAL, LEGAL_UPDATED } from '@/features/legal';
import { Brand, Button, Card } from '@/ui/kit';
import { SiteFooter } from '@/ui/SiteFooter';

/** Header, body and footer shared by the public information pages. */
function PublicPage({ title, children }) {
  useLang();
  const ur = getLang() === 'ur';
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [title]);
  return (
    <div className="min-h-dvh bg-bg flex flex-col">
      <header className="bg-primary">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center gap-3">
          <Link to="/">
            <Brand onDark size={32} />
          </Link>
          <button type="button" onClick={() => setLang(ur ? 'en' : 'ur')} className="ml-auto inline-flex items-center gap-1.5 h-9 px-3 rounded-[var(--radius-ctl)] text-[13px] font-bold text-white/85 hover:bg-white/10 whitespace-nowrap">
            <Languages className="size-4" /> {ur ? 'English' : 'Roman Urdu'}
          </button>
        </div>
      </header>
      <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-10">
        <Link to="/" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-muted hover:text-primary">
          <ArrowLeft className="size-4" /> {t('back_home')}
        </Link>
        <h1 className="mt-3 text-[28px] font-black">{title}</h1>
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}

const L = (pair) => (getLang() === 'ur' && pair[1] ? pair[1] : pair[0]);

/** Terms, Privacy, Refund policy and Disclaimer. */
export default function Legal({ page }) {
  useLang();
  const doc = LEGAL[page];
  return (
    <PublicPage title={L(doc.title)}>
      <p className="mt-1 text-[12.5px] text-muted">{t('last_updated', { date: LEGAL_UPDATED })}</p>
      <p className="mt-5 text-[15px] text-ink/85">{L(doc.intro)}</p>
      <div className="mt-6 space-y-3">
        {doc.sections.map((s, i) => (
          <Card key={i} className="p-5">
            <h2 className="font-bold text-[16px]">{L(s.h)}</h2>
            <p className="mt-1.5 text-[14px] text-ink/80 leading-relaxed">{L(s.p)}</p>
          </Card>
        ))}
      </div>
      <p className="mt-6 text-[13px] text-muted">
        {t('legal_questions')}{' '}
        <Link to="/contact" className="font-bold text-primary hover:underline">
          {t('footer_contact')}
        </Link>
      </p>
    </PublicPage>
  );
}

/** Contact: phone, WhatsApp, email and hours, from the platform settings. */
export function Contact() {
  useLang();
  const cfg = useGet('/public/config');
  const s = cfg.data?.support ?? {};
  const phone = s.phone || SUPPORT.phone;
  const wa = s.whatsapp || SUPPORT.whatsapp;
  const rows = [
    { icon: Phone, label: t('phone'), value: phone, href: `tel:${phone.replace(/\s/g, '')}` },
    { icon: MessageCircle, label: 'WhatsApp', value: `+${wa}`, href: `https://wa.me/${wa}` },
    s.email ? { icon: Mail, label: t('email'), value: s.email, href: `mailto:${s.email}` } : null,
    s.hours ? { icon: Clock, label: t('support_hours'), value: s.hours } : null,
  ].filter(Boolean);
  return (
    <PublicPage title={t('footer_contact')}>
      <p className="mt-3 text-[15px] text-ink/85">{t('contact_intro')}</p>
      <Card className="mt-6 divide-rows overflow-hidden">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center gap-3 px-5 py-4">
            <span className="grid place-items-center size-10 rounded-[var(--radius-ctl)] bg-soft text-primary shrink-0">
              <r.icon className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[12px] text-muted font-semibold">{r.label}</div>
              {r.href ? (
                <a href={r.href} target={r.href.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer" className="font-bold text-primary hover:underline [overflow-wrap:anywhere]">
                  {r.value}
                </a>
              ) : (
                <div className="font-bold">{r.value}</div>
              )}
            </div>
          </div>
        ))}
      </Card>
      <div className="mt-5 flex flex-wrap gap-2">
        <Button variant="good" icon={MessageCircle} onClick={() => window.open(`https://wa.me/${wa}?text=${encodeURIComponent(t('wa_hello'))}`, '_blank', 'noopener')}>
          {t('chat_whatsapp')}
        </Button>
        <Button variant="outline" icon={Phone} onClick={() => (window.location.href = `tel:${phone.replace(/\s/g, '')}`)}>
          {t('call_now')}
        </Button>
      </div>
      <p className="mt-6 text-[13px] text-muted">{s.company || SUPPORT.company}</p>
    </PublicPage>
  );
}

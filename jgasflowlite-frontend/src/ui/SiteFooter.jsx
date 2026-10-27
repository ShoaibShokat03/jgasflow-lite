import { Link } from 'react-router-dom';
import { Mail, MessageCircle, Phone } from 'lucide-react';
import { t } from '@/lib/i18n';
import { telHref, useSupport } from '@/lib/support';
import { Brand } from './kit';
import { APK_URL, WIN_URL } from './AppDownload';

/** Footer of the public website: product, help and policy links, contact, copyright. */
export function SiteFooter() {
  const s = useSupport();
  const { phone, whatsapp: wa } = s;
  const year = new Date().getFullYear();
  const col = 'text-[12px] font-bold uppercase tracking-wider text-white/45 mb-3';
  const link = 'block py-1 text-white/75 hover:text-white';
  return (
    <footer className="bg-primary-dark text-white/70 text-[13.5px]">
      <div className="max-w-6xl mx-auto px-4 pt-12 pb-8 grid gap-8 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1.2fr]">
        <div className="min-w-0">
          <Brand onDark size={32} />
          <p className="mt-3 text-white/60 max-w-xs">{t('footer_about')}</p>
        </div>
        <nav>
          <div className={col}>{t('footer_product')}</div>
          <a href="/#features" className={link}>
            {t('footer_features')}
          </a>
          <a href="/#pricing" className={link}>
            {t('footer_pricing')}
          </a>
          <Link to="/signup" className={link}>
            {t('start_free')}
          </Link>
          <Link to="/login" className={link}>
            {t('login')}
          </Link>
          <a href={APK_URL} download className={link}>
            {t('download_app')}
          </a>
          <a href={WIN_URL} download className={link}>
            {t('download_win')}
          </a>
        </nav>
        <nav>
          <div className={col}>{t('footer_company')}</div>
          <Link to="/contact" className={link}>
            {t('footer_contact')}
          </Link>
          <Link to="/terms" className={link}>
            {t('footer_terms')}
          </Link>
          <Link to="/privacy" className={link}>
            {t('footer_privacy')}
          </Link>
          <Link to="/refund-policy" className={link}>
            {t('footer_refund')}
          </Link>
          <Link to="/disclaimer" className={link}>
            {t('footer_disclaimer')}
          </Link>
          <Link to="/delete-account" className={link}>
            {t('delete_account')}
          </Link>
        </nav>
        <div className="min-w-0">
          <div className={col}>{t('footer_reach')}</div>
          {phone && (
            <a href={telHref(phone)} className="flex items-center gap-2 py-1 text-white/75 hover:text-white">
              <Phone className="size-4 shrink-0" /> <span className="num">{phone}</span>
            </a>
          )}
          {wa && (
            <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 py-1 text-white/75 hover:text-white">
              <MessageCircle className="size-4 shrink-0" /> WhatsApp
            </a>
          )}
          {s.email && (
            <a href={`mailto:${s.email}`} className="flex items-center gap-2 py-1 text-white/75 hover:text-white min-w-0">
              <Mail className="size-4 shrink-0" /> <span className="truncate">{s.email}</span>
            </a>
          )}
          {s.hours && <p className="mt-1 text-[12.5px] text-white/50">{s.hours}</p>}
        </div>
      </div>
      <div className="max-w-6xl mx-auto px-4 pb-6">
        <div className="h-px bg-white/10 mb-4" />
        <div className="flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-white/50">
          <span>{t('footer_copyright', { year })}</span>
          <span>
            Software developed by <b className="text-white/80">Jantrah Tech</b>
            {phone && <> | ☎ {phone}</>}
          </span>
        </div>
      </div>
    </footer>
  );
}

import { Link } from 'react-router-dom';
import { Check, Languages } from 'lucide-react';
import { getLang, setLang, t, useLang } from '@/lib/i18n';
import { Brand, Logo } from '@/ui/kit';

/** Navy brand panel on the left (desktop), form card on the right. */
export function AuthLayout({ title, sub, children, footer }) {
  useLang();
  const ur = getLang() === 'ur';
  return (
    <div className="min-h-dvh grid lg:grid-cols-[1fr_1.1fr] bg-bg">
      <aside className="hidden lg:flex flex-col justify-between bg-gradient-to-b from-primary to-primary-2 text-white p-10">
        <Link to="/">
          <Brand onDark size={40} />
        </Link>
        <div>
          <Logo size={72} onDark />
          <h2 className="mt-5 text-[30px] font-black leading-tight max-w-md">{t('l_title')}</h2>
          <ul className="mt-5 space-y-2.5 text-white/80">
            {['l_point1', 'l_point2', 'l_point3'].map((k) => (
              <li key={k} className="flex gap-2 items-center">
                <Check className="size-4 text-[#5BE49B]" /> {t(k)}
              </li>
            ))}
          </ul>
        </div>
        <div className="text-[12.5px] text-white/50">{t('l_footer')}</div>
      </aside>
      <main className="flex flex-col">
        <div className="flex items-center justify-between px-4 h-16 lg:justify-end">
          <Link to="/" className="lg:hidden">
            <Brand size={32} />
          </Link>
          <button type="button" onClick={() => setLang(ur ? 'en' : 'ur')} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-[var(--radius-ctl)] text-[13px] font-bold text-primary hover:bg-soft whitespace-nowrap">
            <Languages className="size-4" /> {ur ? 'English' : 'Roman Urdu'}
          </button>
        </div>
        <div className="flex-1 grid place-items-center px-4 pb-10">
          <div className="w-full max-w-[440px]">
            <h1 className="text-[24px] font-black">{title}</h1>
            {sub && <p className="text-muted mt-1">{sub}</p>}
            <div className="card p-5 mt-5">{children}</div>
            {footer && <div className="text-center text-[13.5px] text-muted mt-4">{footer}</div>}
          </div>
        </div>
      </main>
    </div>
  );
}

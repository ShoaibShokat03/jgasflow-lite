import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BarChart3,
  Check,
  Cloud,
  CloudOff,
  Cylinder,
  Languages,
  Printer,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Tag as TagIcon,
  Truck,
  UsersRound,
  Wallet,
  Laptop,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useGet } from '@/lib/api';
import { getLang, setLang, t, useLang } from '@/lib/i18n';
import { Brand, Button, Card, cn, IconBox, Logo } from '@/ui/kit';
import { SiteFooter } from '@/ui/SiteFooter';
import { PlanMode } from '@/ui/PlanMode';
import { AppDownload } from '@/ui/AppDownload';

const FEATURES = [
  { icon: Printer, color: '#F26B1D', k: 'lf_sales' },
  { icon: Wallet, color: '#C62828', k: 'lf_udhaar' },
  { icon: Cylinder, color: '#020033', k: 'lf_cylinders' },
  { icon: Truck, color: '#1565C0', k: 'lf_purchases' },
  { icon: TagIcon, color: '#B77D00', k: 'lf_prices' },
  { icon: UsersRound, color: '#6A3FB5', k: 'lf_staff' },
  { icon: BarChart3, color: '#2E7D32', k: 'lf_reports' },
  { icon: Languages, color: '#3B3A8F', k: 'lf_language' },
];

export default function Landing() {
  useLang();
  const auth = useAuth();
  const plans = useGet('/billing/plans');
  const loggedIn = auth.status === 'user';
  const home = auth.isSuper ? '/admin' : '/app';
  const ur = getLang() === 'ur';

  return (
    <div className="min-h-dvh bg-bg">
      {/* top */}
      <header className="bg-primary">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center gap-3">
          <Brand onDark size={34} />
          <div className="ml-auto flex items-center gap-2">
            <button type="button" onClick={() => setLang(ur ? 'en' : 'ur')} className="hidden sm:inline-flex items-center gap-1.5 h-9 px-3 rounded-[var(--radius-ctl)] text-[13px] font-bold text-white/85 hover:bg-white/10 whitespace-nowrap">
              <Languages className="size-4" /> {ur ? 'English' : 'Roman Urdu'}
            </button>
            {loggedIn ? (
              <Button variant="accent" to={home} iconRight={ArrowRight}>
                {t('open_app')}
              </Button>
            ) : (
              <>
                <Button variant="light" to="/login">
                  {t('login')}
                </Button>
                <span className="hidden sm:inline">
                  <Button variant="accent" to="/signup">
                    {t('start_free')}
                  </Button>
                </span>
              </>
            )}
          </div>
        </div>
      </header>

      {/* hero */}
      <section className="bg-gradient-to-b from-primary to-primary-2 text-white">
        <div className="max-w-6xl mx-auto px-4 pt-10 pb-16 grid lg:grid-cols-[1.1fr_1fr] gap-10 items-center">
          <div>
            <div className="inline-flex items-center gap-2 h-8 px-3 rounded-full bg-white/10 text-[12.5px] font-semibold text-white/85">
              <Smartphone className="size-4" /> {t('l_badge')}
            </div>
            <h1 className="mt-4 text-[34px] sm:text-[44px] font-black leading-[1.08] tracking-tight">{t('l_title')}</h1>
            <p className="mt-4 text-[16px] text-white/75 max-w-xl">{t('l_sub')}</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Button variant="accent" size="lg" to={loggedIn ? home : '/signup'} iconRight={ArrowRight}>
                {loggedIn ? t('open_app') : t('start_trial', { n: plans.data?.trial_days ?? 14 })}
              </Button>
              {!loggedIn && (
                <Button variant="light" size="lg" to="/login">
                  {t('login')}
                </Button>
              )}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <AppDownload tone="light" />
              <AppDownload os="windows" tone="light" />
              <span className="text-[12.5px] text-white/65 max-w-[260px]">{t('download_hero_note')}</span>
            </div>
            <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-white/70">
              {['l_point1', 'l_point2', 'l_point3'].map((k) => (
                <span key={k} className="inline-flex items-center gap-1.5">
                  <Check className="size-4 text-[#5BE49B]" /> {t(k)}
                </span>
              ))}
            </div>
          </div>
          <HeroMock />
        </div>
      </section>

      {/* online / offline */}
      <section className="max-w-6xl mx-auto px-4 -mt-8">
        <div className="grid md:grid-cols-3 gap-4">
          <ModeCard icon={Cloud} color="#2E7D32" title={t('l_online_title')} text={t('l_online_text')} />
          <ModeCard icon={CloudOff} color="#B77D00" title={t('l_offline_title')} text={t('l_offline_text')} />
          <ModeCard icon={RefreshCw} color="#1565C0" title={t('l_switch_title')} text={t('l_switch_text')} />
        </div>
      </section>

      {/* features */}
      <section id="features" className="max-w-6xl mx-auto px-4 py-14 scroll-mt-4">
        <h2 className="text-[26px] font-black text-center">{t('l_features')}</h2>
        <p className="text-center text-muted mt-1">{t('l_features_sub')}</p>
        <div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {FEATURES.map((f) => (
            <Card key={f.k} className="p-4">
              <IconBox icon={f.icon} color={f.color} size={40} />
              <div className="mt-3 font-bold">{t(f.k)}</div>
              <div className="mt-1 text-[13px] text-muted">{t(`${f.k}_d`)}</div>
            </Card>
          ))}
        </div>
      </section>

      {/* pricing */}
      <section id="pricing" className="bg-white border-y border-line scroll-mt-4">
        <div className="max-w-6xl mx-auto px-4 py-14">
          <h2 className="text-[26px] font-black text-center">{t('l_pricing')}</h2>
          <p className="text-center text-muted mt-1">{t('l_pricing_sub')}</p>
          <div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-4 gap-4 max-w-6xl mx-auto">
            {(plans.data?.plans ?? []).map((p) => (
              <Card key={p.key} className={cn('p-5 flex flex-col', p.key === 'basic' && 'ring-2 ring-accent')}>
                <div className="flex items-center justify-between gap-2">
                  <div className="font-bold text-[16px]">{p.key === 'trial' ? t('free_trial') : p.name}</div>
                  {p.key === 'basic' ? <span className="text-[11px] font-bold text-accent-dark bg-[#fff0e6] px-2 py-0.5 rounded-md">{t('popular')}</span> : <PlanMode mode={p.mode} />}
                </div>
                <div className="mt-3 flex items-end gap-1">
                  <span className="text-[30px] font-black num">{p.price ? `Rs ${p.price.toLocaleString('en-US')}` : t('free')}</span>
                  <span className="text-muted mb-1.5 text-[13px]">{p.price ? t('per_month') : t('days_n', { n: plans.data.trial_days })}</span>
                </div>
                {p.lifetime_price > 0 && <div className="text-[12.5px] font-bold text-accent-dark">{t('or_lifetime', { amount: `Rs ${p.lifetime_price.toLocaleString('en-US')}` })}</div>}
                <ul className="mt-4 space-y-2 flex-1">
                  {p.features.map((f) => (
                    <li key={f} className="flex gap-2 text-[13.5px]">
                      <Check className="size-4 text-good shrink-0 mt-0.5" /> {f}
                    </li>
                  ))}
                </ul>
                <Button className="mt-5" full variant={p.key === 'basic' ? 'accent' : 'outline'} to={loggedIn ? home : '/signup'}>
                  {p.key === 'trial' ? t('start_free') : t('choose_plan')}
                </Button>
              </Card>
            ))}
          </div>
          <p className="text-center text-[13px] text-muted mt-5">{t('l_pay_note')}</p>
        </div>
      </section>

      {/* trust */}
      <section className="max-w-6xl mx-auto px-4 py-14 grid md:grid-cols-2 gap-6 items-center">
        <div>
          <h2 className="text-[26px] font-black">{t('l_trust_title')}</h2>
          <div className="mt-5 space-y-4">
            {[
              [ShieldCheck, 'l_trust1'],
              [Laptop, 'l_trust2'],
              [Smartphone, 'l_trust3'],
            ].map(([Icon, k]) => (
              <div key={k} className="flex gap-3">
                <IconBox icon={Icon} color="#020033" size={38} />
                <div>
                  <div className="font-bold">{t(k)}</div>
                  <div className="text-[13.5px] text-muted">{t(`${k}_d`)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <Card className="p-6 bg-gradient-to-br from-primary to-primary-2 border-0 text-white">
          <Logo size={56} onDark />
          <div className="mt-4 text-[22px] font-black">{t('l_cta_title')}</div>
          <div className="mt-1 text-white/75">{t('l_cta_sub')}</div>
          <Button className="mt-5" variant="accent" size="lg" to={loggedIn ? home : '/signup'} iconRight={ArrowRight}>
            {loggedIn ? t('open_app') : t('start_free')}
          </Button>
        </Card>
      </section>

      <SiteFooter />
    </div>
  );
}

function ModeCard({ icon, color, title, text }) {
  return (
    <Card className="p-4 flex gap-3">
      <IconBox icon={icon} color={color} size={40} />
      <div>
        <div className="font-bold">{title}</div>
        <div className="text-[13px] text-muted mt-0.5">{text}</div>
      </div>
    </Card>
  );
}

/** A small picture of the dashboard, drawn with the real UI styles. */
/** Hero picture: LPG cylinders (transparent WebP) with two live-style stat cards over it. */
function HeroMock() {
  return (
    <div className="relative mx-auto w-full max-w-[460px] pt-2">
      <div className="absolute inset-x-6 bottom-6 top-16 rounded-full bg-accent/25 blur-3xl pointer-events-none" aria-hidden />
      <img
        src="/hero-cylinders.webp"
        alt={t('hero_img_alt')}
        width={877}
        height={900}
        fetchPriority="high"
        className="relative w-full h-auto select-none drop-shadow-[0_24px_40px_rgba(0,0,0,0.35)]"
        draggable={false}
      />
      <div className="absolute left-0 top-10 sm:-left-6 rounded-[var(--radius-card)] bg-white text-ink shadow-[var(--shadow-pop)] px-3.5 py-2.5">
        <div className="text-[11px] font-semibold text-muted">{t('today_sales')}</div>
        <div className="text-[19px] font-black num leading-tight">Rs 48,750</div>
        <div className="text-[11px] font-bold text-good">12 {t('bills')}</div>
      </div>
      <div className="absolute right-0 bottom-14 sm:-right-4 rounded-[var(--radius-card)] bg-white text-ink shadow-[var(--shadow-pop)] px-3.5 py-2.5 flex gap-4">
        {[
          ['142', t('full'), '#020033'],
          ['37', t('empty'), '#B77D00'],
        ].map(([v, l, c]) => (
          <div key={l}>
            <div className="text-[19px] font-black num leading-tight" style={{ color: c }}>
              {v}
            </div>
            <div className="text-[11px] font-semibold text-muted">{l}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

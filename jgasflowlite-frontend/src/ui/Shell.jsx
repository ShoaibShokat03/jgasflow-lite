import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ShortcutsButton, ShortcutsDialog, useGlobalShortcuts } from './Shortcuts';
import {
  BarChart3,

  Cloud,
  CreditCard,
  Crown,
  DatabaseBackup,
  Home,
  Languages,
  LogOut,
  Headphones,
  BookOpen,
  Maximize2,
  Minimize2,
  Layers,
  ChevronDown,
  UserRound,
  Menu,
  Plus,
  Receipt,
  Settings,
  ShoppingCart,
  Store,
  Tag as TagIcon,
  Truck,
  Users,
  UsersRound,
  Wallet,
  X,
  Cylinder,
  LayoutDashboard,
  BadgeDollarSign,
  HandCoins,
  Landmark,
  BookOpenCheck,
  FileText,
  NotebookPen,
  Scale,
  TrendingUp,
  ListChecks,
  FileSpreadsheet,
  AlarmClock,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { getLang, setLang, t, useLang } from '@/lib/i18n';
import { dayKey, fDate, fDay } from '@/lib/format';
import { Modal } from './overlay';
import { Brand, Button, cn, Initials } from './kit';
import OfflineAccount, { OFFLINE_ALLOWED } from '@/pages/OfflineAccount';
import { useShopLogo } from './receipt';

/** Sidebar items. `who`: all | mgr (owner + manager) | owner. */
function shopNav() {
  return [
    { group: null, items: [
      { to: '/app', end: true, icon: Home, label: t('home'), who: 'all' },
    ] },
    { group: t('nav_daily'), items: [
      { to: '/app/sales', end: true, icon: Receipt, label: t('sales'), who: 'all' },
      { to: '/app/customers', icon: Users, label: t('customers'), who: 'all' },
      { to: '/app/udhaar', icon: Wallet, label: t('udhaar_payments_title'), who: 'all' },
    ] },
    { group: t('inventory'), items: [
      { to: '/app/stock', icon: Cylinder, label: t('stock'), who: 'mgr' },
      { to: '/app/cylinders', icon: Layers, label: t('manage_cylinder_types'), who: 'mgr' },
      { to: '/app/purchases', icon: ShoppingCart, label: t('purchases'), who: 'mgr' },
      { to: '/app/suppliers', icon: Truck, label: t('suppliers'), who: 'mgr' },
      { to: '/app/prices', icon: TagIcon, label: t('prices'), who: 'mgr' },
    ] },
    { group: t('nav_accounts'), items: [
      { to: '/app/accounts', end: true, icon: BookOpenCheck, label: t('acc_chart'), who: 'mgr' },
      { to: '/app/accounts/ledger', icon: FileText, label: t('acc_ledger'), who: 'mgr' },
      { to: '/app/accounts/banks', icon: Landmark, label: t('acc_banks'), who: 'mgr' },
      { to: '/app/accounts/loans', icon: HandCoins, label: t('acc_loans'), who: 'mgr' },
      { to: '/app/accounts/entries', icon: NotebookPen, label: t('acc_entries'), who: 'mgr' },
      { to: '/app/accounts/balance-sheet', icon: Scale, label: t('acc_balance_sheet'), who: 'mgr' },
      { to: '/app/accounts/profit-loss', icon: TrendingUp, label: t('acc_pnl'), who: 'mgr' },
      { to: '/app/accounts/trial-balance', icon: ListChecks, label: t('acc_trial'), who: 'mgr' },
      { to: '/app/accounts/journal', icon: FileSpreadsheet, label: t('acc_journal'), who: 'mgr' },
    ] },
    { group: t('nav_business'), items: [
      { to: '/app/reports', icon: BarChart3, label: t('reports'), who: 'mgr' },
      { to: '/app/team', icon: UsersRound, label: t('team'), who: 'owner' },
      { to: '/app/billing', icon: CreditCard, label: t('subscription'), who: 'owner' },
      { to: '/app/data', icon: DatabaseBackup, label: t('data_sync'), who: 'mgr' },
      { to: '/app/settings', icon: Settings, label: t('settings'), who: 'all' },
      { to: '/app/manual', icon: BookOpen, label: t('user_manual'), who: 'all' },
      { to: '/app/support', icon: Headphones, label: t('support'), who: 'all' },
    ] },
  ];
}

function adminNav() {
  return [
    { group: null, items: [
      { to: '/admin', end: true, icon: LayoutDashboard, label: t('admin_overview'), who: 'all' },
      { to: '/admin/shops', icon: Store, label: t('admin_shops'), who: 'all' },
      { to: '/admin/payments', icon: BadgeDollarSign, label: t('admin_payments'), who: 'all' },
      { to: '/admin/account', icon: Settings, label: t('my_account'), who: 'all' },
    ] },
  ];
}

const allowed = (who, auth) => who === 'all' || (who === 'mgr' && auth.isManager) || (who === 'owner' && auth.isOwner);

function NavList({ groups, auth, onPick }) {
  return (
    <nav className="flex flex-col gap-0.5">
      {groups.map((g, gi) => {
        const items = g.items.filter((i) => allowed(i.who, auth));
        if (!items.length) return null;
        return (
          <div key={gi} className={cn(gi > 0 && 'mt-3')}>
            {g.group && <div className="px-3 pb-1 text-[10.5px] font-bold uppercase tracking-wider text-white/45">{g.group}</div>}
            {items.map((i) => (
              <NavLink
                key={i.to}
                to={i.to}
                end={i.end}
                onClick={onPick}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 h-10 px-3 rounded-[var(--radius-ctl)] text-[14px] font-medium whitespace-nowrap transition',
                    isActive ? 'bg-white/14 text-white font-semibold' : 'text-white/75 hover:bg-white/8 hover:text-white',
                  )
                }
              >
                <i.icon className="size-[18px] shrink-0" />
                <span className="truncate">{i.label}</span>
              </NavLink>
            ))}
          </div>
        );
      })}
    </nav>
  );
}

function LangToggle({ dark }) {
  useLang();
  const ur = getLang() === 'ur';
  return (
    <button
      type="button"
      onClick={() => setLang(ur ? 'en' : 'ur')}
      className={cn('inline-flex items-center gap-1.5 h-8 px-2.5 rounded-[var(--radius-ctl)] text-[12.5px] font-bold whitespace-nowrap transition', dark ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-soft text-primary hover:bg-[#e0e0f2]')}
      title={t('language')}
    >
      <Languages className="size-4" />
      {ur ? 'Roman Urdu' : 'English'}
    </button>
  );
}

function SideBody({ admin, onPick, footer = true }) {
  useLang();
  const auth = useAuth();
  const navigate = useNavigate();
  const sub = auth.sub;
  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-5 pb-4">
        <Brand onDark size={36} sub={admin ? t('super_admin') : auth.shop?.name} />
      </div>
      {!admin && auth.shop && footer && (
        <div className="mx-3 mb-3 rounded-[var(--radius-card)] bg-white/8 px-3 py-2.5">
          <div className="text-white font-semibold text-[13.5px] truncate">{auth.user?.name}</div>
          <div className="flex items-center gap-2 mt-0.5 text-[11.5px] text-white/60">
            <span className="capitalize">{t(`role_${auth.role}`)}</span>
            <span>·</span>
            <span className="inline-flex items-center gap-1 text-[#5BE49B]">
              <Cloud className="size-3.5" /> {t('online')}
            </span>
          </div>
        </div>
      )}
      <div className="flex-1 overflow-y-auto overscroll-contain px-3 pb-4 no-scrollbar">
        <NavList groups={admin ? adminNav() : shopNav()} auth={auth} onPick={onPick} />
      </div>
      <div className="px-3 pb-4 pt-2 flex flex-col gap-2">
        {!admin && sub && auth.isOwner && (
          <button type="button" onClick={() => (onPick?.(), navigate('/app/billing'))} className="text-left rounded-[var(--radius-ctl)] bg-white/8 hover:bg-white/12 px-3 py-2 transition">
            <div className="flex items-center gap-1.5 text-[12px] font-bold text-white">
              <Crown className="size-3.5 text-[#FFC23D]" /> {sub.plan_name}
            </div>
            <div className={cn('text-[11.5px]', sub.status === 'active' ? 'text-white/60' : 'text-[#ff9a8a] font-semibold')}>
              {sub.status === 'active' ? (sub.lifetime ? t('lifetime_access') : t(sub.days_left === 1 ? 'days_left_1' : 'days_left', { n: sub.days_left })) : sub.status === 'expired' ? t('plan_expired_short') : t('suspended')}
            </div>
          </button>
        )}
        {footer && (
        <div className="flex items-center gap-2">
          <LangToggle dark />
          <Button variant="light" size="sm" icon={LogOut} className="ml-auto" onClick={auth.signOut}>
            {t('logout')}
          </Button>
        </div>
        )}
      </div>
    </div>
  );
}

function UserMenu({ admin }) {
  const auth = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => {
      if (!ref.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  const go = (to) => {
    setOpen(false);
    navigate(to);
  };
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(!open)} className="flex items-center gap-2.5 h-11 pl-1.5 pr-2.5 rounded-[var(--radius-ctl)] hover:bg-soft transition">
        <Initials name={auth.user?.name} size={34} />
        <span className="hidden xl:block text-left leading-tight min-w-0">
          <span className="block text-[13.5px] font-semibold truncate max-w-[160px]">{auth.user?.name}</span>
          <span className="block text-[11.5px] text-muted">{admin ? t('super_admin') : t(`role_${auth.role}`)}</span>
        </span>
        <ChevronDown className="size-4 text-muted" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-60 card p-1.5 shadow-[var(--shadow-pop)] animate-pop z-40">
          <div className="px-3 py-2">
            <div className="font-semibold truncate">{auth.user?.name}</div>
            <div className="text-[12px] text-muted truncate">{auth.user?.phone || auth.user?.email}</div>
          </div>
          <div className="h-px bg-line my-1" />
          <button type="button" onClick={() => go(admin ? '/admin/account' : '/app/settings')} className="w-full flex items-center gap-2.5 h-10 px-3 rounded-[var(--radius-xs)] text-[13.5px] font-medium hover:bg-soft">
            <UserRound className="size-4 text-muted" /> {t('my_account')}
          </button>
          {!admin && (
            <button type="button" onClick={() => go('/app/settings')} className="w-full flex items-center gap-2.5 h-10 px-3 rounded-[var(--radius-xs)] text-[13.5px] font-medium hover:bg-soft">
              <Settings className="size-4 text-muted" /> {t('settings')}
            </button>
          )}
          <button type="button" onClick={auth.signOut} className="w-full flex items-center gap-2.5 h-10 px-3 rounded-[var(--radius-xs)] text-[13.5px] font-medium text-bad hover:bg-[#fff5f5]">
            <LogOut className="size-4" /> {t('logout')}
          </button>
        </div>
      )}
    </div>
  );
}

/** Full screen on / off (F11 style), follows Esc and the browser's own exit. */
function FullscreenButton() {
  const [on, setOn] = useState(() => !!document.fullscreenElement);
  useEffect(() => {
    const sync = () => setOn(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);
  if (!document.documentElement.requestFullscreen) return null;
  const toggle = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => undefined);
  const label = on ? t('exit_full_screen') : t('full_screen');
  return <Button variant="outline" icon={on ? Minimize2 : Maximize2} onClick={toggle} title={label} aria-label={label} />;
}

/** Desktop top bar: page name, date, status, language, New Sale, account. */
function TopBar({ admin }) {
  const loc = useLocation();
  const auth = useAuth();
  const logo = useShopLogo();
  return (
    <header className="no-print hidden lg:block sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-line">
      <div className="h-16 px-6 max-w-[1240px] mx-auto flex items-center gap-4">
        {!admin && logo && (
          <span className="grid place-items-center size-10 shrink-0 rounded-[var(--radius-ctl)] border border-line bg-white overflow-hidden">
            <img src={logo} alt="" className="max-h-9 max-w-9 object-contain" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="text-[16px] font-bold truncate leading-tight">{admin ? t('super_admin') : auth.shop?.name}</div>
          <div className="text-[12px] text-muted truncate">{fDay(new Date())}</div>
        </div>
        {!admin && (
          <span className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-[#e8f5e9] text-good text-[12px] font-bold whitespace-nowrap">
            <Cloud className="size-3.5" /> {t('online')}
          </span>
        )}
        <LangToggle />
        <FullscreenButton />
        {!admin && <ShortcutsButton />}
        {!admin && !loc.pathname.startsWith('/app/sales/new') && (
          <Button variant="accent" icon={Plus} to="/app/sales/new">
            {t('new_sale')}
          </Button>
        )}
        <div className="w-px h-8 bg-line" />
        <UserMenu admin={admin} />
      </div>
    </header>
  );
}

function ExpiryBanner() {
  const auth = useAuth();
  const navigate = useNavigate();
  const sub = auth.sub;
  if (!sub) return null;
  const warn = sub.status === 'active' && sub.days_left <= 5;
  if (sub.status === 'active' && !warn) return null;
  const msg = sub.status === 'suspended' ? t('banner_suspended') : sub.status === 'expired' ? t('banner_expired') : t(sub.days_left === 1 ? 'banner_ending_1' : 'banner_ending', { n: sub.days_left, plan: sub.plan_name });
  return (
    <div className={cn('no-print rounded-[var(--radius-card)] border px-4 py-3 mb-4 flex flex-wrap items-center gap-3', sub.status === 'active' ? 'bg-[#fff8e6] border-[#f3dca0]' : 'bg-[#fff6f5] border-[#f6cfcb]')}>
      <div className="flex-1 min-w-[200px] text-[13.5px] font-medium">{msg}</div>
      {auth.isOwner && (
        <Button size="sm" variant="accent" icon={CreditCard} onClick={() => navigate('/app/billing')}>
          {t('renew_now')}
        </Button>
      )}
    </div>
  );
}

/**
 * Popup when the plan ends in 2 days or less, or has ended: Renew or Skip.
 * Skip hides it until tomorrow (per shop, in this browser). Lifetime plans never see it.
 */
function ExpiryPopup() {
  const auth = useAuth();
  const navigate = useNavigate();
  const loc = useLocation();
  const sub = auth.sub;
  const key = `jgf-expiry-skip-${auth.shop?.id ?? ''}`;
  const due = !!sub && !sub.lifetime && ((sub.status === 'active' && sub.days_left <= 2) || sub.status === 'expired');
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!due || loc.pathname.startsWith('/app/billing')) return;
    let skipped = '';
    try {
      skipped = localStorage.getItem(key) || '';
    } catch {
      /* shows every visit */
    }
    if (skipped !== dayKey(new Date())) setOpen(true);
  }, [due, key, loc.pathname]);
  if (!due) return null;
  const skip = () => {
    try {
      localStorage.setItem(key, dayKey(new Date()));
    } catch {
      /* shows again next visit */
    }
    setOpen(false);
  };
  const renew = () => {
    setOpen(false);
    navigate('/app/billing');
  };
  const ended = sub.status === 'expired';
  const title = ended ? t('exp_title_ended') : sub.days_left <= 1 ? t('exp_title_1') : t('exp_title_n', { n: sub.days_left });
  return (
    <Modal
      open={open}
      onClose={skip}
      title={title}
      sub={sub.expires_at ? `${t('exp_on')} ${fDate(sub.expires_at)}` : sub.plan_name}
      icon={AlarmClock}
      iconColor={ended ? '#C62828' : '#F26B1D'}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={skip}>
            {t('exp_skip')}
          </Button>
          {auth.isOwner && (
            <Button variant="accent" icon={CreditCard} onClick={renew}>
              {t('renew_now')}
            </Button>
          )}
        </>
      }
    >
      <div className="grid gap-3 text-[13.5px] leading-relaxed">
        <p>{ended ? t('exp_msg_ended') : t('exp_msg_soon', { plan: sub.plan_name })}</p>
        <ul className="grid gap-1.5 text-[13px] text-muted">
          <li>• {t('exp_keep_1')}</li>
          <li>• {t('exp_keep_2')}</li>
        </ul>
        {!auth.isOwner && <p className="text-[12.5px] font-semibold text-ink">{t('exp_ask_owner')}</p>}
      </div>
    </Modal>
  );
}

function BottomBar() {
  const items = [
    { to: '/app', end: true, icon: Home, label: t('home') },
    { to: '/app/customers', icon: Users, label: t('customers') },
    null,
    { to: '/app/udhaar', icon: Wallet, label: t('udhaar') },
    { to: '/app/sales', end: true, icon: Receipt, label: t('sales') },
  ];
  const navigate = useNavigate();
  return (
    <div className="lg:hidden fixed bottom-0 inset-x-0 z-30 no-print">
      <div className="relative mx-0 bg-white border-t border-line shadow-[0_-2px_12px_rgb(2_0_51/0.08)] rounded-t-2xl safe-bottom">
        <div className="grid grid-cols-5 h-16">
          {items.map((i, k) =>
            i ? (
              <NavLink key={i.to} to={i.to} end={i.end} className={({ isActive }) => cn('flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold', isActive ? 'text-primary' : 'text-muted')}>
                {({ isActive }) => (
                  <>
                    <span className={cn('grid place-items-center h-7 w-12 rounded-full transition', isActive && 'bg-soft')}>
                      <i.icon className="size-5" />
                    </span>
                    <span className="truncate max-w-full px-1">{i.label}</span>
                  </>
                )}
              </NavLink>
            ) : (
              <div key={k} className="relative flex justify-center">
                <button
                  type="button"
                  onClick={() => navigate('/app/sales/new')}
                  className="absolute -top-7 grid place-items-center size-16 rounded-full bg-accent text-white shadow-[0_8px_20px_-4px_rgb(242_107_29/0.6)] border-4 border-bg hover:bg-accent-dark transition"
                  aria-label={t('new_sale')}
                >
                  <Plus className="size-7" strokeWidth={2.5} />
                </button>
                <span className="absolute bottom-2 text-[11px] font-bold text-accent whitespace-nowrap">{t('new_sale')}</span>
              </div>
            ),
          )}
        </div>
      </div>
    </div>
  );
}

/** App frame: navy sidebar (desktop), top bar + drawer + bottom bar (phone). */
/** Keyboard shortcuts for shop pages (see "Keyboard shortcuts"). */
function GlobalKeys() {
  useGlobalShortcuts();
  return <ShortcutsDialog />;
}

export function Shell({ admin = false }) {
  useLang();
  const auth = useAuth();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => {
    setOpen(false);
    window.scrollTo(0, 0);
  }, [loc.pathname]);

  return (
    <div className="min-h-dvh lg:pl-[260px]">
      <aside className="no-print hidden lg:block fixed inset-y-0 left-0 w-[260px] bg-gradient-to-b from-primary to-primary-2 z-30">
        <SideBody admin={admin} footer={false} />
      </aside>
      <TopBar admin={admin} />

      {/* phone top bar */}
      <header className="no-print lg:hidden sticky top-0 z-30 bg-primary text-white">
        <div className="flex items-center gap-2 h-14 px-2">
          <Button variant="light" icon={Menu} aria-label={t('menu')} onClick={() => setOpen(true)} className="bg-transparent" />
          <div className="min-w-0 flex-1">
            <Brand onDark size={28} />
          </div>
          <LangToggle dark />
        </div>
      </header>

      {open && (
        <div className="no-print lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-primary-dark/50 animate-in" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-[280px] max-w-[85vw] bg-gradient-to-b from-primary to-primary-2 rounded-r-2xl animate-left">
            <button type="button" onClick={() => setOpen(false)} className="absolute right-2 top-3 grid place-items-center size-9 rounded-lg text-white/70 hover:bg-white/10" aria-label={t('close')}>
              <X className="size-5" />
            </button>
            <SideBody admin={admin} onPick={() => setOpen(false)} />
          </aside>
        </div>
      )}

      <main className={cn('px-4 sm:px-6 py-5 lg:py-6 max-w-[1240px] mx-auto', !admin && 'pb-28 lg:pb-10')}>
        {!admin && <ExpiryBanner />}
        {/* An Offline shop keeps its data on the phone: on the web it can renew, upgrade and get help. */}
        {!admin && auth.sub?.mode === 'offline' && !OFFLINE_ALLOWED.some((p) => loc.pathname.startsWith(p)) ? <OfflineAccount /> : <Outlet />}
      </main>

      {!admin && auth.role && <BottomBar />}
      {!admin && <GlobalKeys />}
      {!admin && <ExpiryPopup />}
    </div>
  );
}


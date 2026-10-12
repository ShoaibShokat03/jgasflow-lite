import { Suspense, lazy, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Menu as MenuIcon, PanelLeftClose, PanelLeftOpen, Search, Moon, Sun, Sparkles, LogOut, KeyRound, ChevronDown, Maximize, Minimize, CircleHelp } from 'lucide-react';
import { post } from '@/lib/api';
import { session } from '@/lib/session';
import { useFullscreen, useHotkey, useMe, useProfile, useTheme } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { ASSET_URL } from '@/lib/api';
import { Menu } from '@/components/ui/overlay';
import { Spinner } from '@/components/ui/core';
import { Logo, LogoMark } from './Logo';
import { NAV } from './nav';
import { CommandPalette } from './CommandPalette';
import { QuickActions } from './QuickActions';
import { useScrollLock } from '@/lib/scroll-lock';

const CrewConsole = lazy(() => import('@/features/assistant/CrewConsole'));
const ChangePasswordDialog = lazy(() => import('@/features/auth/ChangePasswordDialog'));

function Sidebar({ collapsed, onNavigate }) {
  const { can } = useMe();
  const { data: profile } = useProfile();
  const brandName = profile?.short_name && profile.short_name !== 'ChipsTrader' ? profile.short_name : 'ChipsTrader';
  return (
    <div className="flex flex-col h-full">
      <div className={cn('h-14 flex items-center border-b border-line shrink-0', collapsed ? 'justify-center px-2' : 'px-4')}>
        {profile?.logo_path && !collapsed ? (
          <img src={`${ASSET_URL}/${profile.logo_path}`} alt={brandName} className="h-8 max-w-[160px] object-contain" />
        ) : (
          <Logo collapsed={collapsed} name={brandName} />
        )}
      </div>
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
        {NAV.map((group, gi) => {
          const items = group.items.filter((i) => !i.perm.length || can(...i.perm));
          if (!items.length) return null;
          return (
            <div key={gi}>
              {group.label && !collapsed && <p className="px-2.5 mb-1 text-[11px] font-semibold uppercase tracking-wider text-faint">{group.label}</p>}
              {group.label && collapsed && gi > 0 && <div className="mx-3 mb-2 h-px bg-line" />}
              <ul className="space-y-0.5">
                {items.map((item) => (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      end={item.end}
                      onClick={onNavigate}
                      title={collapsed ? item.label : undefined}
                      className={({ isActive }) =>
                        cn(
                          'group flex items-center gap-2.5 h-9 rounded-lg text-[13.5px] font-medium transition-colors',
                          collapsed ? 'justify-center' : 'px-2.5',
                          isActive
                            ? 'bg-brand-50 text-link dark:bg-brand-500/12 dark:text-brand-200'
                            : 'text-muted hover:bg-surface-3 hover:text-ink',
                        )
                      }
                    >
                      {({ isActive }) => (
                        <>
                          <item.icon className={cn('size-[18px] shrink-0', isActive ? 'text-brand-600 dark:text-brand-300' : 'text-faint group-hover:text-muted')} />
                          {!collapsed && <span className="truncate">{item.label}</span>}
                        </>
                      )}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </nav>
    </div>
  );
}

export default function AppShell() {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('ct-nav') === 'collapsed');
  const [mobileOpen, setMobileOpen] = useState(false);
  useScrollLock(mobileOpen);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const { me, can } = useMe();
  const { dark, toggle } = useTheme();
  const fullscreen = useFullscreen();
  useHotkey('f', fullscreen.toggle, fullscreen.supported);
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();

  useHotkey('mod+k', () => setPaletteOpen((o) => !o));
  useHotkey('mod+j', () => can('ai.assistant.use') && setAssistantOpen((o) => !o));
  useHotkey('/', () => setPaletteOpen(true));
  useHotkey('?', () => navigate('/help'));
  useEffect(() => setMobileOpen(false), [location.pathname]);
  useEffect(() => localStorage.setItem('ct-nav', collapsed ? 'collapsed' : 'open'), [collapsed]);

  const logout = async () => {
    try {
      await post('/auth/logout');
    } catch {
      /* already signed out server-side */
    }
    session.clear();
    qc.clear();
    navigate('/login', { replace: true });
  };

  const initials = (me?.full_name || me?.username || '?').split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div className="min-h-dvh flex">
      <aside className={cn('hidden lg:flex flex-col fixed inset-y-0 left-0 z-30 bg-surface border-r border-line transition-[width] duration-200', collapsed ? 'w-[68px]' : 'w-[244px]')}>
        <Sidebar collapsed={collapsed} />
        <button onClick={() => setCollapsed((c) => !c)} className="m-2 btn btn-ghost btn-sm justify-center" aria-label="Toggle sidebar">
          {collapsed ? <PanelLeftOpen className="size-4" /> : <><PanelLeftClose className="size-4" /> Collapse</>}
        </button>
      </aside>

      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-slate-950/40 animate-in" onClick={() => setMobileOpen(false)} />
          <aside data-overlay className="absolute inset-y-0 left-0 w-[264px] bg-surface border-r border-line animate-in overflow-y-auto">
            <Sidebar onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div className={cn('flex-1 min-w-0 flex flex-col transition-[padding] duration-200', collapsed ? 'lg:pl-[68px]' : 'lg:pl-[244px]')}>
        <header className="sticky top-0 z-20 h-14 flex items-center gap-2 px-3 sm:px-5 bg-surface border-b border-line">
          <button className="lg:hidden btn btn-ghost btn-sm btn-icon" onClick={() => setMobileOpen(true)} aria-label="Open menu">
            <MenuIcon className="size-5" />
          </button>
          <LogoMark className="lg:hidden size-7" />

          <button
            onClick={() => setPaletteOpen(true)}
            className="flex-1 max-w-md flex items-center gap-2 h-9 px-3 rounded-lg border border-line bg-surface text-faint text-[13px] hover:border-line-strong transition-colors"
          >
            <Search className="size-4" />
            <span className="flex-1 text-left truncate">Search parts, documents, companies…</span>
            <span className="hidden sm:flex items-center gap-0.5"><span className="kbd">Ctrl</span><span className="kbd">K</span></span>
          </button>

          <div className="ml-auto flex items-center gap-1.5">
            <QuickActions />
            {can('ai.assistant.use') && (
              <button onClick={() => setAssistantOpen(true)} className="btn btn-sm h-9 bg-brand-700 text-white hover:bg-brand-800 shadow-sm" title="Assistant (Ctrl+J)">
                <Sparkles className="size-4" />
                <span className="hidden md:inline">Assistant</span>
              </button>
            )}
            {fullscreen.supported && (
              <button
                onClick={fullscreen.toggle}
                className="hidden sm:inline-flex btn btn-ghost btn-icon h-9 w-9"
                aria-label={fullscreen.active ? 'Exit full screen' : 'Full screen'}
                aria-pressed={fullscreen.active}
                title={fullscreen.active ? 'Exit full screen (F)' : 'Full screen (F)'}
              >
                {fullscreen.active ? <Minimize className="size-[18px]" /> : <Maximize className="size-[18px]" />}
              </button>
            )}
            <NavLink to="/help" className={({ isActive }) => cn('btn btn-ghost btn-icon h-9 w-9', isActive && 'text-link')} aria-label="User manual" title="User manual (?)">
              <CircleHelp className="size-[18px]" />
            </NavLink>
            <button onClick={toggle} className="btn btn-ghost btn-icon h-9 w-9" aria-label="Toggle theme" title={dark ? 'Light mode' : 'Dark mode'}>
              {dark ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
            </button>
            <Menu
              trigger={
                <button className="flex items-center gap-2 h-9 pl-1 pr-2 rounded-lg hover:bg-surface-3">
                  <span className="grid place-items-center size-7 rounded-full bg-gradient-to-br from-brand-600 to-cyan-700 text-white text-[11px] font-semibold">{initials}</span>
                  <span className="hidden md:block text-[13px] font-medium max-w-32 truncate">{me?.full_name || me?.username}</span>
                  <ChevronDown className="hidden md:block size-3.5 text-faint" />
                </button>
              }
              items={[
                { label: me?.email, header: true },
                '-',
                { label: 'Change password', icon: KeyRound, onClick: () => setPwOpen(true) },
                { label: dark ? 'Light mode' : 'Dark mode', icon: dark ? Sun : Moon, onClick: toggle },
                fullscreen.supported && { label: fullscreen.active ? 'Exit full screen' : 'Full screen', icon: fullscreen.active ? Minimize : Maximize, hint: 'F', onClick: fullscreen.toggle },
                '-',
                { label: 'Sign out', icon: LogOut, danger: true, onClick: logout },
              ]}
            />
          </div>
        </header>

        <main className="flex-1 px-3 sm:px-6 py-5 max-w-[1600px] w-full mx-auto">
          <Suspense
            fallback={
              <div className="grid place-items-center py-24">
                <Spinner />
              </div>
            }
          >
            <Outlet />
          </Suspense>
        </main>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} onAssistant={() => setAssistantOpen(true)} />
      <Suspense>{assistantOpen && <CrewConsole open onClose={() => setAssistantOpen(false)} />}</Suspense>
      <Suspense>{pwOpen && <ChangePasswordDialog open onClose={() => setPwOpen(false)} />}</Suspense>
    </div>
  );
}

// src/components/saas/layout/SaasLayout.jsx
// Console shell: navy sidebar (collapsible), slim header, one page scroller.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  ShieldCheck,
  LogOut,
  Menu,
  X,
  ChevronsLeft,
  ChevronsRight,
  Maximize2,
  Minimize2,
  UserCog,
  ChevronDown,
  ExternalLink,
} from "lucide-react";
import BRANDING from "../../../constants/branding";
import SupportCredit from "../../common/SupportCredit";
import SAAS_MODULES from "../../../constants/saasModules";
import { SHOP_APP_URL } from "../../../config/app";
import { getAdmin, getModules, isSuper, clearAuth, storeAdmin } from "../../../utils/saasAuth";
import { saasAuthApi } from "../../../api/saasApi";
import DarkModeToggle from "../../common/DarkModeToggle";

const NAV = [
  ...SAAS_MODULES.map((m) => ({ to: m.path, label: m.label, icon: m.icon, module: m.key })),
  { to: "/admins", label: "Admins", icon: ShieldCheck, superOnly: true },
];

/** Sidebar body, shared by the desktop rail and the mobile drawer. Module scope so it never remounts. */
const SidebarContent = ({ collapsed, navItems, onNavigate }) => (
  <div className="flex flex-col h-full">
    <div className={`flex items-center gap-2.5 h-14 px-4 ${collapsed ? "justify-center px-2" : ""}`}>
      <img src={BRANDING.logo.main} alt={BRANDING.name} className="w-8 h-8 object-contain shrink-0" />
      {!collapsed && (
        <div className="min-w-0 leading-tight">
          <p className="font-bold text-white text-[15px] truncate">
            {BRANDING.name} <span className="text-primary-400">{BRANDING.tagline}</span>
          </p>
          <p className="text-[10px] text-navy-200 truncate">Platform administration</p>
        </div>
      )}
    </div>

    {/* Scrolls when the window is short, with no visible bar taking space */}
    <nav className="flex-1 min-h-0 overflow-y-auto no-scrollbar py-3 px-2 space-y-0.5">
      {navItems.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          onClick={onNavigate}
          title={collapsed ? label : undefined}
          className={({ isActive }) =>
            `flex items-center gap-2.5 rounded-lg py-2 text-sm font-medium whitespace-nowrap transition-colors ${
              collapsed ? "justify-center px-2" : "px-3"
            } ${isActive ? "bg-primary-500 text-white" : "text-navy-100 hover:bg-white/10 hover:text-white"}`
          }
        >
          <Icon className="shrink-0" style={{ width: 18, height: 18 }} />
          {!collapsed && <span className="truncate">{label}</span>}
        </NavLink>
      ))}
    </nav>

    {!collapsed && (
      <a
        href={SHOP_APP_URL}
        target="_blank"
        rel="noreferrer"
        className="mx-3 mb-3 flex items-center justify-center gap-1.5 rounded-lg border border-white/15 px-3 py-2 text-xs font-medium text-navy-100 hover:bg-white/10 whitespace-nowrap"
      >
        <ExternalLink className="w-3.5 h-3.5" /> Open shop app
      </a>
    )}
  </div>
);

const FullscreenButton = () => {
  const [on, setOn] = useState(!!document.fullscreenElement);
  useEffect(() => {
    const sync = () => setOn(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);
  const toggle = () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  };
  return (
    <button
      onClick={toggle}
      title={on ? "Exit full screen" : "Full screen"}
      className="inline-flex items-center justify-center w-9 h-9 rounded-lg text-gray-500 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
    >
      {on ? <Minimize2 className="w-[18px] h-[18px]" /> : <Maximize2 className="w-[18px] h-[18px]" />}
    </button>
  );
};

const UserMenu = ({ admin, onLogout }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-lg pl-1 pr-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-700"
      >
        <span className="w-8 h-8 rounded-full bg-navy-900 text-white flex items-center justify-center text-xs font-bold">
          {(admin?.name || "A")[0].toUpperCase()}
        </span>
        <span className="hidden sm:block text-left leading-tight">
          <span className="block text-xs font-semibold text-gray-800 dark:text-gray-100 max-w-[140px] truncate">{admin?.name || "Admin"}</span>
          <span className="block text-[10px] text-gray-400">{admin?.role === "super_admin" ? "Super admin" : "Admin"}</span>
        </span>
        <ChevronDown className="w-4 h-4 text-gray-400" />
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-52 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg py-1 z-30">
          <button
            onClick={() => {
              setOpen(false);
              navigate("/account");
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            <UserCog className="w-4 h-4" /> My account
          </button>
          <button
            onClick={onLogout}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
          >
            <LogOut className="w-4 h-4" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
};

const SaasLayout = () => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem("jgf_console_rail") === "1";
    } catch {
      return false;
    }
  });
  const [tick, setTick] = useState(0);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const mainRef = useRef(null);
  const admin = getAdmin();

  // Grants change on the super admin's side: re-read them on load.
  useEffect(() => {
    let alive = true;
    saasAuthApi
      .me()
      .then((me) => {
        if (!alive || !me) return;
        storeAdmin({ id: me.id, name: me.name, role: me.role, modules: me.modules });
        setTick((n) => n + 1);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // A new screen starts at the top.
  useEffect(() => {
    mainRef.current?.scrollTo(0, 0);
  }, [pathname]);

  const toggleRail = () =>
    setCollapsed((c) => {
      try {
        localStorage.setItem("jgf_console_rail", c ? "0" : "1");
      } catch {
        /* ignore */
      }
      return !c;
    });

  const logout = async () => {
    try {
      await saasAuthApi.logout();
    } catch {
      /* the session may already be gone */
    }
    clearAuth();
    navigate("/login", { replace: true });
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const allowed = useMemo(() => getModules(), [tick]);
  const navItems = NAV.filter((n) => (n.superOnly ? isSuper() : allowed.includes(n.module)));
  const current = NAV.find((n) => pathname.startsWith(n.to));
  const fullHeight = pathname === "/assistant";

  return (
    <div className="flex h-full overflow-hidden bg-gray-50 dark:bg-gray-900 font-sans">
      <aside className={`hidden lg:flex flex-col shrink-0 bg-navy-900 transition-all duration-200 ${collapsed ? "w-16" : "w-60"}`}>
        <SidebarContent collapsed={collapsed} navItems={navItems} />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-64 bg-navy-900">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute top-3 right-3 w-9 h-9 inline-flex items-center justify-center rounded-lg text-navy-100 hover:bg-white/10"
              title="Close menu"
            >
              <X className="w-5 h-5" />
            </button>
            <SidebarContent collapsed={false} navItems={navItems} onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col h-full overflow-hidden">
        <header className="h-14 shrink-0 flex items-center justify-between gap-3 px-3 sm:px-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          <div className="flex items-center gap-1.5 min-w-0">
            <button
              onClick={() => setMobileOpen(true)}
              className="lg:hidden inline-flex items-center justify-center w-9 h-9 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
              title="Menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <button
              onClick={toggleRail}
              className="hidden lg:inline-flex items-center justify-center w-9 h-9 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? <ChevronsRight className="w-[18px] h-[18px]" /> : <ChevronsLeft className="w-[18px] h-[18px]" />}
            </button>
            <span className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">
              {current?.label || (pathname.startsWith("/account") ? "My account" : "")}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <FullscreenButton />
            <DarkModeToggle />
            <UserMenu admin={admin} onLogout={logout} />
          </div>
        </header>

        {/* The one page scroller: always shows its bar, never scrolls sideways. */}
        <main ref={mainRef} className="flex-1 overflow-y-scroll overflow-x-hidden p-3 sm:p-4 lg:p-6">
          {fullHeight ? (
            // The assistant fills the screen and scrolls inside itself.
            <div className="max-w-7xl mx-auto h-full">
              <Outlet />
            </div>
          ) : (
            <div className="max-w-7xl mx-auto min-h-full flex flex-col">
              <div className="flex-1">
                <Outlet />
              </div>
              <SupportCredit className="pt-6 text-center text-[11px] text-gray-400" />
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default SaasLayout;

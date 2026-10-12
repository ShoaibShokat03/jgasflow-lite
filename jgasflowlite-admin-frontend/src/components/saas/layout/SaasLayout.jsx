// src/components/saas/layout/SaasLayout.jsx
// Compact shell for the SaaS platform-admin panel:
// fixed sidebar (collapsible), slim header, scrollable content outlet.
import React, { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  ShieldCheck,
  LogOut,
  Menu,
  X,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import BRANDING from "../../../constants/branding";
import SAAS_MODULES from "../../../constants/saasModules";
import {
  getAdmin,
  getModules,
  getRefreshToken,
  clearAuth,
  storeAdmin,
} from "../../../utils/saasAuth";
import { saasAuthApi } from "../../../api/saasApi";

// Built from the shared module catalogue so a granted module and its sidebar
// entry can never drift apart. Platform Admins isn't grantable — super only.
const NAV = [
  ...SAAS_MODULES.map((m) => ({ to: m.path, label: m.label, icon: m.icon, module: m.key })),
  { to: "/admins", label: "Platform Admins", icon: ShieldCheck, superOnly: true },
];

/**
 * Sidebar body, shared by the desktop rail and the mobile drawer.
 *
 * Declared at module scope ON PURPOSE. Nesting it inside SaasLayout made it
 * a new function identity on every render, so React tore the whole subtree
 * down and rebuilt it on each navigation — remounting the <img> and flashing
 * the logo. Everything it needs comes in as props.
 */
const SidebarContent = ({ collapsed, navItems, admin, onLogout, onNavigate }) => (
  <div className="flex flex-col h-full">
    {/* Brand */}
    <div className={`flex items-center gap-2.5 px-4 h-14 border-b border-gray-100 dark:border-gray-700 ${collapsed ? "justify-center px-2" : ""}`}>
      <img
        src={BRANDING.logo.main}
        alt={BRANDING.name}
        className="w-8 h-8 rounded-lg object-contain shrink-0"
        onError={(e) => {
          e.currentTarget.style.display = "none";
        }}
      />
      {!collapsed && (
        <div className="min-w-0">
          <p className="font-bold text-gray-900 dark:text-white text-sm leading-tight truncate">
            {BRANDING.name}
          </p>
          <p className="text-[10px] text-gray-400 dark:text-gray-500 leading-tight truncate">
            {BRANDING.tagline}
          </p>
        </div>
      )}
    </div>

    {/* Nav */}
    {/* No own scrollbar — the main content area is the ONLY scroller */}
    <nav className="flex-1 min-h-0 overflow-hidden py-3 px-2 space-y-0.5">
      {navItems.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          onClick={onNavigate}
          title={collapsed ? label : undefined}
          className={({ isActive }) =>
            `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              collapsed ? "justify-center px-2" : ""
            } ${
              isActive
                ? "bg-primary-600 text-white"
                : "text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/60"
            }`
          }
        >
          <Icon className="w-4.5 h-4.5 shrink-0" style={{ width: 18, height: 18 }} />
          {!collapsed && <span className="truncate">{label}</span>}
        </NavLink>
      ))}
    </nav>

    {/* Footer: admin + logout */}
    <div className="border-t border-gray-100 dark:border-gray-700 p-3">
      {!collapsed && (
        <div className="px-1 mb-2 min-w-0">
          <p className="text-xs font-semibold text-gray-700 dark:text-gray-200 truncate">
            {admin?.name || "Admin"}
          </p>
          <p className="text-[11px] text-gray-400 truncate">{admin?.email}</p>
        </div>
      )}
      <button
        onClick={onLogout}
        title="Logout"
        className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 w-full transition-colors ${
          collapsed ? "justify-center px-2" : ""
        }`}
      >
        <LogOut style={{ width: 16, height: 16 }} />
        {!collapsed && "Logout"}
      </button>
    </div>
  </div>
);

const SaasLayout = () => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  // Bumped after /me lands, so the sidebar re-filters against fresh grants.
  const [profileTick, setProfileTick] = useState(0);
  const navigate = useNavigate();
  const admin = getAdmin();

  // Module grants change on the super admin's side, not this tab's. Re-reading
  // the profile on mount means a revoked module disappears on next navigation
  // instead of surviving until the admin happens to log out.
  useEffect(() => {
    let alive = true;
    saasAuthApi
      .me()
      .then((fresh) => {
        if (!alive || !fresh) return;
        storeAdmin(fresh);
        setProfileTick((n) => n + 1);
      })
      .catch(() => {
        /* Offline, or the session is gone. A 401 here now goes through the
           client's refresh-then-redirect path like any other call, so there
           is nothing left to do but ignore it. */
      });
    return () => {
      alive = false;
    };
  }, []);
  const isSuper = admin?.role === "super_admin";

  const handleLogout = async () => {
    try {
      const rt = getRefreshToken();
      if (rt) await saasAuthApi.logout(rt);
    } catch {
      /* token may already be dead — logout locally regardless */
    }
    clearAuth();
    navigate("/login", { replace: true });
  };

  const allowed = React.useMemo(() => getModules(), [profileTick]);
  const navItems = NAV.filter((n) =>
    n.superOnly ? isSuper : !n.module || allowed.includes(n.module),
  );

  return (
    <div className="flex h-full overflow-hidden bg-gray-50 dark:bg-gray-900 font-sans transition-colors">
      {/* Desktop sidebar */}
      <aside
        className={`hidden lg:flex flex-col shrink-0 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 transition-all duration-200 ${
          collapsed ? "w-16" : "w-60"
        }`}
      >
        <SidebarContent collapsed={collapsed} navItems={navItems} admin={admin} onLogout={handleLogout} />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-64 bg-white dark:bg-gray-800">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute top-3.5 right-3 p-1 text-gray-400 hover:text-gray-600"
            >
              <X className="w-5 h-5" />
            </button>
            <SidebarContent
              collapsed={false}
              navItems={navItems}
              admin={admin}
              onLogout={handleLogout}
              onNavigate={() => setMobileOpen(false)}
            />
          </aside>
        </div>
      )}

      {/* Main column */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Header */}
        <header className="h-14 shrink-0 flex items-center justify-between gap-3 px-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMobileOpen(true)}
              className="lg:hidden p-1.5 rounded-md text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <Menu className="w-5 h-5" />
            </button>
            <button
              onClick={() => setCollapsed((c) => !c)}
              className="hidden lg:inline-flex p-1.5 rounded-md text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? (
                <ChevronsRight className="w-4.5 h-4.5" style={{ width: 18, height: 18 }} />
              ) : (
                <ChevronsLeft className="w-4.5 h-4.5" style={{ width: 18, height: 18 }} />
              )}
            </button>
            <span className="hidden sm:block text-sm text-gray-400 dark:text-gray-500">
              Platform administration
            </span>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 flex items-center justify-center text-xs font-bold">
                {(admin?.name || "A")[0].toUpperCase()}
              </div>
              <div className="leading-tight">
                <p className="text-xs font-semibold text-gray-800 dark:text-gray-100">
                  {admin?.name || "Admin"}
                </p>
                <p className="text-[10px] text-gray-400 capitalize">
                  {String(admin?.role || "").replace(/_/g, " ")}
                </p>
              </div>
            </div>
          </div>
        </header>

        {/* Content */}
        <main
          className="flex-1 overflow-y-auto overflow-x-hidden p-4 lg:p-6"
          style={{ scrollbarGutter: "stable" }}
        >
          {/* h-full so a page CAN fill the viewport if it wants to (the
              assistant's chat does). Without a height here, a page's own
              `h-full` resolves against a content-sized box and collapses.
              Pages that are shorter are unaffected — this div paints nothing —
              and a taller page still overflows and scrolls <main> as before. */}
          <div className="max-w-7xl mx-auto h-full">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};

export default SaasLayout;

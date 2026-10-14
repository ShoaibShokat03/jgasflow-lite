// src/constants/saasModules.js
/**
 * The console's screens. `key` is the permission a super admin grants to an
 * admin, and MUST match ADMIN_MODULES in the backend
 * (jgasflowlite-backend/src/platform/admin-modules.ts): the API refuses
 * exactly what is hidden here.
 *
 * Admins (`/admins`) is not grantable: only a super admin manages admins.
 */
import {
  LayoutDashboard,
  Store,
  Wallet,
  Package,
  BarChart3,
  History,
  Headset,
  Sparkles,
  Settings,
} from "lucide-react";

export const SAAS_MODULES = [
  { key: "overview", label: "Overview", path: "/overview", icon: LayoutDashboard },
  { key: "shops", label: "Shops", path: "/shops", icon: Store },
  { key: "payments", label: "Payments", path: "/payments", icon: Wallet },
  { key: "plans", label: "Plans", path: "/plans", icon: Package },
  { key: "reports", label: "Reports", path: "/reports", icon: BarChart3 },
  { key: "activity", label: "Activity log", path: "/activity", icon: History },
  { key: "support", label: "Support inbox", path: "/support", icon: Headset },
  { key: "assistant", label: "AI Assistant", path: "/assistant", icon: Sparkles },
  { key: "settings", label: "Platform settings", path: "/settings", icon: Settings },
];

/** Grantable keys, including the ones without a sidebar entry of their own. */
export const GRANTABLE = [
  ...SAAS_MODULES.map((m) => ({ key: m.key, label: m.label })),
  { key: "ai_settings", label: "AI settings (key, model, voice)" },
];

export const SAAS_MODULE_KEYS = SAAS_MODULES.map((m) => m.key);

export default SAAS_MODULES;

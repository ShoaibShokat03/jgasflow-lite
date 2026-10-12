// src/constants/saasModules.js
/**
 * Modules and their actions a super admin can grant to another platform admin.
 *
 * A permission key is `${module}.${action}` — e.g. `companies.edit`.
 * `<module>.view` is the gate: without it the sidebar entry and the route are
 * both gone, whatever else is ticked.
 *
 * MUST stay in sync with the backend catalogue
 * (`saas/saas-admin/modules.catalog.ts`) — the sidebar, route guards and
 * buttons here hide exactly what the API refuses, so a key on only one side is
 * either a dead checkbox or a button that 403s when clicked.
 *
 * Platform Admins (`/admins`) is intentionally absent: managing admins stays
 * super-admin-only and can never be granted.
 */
import {
  LayoutDashboard,
  Package,
  Building2,
  CreditCard,
  ReceiptText,
  BarChart3,
  LifeBuoy,
  Sparkles,
} from "lucide-react";

const VIEW = { key: "view", label: "View" };

export const SAAS_MODULES = [
  {
    key: "dashboard",
    label: "Dashboard",
    path: "/dashboard",
    icon: LayoutDashboard,
    actions: [VIEW],
  },
  {
    key: "plans",
    label: "Plans",
    path: "/plans",
    icon: Package,
    actions: [
      VIEW,
      { key: "create", label: "Create" },
      { key: "edit", label: "Edit" },
      { key: "delete", label: "Delete" },
    ],
  },
  {
    key: "assistant",
    label: "AI Assistant",
    path: "/assistant",
    icon: Sparkles,
    // What the assistant may READ is decided by this admin's OTHER permissions
    // (companies.view, invoices.view …), never by a permission of its own — so
    // granting this cannot widen anyone's access. `audit` is only about seeing
    // other admins' questions.
    actions: [
      VIEW,
      { key: "audit", label: "Read all admins’ questions" },
      // Write-only: it replaces the provider key, it can never read it back.
      { key: "settings", label: "Manage API key & model" },
    ],
  },
  {
    /*
     * THE KEY STAYS `companies` WHILE THE URL SAYS `/clinics`.
     *
     * The key is the permission: granted rows in `saas_admins.modules` hold
     * `companies.view`, `companies.edit` and so on, and the backend catalog
     * (saas-admin/modules.catalog.ts) enforces those exact strings. Renaming
     * it here would not rename them there - `sanitizePermissions()` silently
     * DROPS a key it does not recognise, so every admin's clinic access
     * would quietly disappear with nothing to show it had happened.
     *
     * The URL is only what an admin reads, so that is what changed.
     */
    key: "companies",
    label: "Clinics",
    path: "/clinics",
    icon: Building2,
    actions: [
      VIEW,
      { key: "create", label: "Onboard clinic" },
      // One PATCH backs the edit form, the status dropdown and the module
      // sheet, so they share a permission instead of faking three.
      { key: "edit", label: "Edit, status & modules" },
      { key: "activity", label: "Activity" },
      // Opens the clinic as its owner — the strongest grant in the panel.
      { key: "impersonate", label: "Open clinic as owner" },
    ],
  },
  {
    key: "subscriptions",
    label: "Subscriptions",
    path: "/subscriptions",
    icon: CreditCard,
    actions: [
      VIEW,
      { key: "create", label: "Subscribe" },
      { key: "activate", label: "Activate" },
      { key: "renew", label: "Renew" },
      { key: "cancel", label: "Cancel" },
    ],
  },
  {
    key: "invoices",
    label: "Invoices",
    path: "/invoices",
    icon: ReceiptText,
    actions: [
      VIEW,
      { key: "pay", label: "Mark paid" },
      { key: "approve", label: "Approve payment" },
      { key: "reject", label: "Reject payment" },
    ],
  },
  {
    key: "analytics",
    label: "Traffic & Ads",
    path: "/analytics",
    icon: BarChart3,
    actions: [VIEW],
  },
  {
    key: "support",
    label: "Support",
    path: "/support",
    icon: LifeBuoy,
    actions: [VIEW, { key: "edit", label: "Edit settings" }],
  },
];

export const SAAS_MODULE_KEYS = SAAS_MODULES.map((m) => m.key);

export const SAAS_PERMISSION_KEYS = SAAS_MODULES.flatMap((m) =>
  m.actions.map((a) => `${m.key}.${a.key}`),
);

export const permsOfModule = (moduleKey) =>
  SAAS_MODULES.find((m) => m.key === moduleKey)?.actions.map(
    (a) => `${moduleKey}.${a.key}`,
  ) ?? [];

export default SAAS_MODULES;

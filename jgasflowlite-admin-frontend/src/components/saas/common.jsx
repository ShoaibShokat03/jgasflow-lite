// src/components/saas/common.jsx
// Compact shared building blocks for the SaaS admin pages.
import React, { useEffect } from "react";
import { X } from "lucide-react";

// ── Formatters ─────────────────────────────────────────────────
export const fmtMoney = (value, currency = "PKR") => {
  const n = Number(value ?? 0);
  try {
    return new Intl.NumberFormat("en-PK", {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return `${currency} ${Math.round(n)}`;
  }
};

/** "14 days" / "1 month" / "2 years" from plan_type + duration_count. */
export const fmtDuration = (planType, count = 1) => {
  const n = Number(count || 1);
  const unit =
    planType === "days" ? "day" : planType === "year" ? "year" : "month";
  return `${n} ${unit}${n === 1 ? "" : "s"}`;
};

export const fmtDate = (value) => {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

/** Bytes → "412 KB" / "1.8 MB". Compact enough for an inline badge. */
export const fmtBytes = (n) => {
  const b = Number(n);
  if (!Number.isFinite(b) || b <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(b) / Math.log(1024)));
  const v = b / 1024 ** i;
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
};

/** Compact relative time for list columns — "today" / "3d ago" / "2mo ago". */
export const fmtAgo = (value) => {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
};

/** Same freshness bands the activity endpoint uses for its status. */
export const staleDot = (value) => {
  if (!value) return "bg-gray-300 dark:bg-gray-600";
  const days = Math.floor((Date.now() - new Date(value).getTime()) / 86400000);
  return days <= 7
    ? "bg-emerald-500"
    : days <= 30
      ? "bg-amber-500"
      : days <= 90
        ? "bg-orange-500"
        : "bg-red-500";
};

export const fmtDateTime = (value) => {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

// ── Status badge ───────────────────────────────────────────────
const STATUS_STYLES = {
  // subscriptions
  trialing: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
  active: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  past_due: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  cancelled: "bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300",
  expired: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  // invoices
  draft: "bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300",
  open: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  unpaid: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  paid: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  void: "bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300",
  uncollectible: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  // payments (saas_payments ledger)
  pending: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  approved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  rejected: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  // companies / generic
  inactive: "bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300",
  suspended: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  // admin roles
  super_admin: "bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300",
  support: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
  billing: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
};

export const StatusBadge = ({ value }) => (
  <span
    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
      STATUS_STYLES[value] ||
      "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300"
    }`}
  >
    {String(value || "—").replace(/_/g, " ")}
  </span>
);

// ── Stat card (dashboard) ──────────────────────────────────────
export const StatCard = ({ icon: Icon, label, value, hint, tone = "primary" }) => {
  const tones = {
    primary: "bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300",
    emerald: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
    amber: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    sky: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
  };
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 flex items-center gap-4">
      <div className={`rounded-lg p-2.5 ${tones[tone] || tones.primary}`}>
        {Icon && <Icon className="w-5 h-5" />}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 truncate">{label}</p>
        <p className="text-xl font-bold text-gray-900 dark:text-white leading-tight">{value}</p>
        {hint && <p className="text-[11px] text-gray-400 dark:text-gray-500 truncate">{hint}</p>}
      </div>
    </div>
  );
};

// ── Page header ────────────────────────────────────────────────
export const PageHeader = ({ title, subtitle, children }) => (
  <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
    <div>
      <h1 className="text-xl font-bold text-gray-900 dark:text-white">{title}</h1>
      {subtitle && (
        <p className="text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>
      )}
    </div>
    {children && <div className="flex items-center gap-2">{children}</div>}
  </div>
);

// ── Table primitives ───────────────────────────────────────────
export const TableShell = ({ children }) => (
  <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
    <div className="overflow-x-auto">
      <table className="w-full text-sm">{children}</table>
    </div>
  </div>
);

export const Th = ({ children, className = "" }) => (
  <th
    className={`px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/40 ${className}`}
  >
    {children}
  </th>
);

export const Td = ({ children, className = "" }) => (
  <td className={`px-4 py-2.5 text-gray-700 dark:text-gray-200 align-middle ${className}`}>
    {children}
  </td>
);

export const Tr = ({ children, ...props }) => (
  <tr
    className="border-t border-gray-100 dark:border-gray-700/60 hover:bg-gray-50/70 dark:hover:bg-gray-700/30 transition-colors"
    {...props}
  >
    {children}
  </tr>
);

// ── Empty / error states ───────────────────────────────────────
export const EmptyState = ({ icon: Icon, title, subtitle, children }) => (
  <div className="flex flex-col items-center justify-center py-14 px-4 text-center">
    {Icon && (
      <div className="rounded-full bg-gray-100 dark:bg-gray-700 p-3 mb-3">
        <Icon className="w-6 h-6 text-gray-400 dark:text-gray-300" />
      </div>
    )}
    <p className="font-semibold text-gray-700 dark:text-gray-200">{title}</p>
    {subtitle && (
      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-sm">{subtitle}</p>
    )}
    {children && <div className="mt-4">{children}</div>}
  </div>
);

// ── Form field helpers ─────────────────────────────────────────
export const Field = ({ label, required, children, hint }) => (
  <label className="block">
    <span className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
      {label} {required && <span className="text-red-500">*</span>}
    </span>
    {children}
    {hint && <span className="block text-[11px] text-gray-400 mt-1">{hint}</span>}
  </label>
);

export const inputCls =
  "w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition";

// ── Toggle switch (instant active/inactive — no modal needed) ──
export const ToggleSwitch = ({ checked, onChange, disabled = false, title }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    title={title || (checked ? "Active — click to deactivate" : "Inactive — click to activate")}
    disabled={disabled}
    onClick={(e) => {
      e.stopPropagation();
      onChange?.(!checked);
    }}
    className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200 disabled:opacity-40 disabled:cursor-not-allowed ${
      checked ? "bg-emerald-500" : "bg-gray-300 dark:bg-gray-600"
    }`}
  >
    <span
      className={`inline-block h-4 w-4 rounded-full bg-white transition-transform duration-200 ${
        checked ? "translate-x-[18px]" : "translate-x-0.5"
      }`}
    />
  </button>
);

// ── Currency dropdown (PKR default) ────────────────────────────
export const CURRENCIES = [
  { code: "PKR", label: "PKR — Pakistani Rupee" },
  { code: "USD", label: "USD — US Dollar" },
  { code: "EUR", label: "EUR — Euro" },
  { code: "GBP", label: "GBP — British Pound" },
  { code: "AED", label: "AED — UAE Dirham" },
  { code: "SAR", label: "SAR — Saudi Riyal" },
  { code: "QAR", label: "QAR — Qatari Riyal" },
  { code: "KWD", label: "KWD — Kuwaiti Dinar" },
  { code: "OMR", label: "OMR — Omani Rial" },
  { code: "BHD", label: "BHD — Bahraini Dinar" },
  { code: "INR", label: "INR — Indian Rupee" },
  { code: "BDT", label: "BDT — Bangladeshi Taka" },
  { code: "TRY", label: "TRY — Turkish Lira" },
  { code: "CAD", label: "CAD — Canadian Dollar" },
  { code: "AUD", label: "AUD — Australian Dollar" },
];

export const CurrencySelect = ({ value = "PKR", onChange, className = "", ...props }) => (
  <select
    value={value || "PKR"}
    onChange={(e) => onChange?.(e.target.value)}
    className={className || inputCls}
    {...props}
  >
    {CURRENCIES.map((c) => (
      <option key={c.code} value={c.code}>
        {c.label}
      </option>
    ))}
  </select>
);

// ── Modal ──────────────────────────────────────────────────────
/** Full-size image viewer — dark backdrop, close button, Esc / click-out. */
export const ImageLightbox = ({ src, alt = "", onClose }) => {
  useEffect(() => {
    if (!src) return;
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [src, onClose]);

  if (!src) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80" onClick={onClose} />
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-10 rounded-full bg-white/10 hover:bg-white/20 text-white p-2 transition"
        title="Close"
      >
        <X className="w-5 h-5" />
      </button>
      <img
        src={src}
        alt={alt}
        className="relative max-w-[92vw] max-h-[88vh] object-contain rounded-xl"
      />
    </div>
  );
};

/** `size`: "md" (default) · "lg" (=== legacy `wide`) · "xl" for charts/wide tables. */
export const Modal = ({ open, onClose, title, children, footer, wide = false, size }) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div
        className={`relative w-full ${
          size === "xl" ? "max-w-4xl" : size === "lg" || wide ? "max-w-2xl" : "max-w-md"
        } rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 max-h-[90vh] flex flex-col`}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-white">{title}</h3>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 dark:hover:text-gray-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 py-4 overflow-y-auto">{children}</div>
        {footer && (
          <div className="px-5 py-3.5 border-t border-gray-100 dark:border-gray-700 flex justify-end gap-2">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

// ── Buttons (compact, theme-aware) ─────────────────────────────
export const BtnPrimary = ({ children, className = "", ...props }) => (
  <button
    className={`inline-flex items-center gap-1.5 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium px-3.5 py-2 transition disabled:opacity-50 disabled:pointer-events-none ${className}`}
    {...props}
  >
    {children}
  </button>
);

export const BtnGhost = ({ children, className = "", ...props }) => (
  <button
    className={`inline-flex items-center gap-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 text-sm font-medium px-3.5 py-2 transition disabled:opacity-50 disabled:pointer-events-none ${className}`}
    {...props}
  >
    {children}
  </button>
);

export const BtnDanger = ({ children, className = "", ...props }) => (
  <button
    className={`inline-flex items-center gap-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium px-3.5 py-2 transition disabled:opacity-50 disabled:pointer-events-none ${className}`}
    {...props}
  >
    {children}
  </button>
);

// src/components/saas/kit.jsx
// Console building blocks used by the JGasFlow pages (cards, charts, pager).
import React, { useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, AlertTriangle, RefreshCw } from "lucide-react";
import { BtnGhost, inputCls } from "./common";

export const PKR = (v) => `Rs ${Math.round(Number(v || 0)).toLocaleString("en-PK")}`;
export const num = (v) => Math.round(Number(v || 0)).toLocaleString("en-PK");
export const shortPKR = (v) => {
  const n = Number(v || 0);
  if (n >= 10000000) return `Rs ${(n / 10000000).toFixed(1)} cr`;
  if (n >= 100000) return `Rs ${(n / 100000).toFixed(1)} lac`;
  if (n >= 1000) return `Rs ${(n / 1000).toFixed(1)}k`;
  return `Rs ${Math.round(n)}`;
};
export const dayLabel = (d) =>
  new Date(`${String(d).slice(0, 10)}T00:00:00`).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
export const monthLabel = (m) =>
  new Date(`${m}-01T00:00:00`).toLocaleDateString("en-GB", { month: "short", year: "2-digit" });

export const Card = ({ title, subtitle, action, children, className = "", bodyClass = "p-4" }) => (
  <section className={`rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 min-w-0 ${className}`}>
    {(title || action) && (
      <header className="flex items-center justify-between gap-3 px-4 pt-3.5 pb-2">
        <div className="min-w-0">
          {title && <h2 className="text-sm font-semibold text-gray-900 dark:text-white truncate">{title}</h2>}
          {subtitle && <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">{subtitle}</p>}
        </div>
        {action && <div className="shrink-0 flex items-center gap-2">{action}</div>}
      </header>
    )}
    <div className={bodyClass}>{children}</div>
  </section>
);

/** A KPI tile. `tone` colours the icon chip. */
export const Kpi = ({ icon: Icon, label, value, hint, tone = "primary", onClick }) => {
  const tones = {
    primary: "bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300",
    navy: "bg-navy-100 text-navy-700 dark:bg-navy-800 dark:text-navy-100",
    emerald: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
    amber: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    sky: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
    red: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  };
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      className={`text-left rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 flex items-center gap-3.5 min-w-0 ${
        onClick ? "hover:border-primary-300 dark:hover:border-primary-700 transition-colors" : ""
      }`}
    >
      <span className={`shrink-0 rounded-lg p-2.5 ${tones[tone] || tones.primary}`}>{Icon && <Icon className="w-5 h-5" />}</span>
      <span className="min-w-0">
        <span className="block text-xs font-medium text-gray-500 dark:text-gray-400 truncate">{label}</span>
        <span className="block text-xl font-bold text-gray-900 dark:text-white leading-tight truncate">{value}</span>
        {hint && <span className="block text-[11px] text-gray-400 dark:text-gray-500 truncate">{hint}</span>}
      </span>
    </Tag>
  );
};

/** Vertical bars with hover read-out. `data` = [{ label, value, sub? }]. */
export const BarChart = ({ data, height = 160, format = num, color = "bg-primary-500", empty = "No data yet" }) => {
  const [hover, setHover] = useState(null);
  const max = Math.max(1, ...data.map((d) => Number(d.value) || 0));
  const total = data.reduce((a, d) => a + (Number(d.value) || 0), 0);
  const shown = hover != null ? data[hover] : null;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 mb-2 min-h-[20px]">
        <span className="text-xs text-gray-500 dark:text-gray-400 truncate">{shown ? shown.label : "Total"}</span>
        <span className="text-sm font-semibold text-gray-900 dark:text-white whitespace-nowrap">
          {format(shown ? shown.value : total)}
          {shown?.sub && <span className="ml-1.5 text-[11px] font-normal text-gray-400">{shown.sub}</span>}
        </span>
      </div>
      {total === 0 ? (
        <div className="flex items-center justify-center text-xs text-gray-400" style={{ height }}>
          {empty}
        </div>
      ) : (
        <div className="flex items-end gap-[3px]" style={{ height }} onMouseLeave={() => setHover(null)}>
          {data.map((d, i) => (
            <div key={i} className="flex-1 h-full flex items-end cursor-default" onMouseEnter={() => setHover(i)}>
              <div
                className={`w-full rounded-t-[3px] transition-opacity ${color} ${hover != null && hover !== i ? "opacity-40" : ""}`}
                style={{ height: `${Math.max(Number(d.value) > 0 ? 3 : 0, (Number(d.value) / max) * 100)}%` }}
              />
            </div>
          ))}
        </div>
      )}
      <div className="flex justify-between mt-1.5 text-[10px] text-gray-400">
        <span>{data[0]?.label}</span>
        <span>{data[data.length - 1]?.label}</span>
      </div>
    </div>
  );
};

/** Horizontal share bars. `rows` = [{ label, value, color? }]. */
export const ShareBars = ({ rows, format = num }) => {
  const total = rows.reduce((a, r) => a + (Number(r.value) || 0), 0) || 1;
  return (
    <div className="space-y-2.5">
      {rows.map((r) => (
        <div key={r.label}>
          <div className="flex justify-between gap-2 text-xs mb-1">
            <span className="text-gray-600 dark:text-gray-300 truncate">{r.label}</span>
            <span className="font-semibold text-gray-900 dark:text-white whitespace-nowrap">
              {format(r.value)} <span className="font-normal text-gray-400">({Math.round(((Number(r.value) || 0) / total) * 100)}%)</span>
            </span>
          </div>
          <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
            <div className={`h-full rounded-full ${r.color || "bg-primary-500"}`} style={{ width: `${((Number(r.value) || 0) / total) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
};

export const Loading = ({ label = "Loading..." }) => (
  <div className="flex items-center justify-center gap-2 py-16 text-sm text-gray-400">
    <Loader2 className="w-4 h-4 animate-spin" /> {label}
  </div>
);

export const ErrorBox = ({ error, onRetry }) => (
  <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-5 flex flex-wrap items-center justify-between gap-3">
    <div className="flex items-center gap-2 text-sm text-red-700 dark:text-red-300 min-w-0">
      <AlertTriangle className="w-4 h-4 shrink-0" />
      <span>{error?.response?.data?.message || "Could not load this screen."}</span>
    </div>
    {onRetry && (
      <BtnGhost onClick={onRetry}>
        <RefreshCw className="w-4 h-4" /> Try again
      </BtnGhost>
    )}
  </div>
);

export const Select = ({ value, onChange, options, className = "", ...props }) => (
  <select value={value} onChange={(e) => onChange(e.target.value)} className={`${inputCls} ${className}`} {...props}>
    {options.map((o) => (
      <option key={o.value} value={o.value}>
        {o.label}
      </option>
    ))}
  </select>
);

export const Pager = ({ page, totalPages, total, onPage, noun = "items" }) => (
  <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-t border-gray-100 dark:border-gray-700 text-xs text-gray-500">
    <span>
      {num(total)} {Number(total) === 1 ? noun.replace(/s$/, "") : noun}
    </span>
    <div className="flex items-center gap-1.5">
      <button
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
        className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-gray-200 dark:border-gray-600 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-700"
        title="Previous page"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
      <span className="px-2 whitespace-nowrap">
        Page {page} of {totalPages}
      </span>
      <button
        disabled={page >= totalPages}
        onClick={() => onPage(page + 1)}
        className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-gray-200 dark:border-gray-600 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-700"
        title="Next page"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  </div>
);

/** Subscription badge text and colour from a `subscription` object. */
export const subBadge = (sub) => {
  if (!sub) return { label: "-", cls: "bg-gray-100 text-gray-600" };
  if (sub.status === "suspended") return { label: "Suspended", cls: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" };
  if (sub.status === "expired") return { label: "Expired", cls: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" };
  if (sub.days_left <= 7)
    return { label: `${sub.days_left}d left`, cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" };
  if (sub.plan === "trial") return { label: "Trial", cls: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300" };
  return { label: "Paid", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" };
};

export const SubBadge = ({ sub }) => {
  const b = subBadge(sub);
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${b.cls}`}>{b.label}</span>;
};

const ACTIVITY = {
  active: { label: "Active", dot: "bg-emerald-500" },
  low: { label: "This week", dot: "bg-lime-500" },
  idle: { label: "Idle", dot: "bg-amber-500" },
  dormant: { label: "Dormant", dot: "bg-orange-500" },
  never: { label: "Never used", dot: "bg-gray-400" },
};
export const ACTIVITY_LABELS = ACTIVITY;

export const ActivityDot = ({ value, withLabel = true }) => {
  const a = ACTIVITY[value] || ACTIVITY.never;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300 whitespace-nowrap">
      <span className={`w-2 h-2 rounded-full ${a.dot}`} />
      {withLabel && a.label}
    </span>
  );
};

/** Labels for every method found in records; new plan payments are bank only. */
export const METHOD_LABELS = { bank: "Bank transfer", cash: "Cash", other: "Other", jazzcash: "JazzCash", easypaisa: "Easypaisa" };
/** What an admin can record by hand. */
export const RECORD_METHODS = ["bank", "cash", "other"];

/** Small icon button that never shrinks (close, delete, edit). */
export const IconBtn = ({ icon: Icon, title, tone = "gray", className = "", ...props }) => {
  const tones = {
    gray: "text-gray-500 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700",
    red: "text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20",
    primary: "text-primary-600 hover:bg-primary-50 dark:text-primary-400 dark:hover:bg-primary-900/20",
  };
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      className={`inline-flex items-center justify-center w-8 h-8 shrink-0 rounded-lg disabled:opacity-40 ${tones[tone]} ${className}`}
      {...props}
    >
      <Icon className="w-4 h-4" />
    </button>
  );
};

/** Offline (phone app on one phone) or Online (web and sync) shop or plan. */
export const ModeBadge = ({ mode }) =>
  mode === "offline" || mode === "online" ? (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${
        mode === "offline" ? "bg-navy-100 text-navy-700 dark:bg-navy-800 dark:text-navy-100" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
      }`}
    >
      {mode === "offline" ? "Offline" : "Online"}
    </span>
  ) : null;

/** Plain words for billing_events.action. */
export const EVENT_LABELS = {
  signup: "Signed up",
  payment_sent: "Sent a payment",
  payment_rejected: "Payment rejected",
  extended: "Plan extended",
  expiry_set: "End date set",
  suspended: "Suspended",
  reactivated: "Reactivated",
  profile_edited: "Details edited",
  password_reset: "Password reset",
  logged_out: "Signed out of all devices",
  support_login: "Support login",
  upgraded_online: "Upgraded to Online",
  moved_offline: "Moved to Offline",
  device_moved: "Moved to a new phone",
  device_released: "Phone released",
};
export const eventLabel = (a) => EVENT_LABELS[a] || String(a || "").replace(/_/g, " ");

const EVENT_TONE = {
  signup: "bg-sky-500",
  payment_sent: "bg-amber-500",
  payment_rejected: "bg-red-500",
  extended: "bg-emerald-500",
  expiry_set: "bg-emerald-500",
  suspended: "bg-red-500",
  reactivated: "bg-emerald-500",
  support_login: "bg-violet-500",
};
export const eventDot = (a) => EVENT_TONE[a] || "bg-gray-400";

/** A bordered table card with an optional footer (pager) inside the same box. `bare` when it sits inside a Card. */
export const TableCard = ({ children, footer, bare = false }) => (
  <div className={bare ? "overflow-hidden rounded-b-xl" : "rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden"}>
    <div className="overflow-x-auto">
      <table className="w-full text-sm">{children}</table>
    </div>
    {footer}
  </div>
);

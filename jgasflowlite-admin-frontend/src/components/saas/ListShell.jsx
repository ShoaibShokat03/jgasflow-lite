// src/components/saas/ListShell.jsx
//
// Reference list layout — mirrors the saas-frontend Users console so every
// list page shares ONE stable structure and navigation never glitches:
//
//   ┌─ card ────────────────────────────────────────────────┐
//   │ [icon] Title                    (⟳ refresh) (+ Add)   │
//   │ Total X: N (shimmer while first load)                 │
//   │ 🔍 debounced search  [filters…]  Sort▼ ↕  ✕ Clear     │
//   ├───────────────────────────────────────────────────────┤
//   │ ── slim "Updating…" bar (background refetch only) ──  │
//   │ skeleton | empty state | children (dimmed on refetch) │
//   ├───────────────────────────────────────────────────────┤
//   │ footer (pagination)                                   │
//   └───────────────────────────────────────────────────────┘
//
// Performance contract (used by every page):
//   * initialLoading → full-structure skeleton, min-height locked, zero shift
//   * refreshing     → previous data stays (placeholderData: keepPreviousData),
//                      content dims to 0.6 + slim bar slides down
import React, { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, RefreshCw, Search, X } from "lucide-react";
import { EmptyState } from "./common";

// ── Debounced search box (500ms, clear ✕, syncs external resets) ──
export const SearchBox = React.memo(
  ({ value = "", onChange, placeholder = "Search…", disabled = false }) => {
    const [local, setLocal] = useState(value);
    const debounceRef = useRef(null);

    useEffect(() => setLocal(value), [value]);

    useEffect(() => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (local === value) return;
      debounceRef.current = setTimeout(() => onChange?.(local), 500);
      return () => clearTimeout(debounceRef.current);
    }, [local]); // eslint-disable-line react-hooks/exhaustive-deps

    return (
      <div className="relative flex-1 min-w-[180px] max-w-xs">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
        <input
          type="text"
          placeholder={placeholder}
          value={local}
          disabled={disabled}
          onChange={(e) => setLocal(e.target.value)}
          className="w-full pl-8 pr-7 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 transition-colors"
        />
        {local && (
          <button
            onClick={() => {
              setLocal("");
              onChange?.("");
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    );
  },
);
SearchBox.displayName = "SearchBox";

// ── Compact filter select (shared sizing so every filter row lines up) ──
export const filterSelectCls =
  "bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 text-xs rounded-lg px-3 py-1.5 cursor-pointer transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500";

export const filterInputCls =
  "bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 text-xs rounded-lg px-3 py-1.5 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500";

// ── Sort select + ASC/DESC toggle ──
export const SortControls = React.memo(
  ({ sortBy, sortOrder = "DESC", options = [], onChange, disabled }) => (
    <>
      <select
        value={sortBy}
        disabled={disabled}
        onChange={(e) => onChange?.({ sortBy: e.target.value, sortOrder })}
        className={filterSelectCls}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            Sort: {o.label}
          </option>
        ))}
      </select>
      <button
        onClick={() =>
          onChange?.({ sortBy, sortOrder: sortOrder === "DESC" ? "ASC" : "DESC" })
        }
        disabled={disabled}
        title={sortOrder === "DESC" ? "Newest first" : "Oldest first"}
        className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-50 ${
          sortOrder === "DESC"
            ? "border-primary-300 bg-primary-50 text-primary-700 dark:border-primary-500 dark:bg-primary-900/40 dark:text-primary-200"
            : "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500 dark:bg-emerald-900/40 dark:text-emerald-200"
        }`}
      >
        {sortOrder === "DESC" ? (
          <ArrowDown className="w-3.5 h-3.5" />
        ) : (
          <ArrowUp className="w-3.5 h-3.5" />
        )}
        {sortOrder === "DESC" ? "Desc" : "Asc"}
      </button>
    </>
  ),
);
SortControls.displayName = "SortControls";

// ── Shimmer skeleton rows mirroring real table columns ──
// widths: array of tailwind width classes, one per column.
export const SkeletonRows = ({ headers = [], widths = [], rows = 8 }) => (
  <table className="w-full text-sm">
    <thead>
      <tr>
        {headers.map((h, i) => (
          <th
            key={i}
            className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/40"
          >
            {h}
          </th>
        ))}
      </tr>
    </thead>
    <tbody>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r} className="border-t border-gray-100 dark:border-gray-700/60">
          {headers.map((_, c) => (
            <td key={c} className="px-4 py-3">
              <span
                className={`shimmer-block inline-block h-3 ${widths[c] || "w-20"}`}
              />
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  </table>
);

// ── Shimmer skeleton cards (for grid layouts like Plans) ──
export const SkeletonCards = ({ count = 3 }) => (
  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 p-4">
    {Array.from({ length: count }).map((_, i) => (
      <div
        key={i}
        className="rounded-xl border border-gray-200 dark:border-gray-700 p-5 space-y-3"
      >
        <span className="shimmer-block block h-4 w-28" />
        <span className="shimmer-block block h-7 w-40" />
        <span className="shimmer-block block h-3 w-full" />
        <div className="grid grid-cols-2 gap-2">
          <span className="shimmer-block h-12 rounded-lg" />
          <span className="shimmer-block h-12 rounded-lg" />
        </div>
      </div>
    ))}
  </div>
);

/**
 * The shared list card. Every list page renders exactly this structure so
 * navigating between pages never shifts the layout.
 */
const ListShell = ({
  icon: Icon,
  title,
  countLabel = "Total",
  count = 0,
  initialLoading = false,
  refreshing = false,
  onRefresh,
  actions,
  search, // { value, onChange, placeholder }
  filters, // extra filter controls (selects / inputs)
  sort, // { sortBy, sortOrder, options, onChange }
  hasActiveFilters = false,
  onClear,
  isEmpty = false,
  empty, // { icon, title, subtitle, action }
  skeleton, // custom skeleton node for initial load
  footer,
  minHeight = 420,
  children,
}) => {
  const busy = initialLoading || refreshing;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden transition-colors">
      {/* Header */}
      <div className="p-4 sm:p-5 border-b border-gray-100 dark:border-gray-700">
        {/* Row 1: title + actions */}
        <div className="flex items-center justify-between flex-wrap gap-3 mb-3.5">
          <div className="flex items-center gap-3 min-w-0">
            {Icon && (
              <div className="w-9 h-9 rounded-lg bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-300 flex items-center justify-center shrink-0">
                <Icon size={18} />
              </div>
            )}
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white truncate leading-tight">
                {title}
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {initialLoading ? (
                  <span className="inline-flex items-center gap-1">
                    {countLabel}:{" "}
                    <span className="shimmer-block inline-block h-3 w-8" />
                  </span>
                ) : (
                  <>
                    {countLabel}:{" "}
                    <span className="font-semibold text-gray-700 dark:text-gray-200">
                      {count}
                    </span>
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onRefresh && (
              <button
                onClick={onRefresh}
                disabled={busy}
                title="Refresh"
                className="inline-flex items-center px-2.5 py-1.5 rounded-lg text-sm font-medium bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-60 transition-colors"
              >
                <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
              </button>
            )}
            {actions}
          </div>
        </div>

        {/* Row 2: search + filters + sort + clear */}
        {(search || filters || sort) && (
          <div className="flex flex-wrap items-center gap-2">
            {search && (
              <SearchBox
                value={search.value}
                onChange={search.onChange}
                placeholder={search.placeholder}
                disabled={initialLoading}
              />
            )}
            {filters}
            {sort && (
              <SortControls
                sortBy={sort.sortBy}
                sortOrder={sort.sortOrder}
                options={sort.options}
                onChange={sort.onChange}
                disabled={initialLoading}
              />
            )}
            {onClear && (
              <button
                onClick={onClear}
                disabled={busy || !hasActiveFilters}
                title={hasActiveFilters ? "Clear all filters" : "No filters to clear"}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  hasActiveFilters
                    ? "border-red-200 text-red-600 hover:bg-red-50 dark:border-red-600 dark:text-red-300 dark:hover:bg-red-900/30"
                    : "border-gray-200 text-gray-500 dark:border-gray-600 dark:text-gray-400"
                }`}
              >
                <X className="w-3.5 h-3.5" />
                Clear
              </button>
            )}
          </div>
        )}
      </div>

      {/* Slim "Updating…" bar — background refetches only, never on first load */}
      <div
        className={`relative overflow-hidden transition-all duration-300 ${
          refreshing && !initialLoading ? "max-h-12 opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="px-4 py-2.5 border-b border-gray-100 dark:border-gray-700 bg-primary-50/50 dark:bg-primary-900/10 flex items-center gap-2">
          <div className="w-3.5 h-3.5 border-2 border-primary-200 border-t-primary-600 dark:border-primary-700 dark:border-t-primary-400 rounded-full animate-spin" />
          <span className="text-xs text-gray-600 dark:text-gray-400">Updating…</span>
        </div>
      </div>

      {/* Content — height locked while loading/empty so nothing jumps */}
      <div
        className="overflow-x-auto transition-opacity duration-300"
        style={{
          minHeight: initialLoading || isEmpty ? `${minHeight}px` : "auto",
          opacity: refreshing && !initialLoading ? 0.6 : 1,
        }}
      >
        {initialLoading ? (
          skeleton
        ) : isEmpty ? (
          <EmptyState
            icon={empty?.icon || Icon}
            title={empty?.title || "Nothing here yet"}
            subtitle={
              hasActiveFilters
                ? "Try changing your search or filters"
                : empty?.subtitle
            }
          >
            {!hasActiveFilters && empty?.action}
          </EmptyState>
        ) : (
          children
        )}
      </div>

      {/* Footer (pagination) */}
      {!initialLoading && !isEmpty && footer && (
        <div className="border-t border-gray-100 dark:border-gray-700 px-4 py-2.5">
          {footer}
        </div>
      )}
    </div>
  );
};

export default React.memo(ListShell);

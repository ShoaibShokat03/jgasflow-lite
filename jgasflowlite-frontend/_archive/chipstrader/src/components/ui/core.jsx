import { forwardRef, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Inbox, ChevronRight, Eye, EyeOff, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export const Button = forwardRef(function Button(
  { variant = 'secondary', size, icon: Icon, loading, className, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={props.type ?? 'button'}
      className={cn('btn', `btn-${variant}`, size === 'sm' && 'btn-sm', !children && 'btn-icon', className)}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : Icon ? <Icon className="size-4 shrink-0" /> : null}
      {children}
    </button>
  );
});

/**
 * "Clear filters" for list filter bars. Always rendered, so the bar never
 * shifts when filters are applied or cleared; disabled while nothing is set.
 */
export function ClearFilters({ active, onClear }) {
  return (
    <Button
      size="sm"
      icon={X}
      disabled={!active}
      onClick={onClear}
      title={active ? 'Clear all filters' : 'No filters applied'}
      className="h-9 shrink-0 disabled:opacity-100 disabled:pointer-events-auto disabled:text-faint disabled:bg-surface-2 disabled:border-line"
    >
      Clear
    </Button>
  );
}

export function LinkButton({ to, variant = 'secondary', size, icon: Icon, className, children }) {
  return (
    <Link to={to} className={cn('btn', `btn-${variant}`, size === 'sm' && 'btn-sm', className)}>
      {Icon && <Icon className="size-4 shrink-0" />}
      {children}
    </Link>
  );
}

/** Label + control + hint/error, with the label wired to the control. */
export function Field({ label, hint, error, required, className, children, span }) {
  const id = useId();
  const child = typeof children === 'function' ? children(id) : children;
  return (
    <div className={cn(span === 2 && 'sm:col-span-2', span === 'full' && 'col-span-full', className)}>
      {label && (
        <label htmlFor={id} className="label flex items-center gap-1">
          {label}
          {required && <span className="text-danger">*</span>}
          {/* Hints stay out of the layout: an info icon with a tooltip. */}
          {hint && (
            <span title={hint} className="inline-flex text-faint hover:text-muted cursor-help">
              <Info className="size-3.5" aria-hidden />
              <span className="sr-only">{hint}</span>
            </span>
          )}
        </label>
      )}
      {child}
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}

export const Input = forwardRef(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cn('input', className)} {...props} />;
});

/**
 * Password / secret field with a show-hide eye. Use it for every password and
 * API key so people can check what they typed before saving.
 */
export const PasswordInput = forwardRef(function PasswordInput({ className, ...props }, ref) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input ref={ref} type={visible ? 'text' : 'password'} className={cn('input pr-10', className)} spellCheck={false} autoCapitalize="off" {...props} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 grid place-items-center size-7 rounded-md text-muted hover:text-ink hover:bg-surface-3"
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        title={visible ? 'Hide' : 'Show'}
      >
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
});

export const Textarea = forwardRef(function Textarea({ className, rows = 3, ...props }, ref) {
  return <textarea ref={ref} rows={rows} className={cn('input', className)} {...props} />;
});

export const Select = forwardRef(function Select({ className, children, placeholder, ...props }, ref) {
  return (
    <select ref={ref} className={cn('input', className)} {...props}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {children}
    </select>
  );
});

export function Checkbox({ label, checked, onChange, className }) {
  return (
    <label className={cn('inline-flex items-center gap-2 text-[13px] cursor-pointer select-none', className)}>
      <input type="checkbox" className="size-4 rounded border-line accent-brand-600" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

export function Card({ className, children, ...props }) {
  return (
    <div className={cn('card', className)} {...props}>
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, actions, icon: Icon, className }) {
  return (
    <div className={cn('flex items-start justify-between gap-3 px-4 pt-4 pb-3', className)}>
      <div className="flex items-center gap-2.5 min-w-0">
        {Icon && (
          <div className="grid place-items-center size-8 rounded-lg bg-brand-50 text-link dark:bg-brand-500/10 dark:text-brand-300">
            <Icon className="size-4" />
          </div>
        )}
        <div className="min-w-0">
          <h3 className="text-[14px] font-semibold truncate">{title}</h3>
          {subtitle && <p className="text-xs text-muted truncate">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

export function Spinner({ className }) {
  return <Loader2 className={cn('size-5 animate-spin text-link', className)} />;
}

export function Skeleton({ className }) {
  return <div className={cn('skeleton h-4', className)} />;
}

export function EmptyState({ icon: Icon = Inbox, title, children, action }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 px-6">
      <div className="grid place-items-center size-12 rounded-2xl bg-surface-3 text-faint mb-3">
        <Icon className="size-6" />
      </div>
      <p className="font-medium">{title}</p>
      {children && <p className="text-sm text-muted mt-1 max-w-sm">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Page title row with breadcrumb trail and actions. */
export function PageHeader({ title, subtitle, crumbs, actions, badge }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
      <div className="min-w-0">
        {crumbs && (
          <nav className="flex items-center gap-1 text-xs text-muted mb-1.5">
            {crumbs.map((c, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="size-3 text-faint" />}
                {c.to ? (
                  <Link to={c.to} className="hover:text-ink">
                    {c.label}
                  </Link>
                ) : (
                  <span>{c.label}</span>
                )}
              </span>
            ))}
          </nav>
        )}
        <div className="flex items-center gap-2.5 flex-wrap">
          <h1 className="text-[22px] font-semibold tracking-tight truncate">{title}</h1>
          {badge}
        </div>
        {subtitle && <p className="text-sm text-muted mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Tabs({ tabs, value, onChange, className }) {
  return (
    <div className={cn('flex gap-1 border-b border-line overflow-x-auto overflow-y-hidden', className)}>
      {tabs.map((t) => (
        <button
          key={t.value}
          onClick={() => onChange(t.value)}
          className={cn(
            'relative h-10 px-3 text-[13.5px] font-medium whitespace-nowrap transition-colors',
            value === t.value ? 'text-brand-700 dark:text-brand-300' : 'text-muted hover:text-ink',
          )}
        >
          <span className="flex items-center gap-1.5">
            {t.icon && <t.icon className="size-4" />}
            {t.label}
            {t.count !== undefined && t.count !== null && (
              <span className="chip h-[18px] px-1.5 bg-surface-3 text-muted text-[11px]">{t.count}</span>
            )}
          </span>
          {value === t.value && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand-600" />}
        </button>
      ))}
    </div>
  );
}

const TONES = {
  brand: 'text-link bg-brand-50 dark:bg-brand-500/10 dark:text-brand-300',
  cyan: 'text-info bg-cyan-50 dark:bg-cyan-500/10 dark:text-cyan-300',
  green: 'text-success bg-emerald-50 dark:bg-emerald-500/10 dark:text-emerald-300',
  amber: 'text-warning bg-amber-50 dark:bg-amber-500/10 dark:text-amber-300',
  rose: 'text-danger bg-rose-50 dark:bg-rose-500/10 dark:text-rose-300',
};

export function StatTile({ label, value, sub, icon: Icon, tone = 'brand', trend, to }) {
  const body = (
    <div className="card p-4 h-full transition-shadow hover:shadow-[var(--shadow-pop)]">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[12.5px] font-medium text-muted truncate min-w-0" title={typeof label === 'string' ? label : undefined}>{label}</p>
        {Icon && (
          <div className={cn('grid place-items-center size-8 shrink-0 rounded-lg', TONES[tone])}>
            <Icon className="size-4" />
          </div>
        )}
      </div>
      <p className="mt-2 text-[24px] leading-none font-semibold tracking-tight truncate">{value}</p>
      <div className="mt-2 flex items-center gap-2 text-xs text-muted min-h-4 whitespace-nowrap overflow-hidden">
        {trend !== undefined && trend !== null && (
          <span className={cn('font-semibold', trend >= 0 ? 'text-success' : 'text-danger')}>
            {trend >= 0 ? '▲' : '▼'} {Math.abs(trend).toFixed(1)}%
          </span>
        )}
        {sub}
      </div>
    </div>
  );
  return to ? <Link to={to}>{body}</Link> : body;
}

/** Two-column definition list for detail panels. */
export function DetailList({ items, cols = 2 }) {
  return (
    <dl className={cn('grid gap-x-6 gap-y-3', cols === 2 ? 'sm:grid-cols-2' : cols === 3 ? 'sm:grid-cols-3' : '')}>
      {items
        .filter((i) => i && !i.hidden)
        .map((i) => (
          <div key={i.label} className="min-w-0">
            <dt className="text-[11.5px] uppercase tracking-wide font-medium text-faint">{i.label}</dt>
            <dd className="text-[13.5px] mt-0.5 break-words">{i.value === null || i.value === undefined || i.value === '' ? <span className="text-faint">Not set</span> : i.value}</dd>
          </div>
        ))}
    </dl>
  );
}

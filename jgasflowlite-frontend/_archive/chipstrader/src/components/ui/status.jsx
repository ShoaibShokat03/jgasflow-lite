import { cn } from '@/lib/utils';
import { humanize } from '@/lib/format';

/** One colour language for every status in the system. */
const TONE = {
  // neutral / waiting
  draft: 'slate', open: 'brand', new: 'brand', pending: 'amber',
  // in motion
  sent: 'cyan', received: 'cyan', processing: 'cyan', acknowledged: 'cyan', quoted: 'violet', qualified: 'violet', negotiating: 'violet',
  issued: 'brand', posted: 'cyan', active: 'green',
  // partial
  partial: 'amber', on_hold: 'amber', hold: 'amber', quarantine: 'amber',
  // good outcomes
  accepted: 'green', won: 'green', confirmed: 'green', shipped: 'green', delivered: 'green', paid: 'green', available: 'green', converted: 'violet',
  // bad outcomes
  rejected: 'rose', lost: 'rose', expired: 'slate', cancelled: 'slate', void: 'rose', damaged: 'rose', blacklisted: 'rose', depleted: 'slate', inactive: 'slate',
  overdue: 'rose',
};

const CLASSES = {
  slate: 'bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300',
  brand: 'bg-brand-50 text-link dark:bg-brand-500/15 dark:text-brand-300',
  cyan: 'bg-cyan-50 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300',
  violet: 'bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
  green: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  amber: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  rose: 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
};

const DOT = {
  slate: 'bg-slate-400', brand: 'bg-brand-500', cyan: 'bg-cyan-500', violet: 'bg-violet-500',
  green: 'bg-emerald-500', amber: 'bg-amber-500', rose: 'bg-rose-500',
};

export function StatusBadge({ status, className, label }) {
  if (!status) return null;
  const tone = TONE[status] ?? 'slate';
  return (
    <span className={cn('chip', CLASSES[tone], className)}>
      <span className={cn('size-1.5 rounded-full', DOT[tone])} />
      {label ?? humanize(status)}
    </span>
  );
}

export function Badge({ tone = 'slate', className, children }) {
  return <span className={cn('chip', CLASSES[tone], className)}>{children}</span>;
}

/** Thin progress bar, e.g. shipped / ordered. */
export function Progress({ value, max, className, tone = 'brand' }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className={cn('h-1.5 w-full rounded-full bg-surface-3 overflow-hidden', className)}>
      <div className={cn('h-full rounded-full transition-[width] duration-500', tone === 'green' ? 'bg-emerald-500' : 'bg-brand-500')} style={{ width: `${pct}%` }} />
    </div>
  );
}

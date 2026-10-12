import { useId } from 'react';
import { cn } from '@/lib/utils';

/** The ChipsTrader mark: a chip with pins, a "C" trace and a signal node. */
export function LogoMark({ className }) {
  // Unique per instance: a shared id resolves to the first copy in the DOM, and
  // when that copy is hidden (e.g. the desktop sidebar on a phone) the visible
  // mark loses its gradient.
  const id = 'ct-mark-' + useId().replace(/:/g, '');
  return (
    <svg viewBox="0 0 64 64" className={cn('size-8', className)} aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="8" y1="8" x2="56" y2="56" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#4f46e5" />
          <stop offset="1" stopColor="#06b6d4" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill={`url(#${id})`} />
      <g stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity=".55">
        <path d="M24 10v6M32 10v6M40 10v6M24 48v6M32 48v6M40 48v6M10 24h6M10 32h6M10 40h6M48 24h6M48 32h6M48 40h6" />
      </g>
      <rect x="17" y="17" width="30" height="30" rx="6" fill="#fff" />
      <path d="M39 26.5a8.5 8.5 0 1 0 0 11" fill="none" stroke={`url(#${id})`} strokeWidth="4.2" strokeLinecap="round" />
      <circle cx="39.5" cy="32" r="2.4" fill="#06b6d4" />
    </svg>
  );
}

export function Logo({ collapsed, name = 'ChipsTrader', className }) {
  return (
    <div className={cn('flex items-center gap-2.5 min-w-0', className)}>
      <LogoMark className="size-8 shrink-0" />
      {!collapsed && (
        <span className="font-semibold text-[16px] tracking-tight truncate">
          {name === 'ChipsTrader' ? (
            <>
              Chips<span className="text-brand-600 dark:text-brand-300">Trader</span>
            </>
          ) : (
            name
          )}
        </span>
      )}
    </div>
  );
}

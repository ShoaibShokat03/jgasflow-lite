import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, RefreshCw } from 'lucide-react';
import { initials, money } from '@/lib/format';
import { t } from '@/lib/i18n';

export const cn = (...a) => a.flat().filter(Boolean).join(' ');

/** JGasFlow mark: cylinder with a warm flame, no tile and no border. */
export function Logo({ size = 40, onDark = false, className }) {
  const body = onDark ? '#ffffff' : '#020033';
  const id = onDark ? 'd' : 'l';
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={className} aria-hidden="true">
      <defs>
        <linearGradient id={`jf${id}`} x1="0" y1="21.12" x2="0" y2="50.56" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FF9A4D" />
          <stop offset=".55" stopColor="#F26B1D" />
          <stop offset="1" stopColor="#E2540E" />
        </linearGradient>
        <linearGradient id={`jc${id}`} x1="0" y1="35.84" x2="0" y2="48.72" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FFE08A" />
          <stop offset="1" stopColor="#FFC23D" />
        </linearGradient>
      </defs>
      <g fill={body}>
        <rect x="28.16" y="3.84" width="7.68" height="5.12" />
        <rect x="21.76" y="8.32" width="20.48" height="5.76" rx="1.6" />
        <rect x="13.44" y="13.44" width="37.12" height="44.8" rx="11.52" />
        <rect x="17.28" y="56.96" width="29.44" height="3.2" />
      </g>
      <path fill={`url(#jf${id})`} d="M32 21.12C44.512 31.424 43.04 49.088 32 50.56C20.96 49.088 20.224 35.84 27.584 29.216C28.32 35.104 31.264 36.576 32.736 35.104C30.528 29.952 30.528 25.536 32 21.12Z" />
      <path fill={`url(#jc${id})`} d="M32 35.84C37.888 40.992 36.416 48.352 32 48.72C27.584 48.352 26.848 41.728 32 35.84Z" />
    </svg>
  );
}

export function Brand({ onDark = false, size = 34, sub }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <Logo size={size} onDark={onDark} />
      <div className="min-w-0 leading-tight">
        <div className={cn('font-black tracking-tight text-[18px] whitespace-nowrap', onDark ? 'text-white' : 'text-primary')}>
          J<span className="text-accent">Gas</span>Flow
        </div>
        {sub && <div className={cn('text-[11px] truncate', onDark ? 'text-white/60' : 'text-muted')}>{sub}</div>}
      </div>
    </div>
  );
}

const VARIANTS = {
  primary: 'bg-primary text-white hover:bg-primary-2 active:bg-primary-dark',
  accent: 'bg-accent text-white hover:bg-accent-dark',
  outline: 'bg-white text-primary border border-field hover:bg-soft',
  ghost: 'text-primary hover:bg-soft',
  soft: 'bg-soft text-primary hover:bg-[#e0e0f2]',
  danger: 'bg-bad text-white hover:bg-[#a51f1f]',
  'danger-outline': 'bg-white text-bad border border-[#f0c4c4] hover:bg-[#fff5f5]',
  good: 'bg-good text-white hover:bg-[#256a29]',
  light: 'bg-white/10 text-white hover:bg-white/20',
};
const SIZES = {
  sm: 'h-8 text-[13px] gap-1.5 [&_svg]:size-4',
  md: 'h-10 text-[13.5px] gap-2 [&_svg]:size-[18px]',
  lg: 'h-12 text-[15px] gap-2 [&_svg]:size-5',
};
/** Side padding with a label; icon-only buttons are square instead. */
const PAD = { sm: 'px-3', md: 'px-4', lg: 'px-5' };
const SQUARE = { sm: 'w-8', md: 'w-10', lg: 'w-12' };

/** Icon + short label. Never wraps onto a second line. */
export function Button({ variant = 'primary', size = 'md', icon: Icon, iconRight: IconR, loading, full, className, children, to, type = 'button', ...rest }) {
  const cls = cn(
    'inline-flex items-center justify-center whitespace-nowrap rounded-[var(--radius-ctl)] font-semibold transition select-none disabled:opacity-55 disabled:pointer-events-none shrink-0 [&_svg]:shrink-0',
    VARIANTS[variant],
    SIZES[size],
    children ? PAD[size] : SQUARE[size],
    full && 'w-full',
    className,
  );
  const inner = (
    <>
      {loading ? <Loader2 className="animate-spin" /> : Icon && <Icon />}
      {children && <span className="truncate">{children}</span>}
      {IconR && !loading && <IconR />}
    </>
  );
  if (to)
    return (
      <Link to={to} className={cls} {...rest}>
        {inner}
      </Link>
    );
  return (
    <button type={type} className={cls} disabled={loading || rest.disabled} {...rest}>
      {inner}
    </button>
  );
}

export function Card({ className, children, as: As = 'div', ...rest }) {
  return (
    <As className={cn('card', className)} {...rest}>
      {children}
    </As>
  );
}

export function SectionHeader({ title, action, className }) {
  return (
    <div className={cn('flex items-center justify-between gap-2 mt-5 mb-2 px-0.5', className)}>
      <h2 className="text-[15px] font-bold text-ink truncate">{title}</h2>
      {action}
    </div>
  );
}

export function IconBox({ icon: Icon, color = '#020033', size = 36, className }) {
  return (
    <div className={cn('grid place-items-center rounded-[var(--radius-xs)] shrink-0', className)} style={{ width: size, height: size, background: `${color}1f`, color }}>
      <Icon style={{ width: size * 0.5, height: size * 0.5 }} />
    </div>
  );
}

/** Icon and number on one row, label under. */
export function StatTile({ label, value, icon, color = '#020033', onClick, sub, to }) {
  const navigate = useNavigate();
  const go = onClick || (to ? () => navigate(to) : undefined);
  return (
    <Card as={go ? 'button' : 'div'} onClick={go} className={cn('p-3 text-left w-full h-full', go && 'hover:border-[#cfd2e6] transition')}>
      <div className="flex items-center gap-2.5">
        <IconBox icon={icon} color={color} size={34} />
        <div className="text-[20px] font-extrabold num truncate">{value}</div>
      </div>
      <div className="mt-1.5 text-[12.5px] font-medium text-muted truncate">{label}</div>
      {sub && <div className="text-[11.5px] text-muted truncate">{sub}</div>}
    </Card>
  );
}

const TONES = {
  navy: 'bg-soft text-primary',
  green: 'bg-[#e8f5e9] text-good',
  red: 'bg-[#fdecea] text-bad',
  amber: 'bg-[#fff4d6] text-[#8a5d00]',
  blue: 'bg-[#e3eefb] text-info',
  purple: 'bg-[#efe8fa] text-purple',
  orange: 'bg-[#fff0e6] text-accent-dark',
  gray: 'bg-[#eef0f5] text-muted',
};
export function Tag({ tone = 'navy', children, className }) {
  return <span className={cn('inline-flex items-center gap-1 h-[22px] px-2 rounded-md text-[11.5px] font-bold whitespace-nowrap', TONES[tone], className)}>{children}</span>;
}

export function Initials({ name, size = 38, tone = 'navy' }) {
  return (
    <div className={cn('grid place-items-center rounded-[var(--radius-ctl)] font-bold shrink-0', TONES[tone])} style={{ width: size, height: size, fontSize: size * 0.36 }}>
      {initials(name)}
    </div>
  );
}

export function Empty({ icon: Icon, title, sub, action, className }) {
  return (
    <div className={cn('flex flex-col items-center text-center px-6 py-10', className)}>
      {Icon && <Icon className="size-10 text-muted/50 mb-2" />}
      <div className="font-semibold text-ink">{title}</div>
      {sub && <div className="text-[13px] text-muted mt-1 max-w-sm">{sub}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function KV({ label, value, strong, tone, className }) {
  return (
    <div className={cn('flex items-center justify-between gap-3 py-1', className)}>
      <span className={cn('text-[13px]', strong ? 'font-bold text-ink' : 'text-muted')}>{label}</span>
      <span className={cn('num text-right', strong ? 'font-extrabold text-[15px]' : 'font-semibold', tone === 'red' && 'text-bad', tone === 'green' && 'text-good')}>{value}</span>
    </div>
  );
}

/** Udhaar in red, advance in green, settled in grey. */
/** Balance in plain words: To receive (red), Paid extra (green), Clear. `supplier`: To pay. */
export function Balance({ value, className, label = true, supplier = false }) {
  const v = Number(value) || 0;
  if (Math.abs(v) < 0.01) return <span className={cn('text-muted font-semibold', className)}>{label ? t('bal_clear') : money(0)}</span>;
  return (
    <span className={cn('num font-bold whitespace-nowrap', v > 0 ? 'text-bad' : 'text-good', className)}>
      {money(Math.abs(v))}
      {label && <span className="ml-1.5 text-[11px] font-semibold opacity-80">{v > 0 ? t(supplier ? 'bal_pay' : 'bal_receive') : t('bal_extra')}</span>}
    </span>
  );
}

export function Spinner({ className }) {
  return <Loader2 className={cn('animate-spin text-primary', className)} />;
}

export function Loading({ className }) {
  return (
    <div className={cn('grid place-items-center py-16', className)}>
      <Spinner className="size-7" />
    </div>
  );
}

export function ErrorBox({ error, retry }) {
  return (
    <Card className="p-5 text-center">
      <div className="font-semibold text-bad">{error?.message || 'Something went wrong'}</div>
      {retry && (
        <Button variant="outline" size="sm" icon={RefreshCw} className="mt-3" onClick={retry}>
          {t('retry')}
        </Button>
      )}
    </Card>
  );
}

/** Loads a query and renders children(data) with loading and error states. */
export function Async({ q, children, loading }) {
  if (q.isLoading) return loading ?? <Loading />;
  if (q.isError) return <ErrorBox error={q.error} retry={() => q.refetch()} />;
  return children(q.data);
}

export function PageHeader({ title, sub, back, actions, className }) {
  const navigate = useNavigate();
  return (
    <div className={cn('flex flex-wrap items-center gap-3 mb-4', className)}>
      {back && <Button variant="outline" size="md" icon={ArrowLeft} aria-label={t('back')} onClick={() => (typeof back === 'string' ? navigate(back) : navigate(-1))} />}
      <div className="min-w-0 flex-1">
        <h1 className="text-[20px] font-bold leading-tight truncate">{title}</h1>
        {sub && <div className="text-[13px] text-muted truncate">{sub}</div>}
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}

/** Simple bar chart (7 days, by day). */
export function Bars({ data, height = 120, valueLabel = (v) => money(v) }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="flex items-end gap-2" style={{ height }}>
      {data.map((d, i) => (
        <div key={i} className="flex-1 min-w-0 flex flex-col items-center justify-end h-full group">
          <div className="text-[10.5px] font-semibold text-muted mb-1 opacity-0 group-hover:opacity-100 transition whitespace-nowrap">{d.value ? valueLabel(d.value) : ''}</div>
          <div
            className={cn('w-full max-w-[34px] rounded-t-[6px] rounded-b-[2px] transition-all', d.highlight ? 'bg-accent' : 'bg-primary-3')}
            style={{ height: `${Math.max(d.value ? 6 : 2, (d.value / max) * (height - 34))}px`, opacity: d.value ? 1 : 0.25 }}
            title={valueLabel(d.value)}
          />
          <div className={cn('mt-1.5 text-[11px] truncate', d.highlight ? 'font-bold text-ink' : 'text-muted')}>{d.label}</div>
        </div>
      ))}
    </div>
  );
}

import { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown, Eye, EyeOff, Minus, Plus, Search, X } from 'lucide-react';
import { getCurrency, MAX_AMOUNT, parseNum, PAYMENT_METHODS } from '@/lib/format';
import { methodLabel, t } from '@/lib/i18n';
import { cn } from './kit';

/** Input rules, same as the mobile app (lib/core/validators.dart). */
const FILTERS = {
  phone: /^[0-9+\-]{0,15}$/,
  person: /^[\p{L} .'-]*$/u,
  business: /^[\p{L}\p{N} .,&'\-()/#]*$/u,
  decimal: /^\d{0,9}(\.\d{0,2})?$/,
  int: /^\d{0,6}$/,
};

/** Pasted text keeps its allowed characters instead of being dropped. */
const CLEAN = {
  phone: (v) => v.replace(/[^0-9+-]/g, '').slice(0, 15),
  person: (v) => v.replace(/[^\p{L} .'-]/gu, '').replace(/\s+/g, ' '),
  business: (v) => v.replace(/[^\p{L}\p{N} .,&'\-()/#]/gu, '').replace(/\s+/g, ' '),
  decimal: (v) => {
    const [a, ...rest] = v.replace(/[^0-9.]/g, '').split('.');
    return (a.slice(0, 9) + (rest.length ? `.${rest.join('').slice(0, 2)}` : '')).replace(/^\./, '0.');
  },
  int: (v) => v.replace(/\D/g, '').slice(0, 6),
};

/** The same character 4 or more times in a row, like "KKKK" or "1111". */
const JUNK_RUN = /(.){3,}/u;

/** Pakistani numbers: 03xx xxxxxxx, 0xx landlines, or +92 / 92 in front. */
export function phoneError(v, required = true) {
  const s = (v || '').trim();
  if (!s) return required ? t('required') : null;
  const d = s.replace(/[^0-9]/g, '');
  if (d.length < 10 || d.length > 13) return t('phone_invalid');
  if (!/^(0|92)/.test(d) || /^0+$/.test(d) || /^(\d)+$/.test(d) || /(\d){6,}/.test(d)) return t('phone_not_real');
  return null;
}
export function personNameError(v) {
  const s = (v || '').trim().replace(/\s+/g, ' ');
  if (!s) return t('required');
  if (s.length < 2) return t('name_too_short');
  if (!/^[\p{L} .'-]+$/u.test(s)) return t('name_letters_only');
  if (JUNK_RUN.test(s.replace(/\s/g, ''))) return t('name_not_real');
  return null;
}
export function businessNameError(v) {
  const s = (v || '').trim().replace(/\s+/g, ' ');
  if (!s) return t('required');
  if (s.length < 2) return t('name_too_short');
  if (!/\p{L}/u.test(s)) return t('name_needs_letters');
  if (!/^[\p{L}\p{N} .,&'\-()/#]+$/u.test(s)) return t('name_bad_symbols');
  if ((s.match(/\p{L}/gu) || []).length < 2 || JUNK_RUN.test(s.replace(/\s/g, ''))) return t('name_not_real');
  return null;
}
/** Optional free text such as an address: no runs of one character. */
export const textError = (v) => (v && JUNK_RUN.test(v.replace(/\s/g, '')) ? t('text_not_real') : null);
export const emailError = (v) => (!v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) ? null : t('email_invalid'));
export const passwordError = (v) => (!v ? t('required') : v.length < 6 ? t('password_short') : null);

/**
 * Label, control and one message line. With `reserve`, the message line always
 * takes its space (empty until there is an error), so showing an error never
 * pushes the fields below it down.
 */
export function Field({ label, error, hint, children, className, htmlFor, reserve }) {
  const msg = error || hint;
  return (
    <div className={cn('min-w-0', className)}>
      {label && (
        <label className="label" htmlFor={htmlFor}>
          {label}
        </label>
      )}
      {children}
      {msg || reserve ? (
        <div className={cn('mt-1 text-[12px] leading-[16px] truncate', reserve && 'h-4', error ? 'font-medium text-bad' : 'text-muted')} title={msg || undefined}>
          {msg}
        </div>
      ) : null}
    </div>
  );
}

/** Text input with the app's character filters. onChange receives the string. */
export function TextInput({ label, error, hint, value, onChange, filter, prefix, className, inputClassName, maxLength, reserve, ...rest }) {
  const id = useId();
  const input = (
    <div className="relative">
      {prefix && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] font-semibold text-muted pointer-events-none">{prefix}</span>}
      <input
        id={id}
        value={value ?? ''}
        maxLength={maxLength}
        aria-invalid={!!error}
        onChange={(e) => {
          let v = e.target.value;
          if (filter && !FILTERS[filter].test(v)) {
            v = CLEAN[filter](v);
            if (!FILTERS[filter].test(v) || v === (value ?? '')) return;
          }
          onChange?.(v);
        }}
        inputMode={filter === 'decimal' ? 'decimal' : filter === 'int' || filter === 'phone' ? 'numeric' : undefined}
        // No browser typing history: React reuses the same input ids across
        // screens, so the browser would offer one field's history in another
        // (a login name in Discount). Sign-in and contact fields opt back in.
        autoComplete="off"
        className={cn('ctl', prefix && 'pl-10', (filter === 'decimal' || filter === 'int') && 'num', inputClassName)}
        {...rest}
      />
    </div>
  );
  if (!label && !error && !hint && !reserve) return <div className={className}>{input}</div>;
  return (
    <Field label={label} error={error} hint={hint} className={className} htmlFor={id} reserve={reserve}>
      {input}
    </Field>
  );
}

/** Money field; typing past [max] (default Rs 1 crore) is ignored. */
export const MoneyInput = ({ max = MAX_AMOUNT, onChange, ...p }) => (
  <TextInput filter="decimal" prefix={getCurrency()} placeholder="0" {...p} onChange={(v) => (parseNum(v) > max ? undefined : onChange(v))} />
);

export function PasswordInput({ label, error, hint, value, onChange, className, reserve, ...rest }) {
  const [show, setShow] = useState(false);
  const id = useId();
  return (
    <Field label={label} error={error} hint={hint} className={className} htmlFor={id} reserve={reserve}>
      <div className="relative">
        <input id={id} type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={!!error} className="ctl pr-11" {...rest} />
        <button type="button" onClick={() => setShow(!show)} className="absolute right-1 top-1/2 -translate-y-1/2 grid place-items-center size-8 rounded-md text-muted hover:text-primary" aria-label={show ? t('hide_password') : t('show_password')}>
          {show ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}
        </button>
      </div>
    </Field>
  );
}

export function Textarea({ label, error, value, onChange, className, rows = 2, ...rest }) {
  const id = useId();
  return (
    <Field label={label} error={error} className={className} htmlFor={id}>
      <textarea id={id} rows={rows} value={value ?? ''} onChange={(e) => onChange(e.target.value)} autoComplete="off" className="ctl h-auto py-2 resize-y" {...rest} />
    </Field>
  );
}

export function Select({ label, error, value, onChange, options, className, placeholder, ...rest }) {
  const id = useId();
  return (
    <Field label={label} error={error} className={className} htmlFor={id}>
      <select id={id} value={value ?? ''} onChange={(e) => onChange(e.target.value)} aria-invalid={!!error} className="ctl pr-8" {...rest}>
        {placeholder != null && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function Switch({ checked, onChange, label, sub, disabled }) {
  return (
    <label className={cn('flex items-center justify-between gap-4 py-1', disabled ? 'opacity-60' : 'cursor-pointer')}>
      <span className="min-w-0">
        <span className="block font-medium text-[14px]">{label}</span>
        {sub && <span className="block text-[12.5px] text-muted">{sub}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn('relative w-11 h-6 rounded-full transition shrink-0', checked ? 'bg-primary' : 'bg-[#cfd2de]')}
      >
        <span className={cn('absolute top-0.5 size-5 rounded-full bg-white shadow transition-all', checked ? 'left-[22px]' : 'left-0.5')} />
      </button>
    </label>
  );
}

/** Row of chips (filters, periods, customer type). */
export function Chips({ options, value, onChange, className, size = 'md' }) {
  return (
    <div className={cn('flex gap-1.5 overflow-x-auto scroll-thin', className)}>
      {options.map((o) => {
        const on = o.value === value;
        const Icon = o.icon;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={cn(
              'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-[var(--radius-ctl)] border font-semibold transition shrink-0 min-w-0',
              size === 'sm' ? 'h-8 px-3 text-[12.5px]' : 'h-9 px-3.5 text-[13px]',
              on ? 'bg-primary border-primary text-white' : 'bg-white border-line text-ink hover:bg-soft',
            )}
          >
            {Icon && <Icon className="size-4" />}
            {o.label}
            {o.count != null && <span className={cn('text-[11px] font-bold', on ? 'text-white/70' : 'text-muted')}>{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function SearchBox({ value, onChange, placeholder, className, autoFocus }) {
  return (
    <div className={cn('relative', className)}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-[18px] text-muted pointer-events-none" />
      <input data-shortcut="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder || t('search')} autoComplete="off" className="ctl pl-10 pr-9" autoFocus={autoFocus} />
      {value && (
        <button type="button" onClick={() => onChange('')} className="absolute right-1.5 top-1/2 -translate-y-1/2 grid place-items-center size-7 rounded-md text-muted hover:text-primary" aria-label={t('clear')}>
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}

/** - qty + with the number in the middle (40px buttons, like the app). */
export function QtyStepper({ value, onChange, min = 0, max = 99999, tone = 'navy' }) {
  const v = Number(value) || 0;
  const btn = cn('grid place-items-center size-10 rounded-[var(--radius-xs)] transition disabled:opacity-35', tone === 'orange' ? 'bg-[#fff0e6] text-accent-dark hover:bg-[#ffe2cf]' : 'bg-soft text-primary hover:bg-[#e0e0f2]');
  return (
    <div className="inline-flex items-center gap-1.5 shrink-0">
      <button type="button" className={btn} onClick={() => onChange(Math.max(min, v - 1))} disabled={v <= min} aria-label="minus">
        <Minus className="size-4" />
      </button>
      <input
        value={v === 0 ? '' : v}
        placeholder="0"
        inputMode="numeric"
        autoComplete="off"
        onChange={(e) => {
          const s = e.target.value.replace(/[^0-9]/g, '').slice(0, 5);
          onChange(Math.min(max, Number(s) || 0));
        }}
        onFocus={(e) => e.target.select()}
        className="w-12 h-10 text-center num font-bold text-[16px] rounded-[var(--radius-xs)] border border-field outline-none focus:border-primary"
      />
      <button type="button" className={btn} onClick={() => onChange(Math.min(max, v + 1))} disabled={v >= max} aria-label="plus">
        <Plus className="size-4" />
      </button>
    </div>
  );
}

export function MethodPicker({ value, onChange }) {
  return (
    <Field label={t('payment_method')}>
      <Chips size="sm" className="!grid grid-cols-3" value={value} onChange={onChange} options={PAYMENT_METHODS.map((m) => ({ value: m, label: methodLabel(m) }))} />
    </Field>
  );
}

export function DateInput({ label, value, onChange, className, max }) {
  const id = useId();
  return (
    <Field label={label} className={className} htmlFor={id}>
      <input id={id} type="date" value={value || ''} max={max} onChange={(e) => onChange(e.target.value)} className="ctl" />
    </Field>
  );
}

/**
 * Styled dropdown (button + list). Always takes the same space; `disabled`
 * greys it out instead of hiding it, so the form never jumps.
 * options: [{ value, label, sub?, icon? }]
 */
export function Dropdown({ label, value, onChange, options, disabled, className }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const id = useId();
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => !ref.current?.contains(e.target) && setOpen(false);
    const esc = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);
  const cur = options.find((o) => o.value === value) ?? options[0];
  const Icon = cur?.icon;
  return (
    <Field label={label} className={className} htmlFor={id}>
      <div ref={ref} className="relative">
        <button
          id={id}
          type="button"
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className={cn('ctl flex items-center gap-2 text-left', open && 'border-primary ring-2 ring-primary/15', disabled && 'opacity-60')}
        >
          {Icon && <Icon className="size-4 text-muted shrink-0" />}
          <span className="flex-1 truncate font-medium">{cur?.label}</span>
          <ChevronDown className={cn('size-4 text-muted shrink-0 transition', open && 'rotate-180')} />
        </button>
        {open && (
          <ul role="listbox" className="absolute z-30 left-0 w-[max(100%,236px)] mt-1.5 card p-1 shadow-[var(--shadow-pop)] animate-pop max-h-64 overflow-y-auto">
            {options.map((o) => {
              const on = o.value === value;
              const OIcon = o.icon;
              return (
                <li key={o.value}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={on}
                    onClick={() => {
                      onChange(o.value);
                      setOpen(false);
                    }}
                    className={cn('w-full flex items-center gap-2.5 px-2.5 py-2 rounded-[var(--radius-xs)] text-left text-[13.5px]', on ? 'bg-soft text-primary font-semibold' : 'hover:bg-bg')}
                  >
                    {OIcon && <OIcon className="size-4 shrink-0 text-muted" />}
                    <span className="flex-1 min-w-0">
                      <span className="block truncate">{o.label}</span>
                      {o.sub && <span className="block text-[11.5px] text-muted font-normal truncate">{o.sub}</span>}
                    </span>
                    {on && <Check className="size-4 shrink-0" />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Field>
  );
}

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, CheckCircle2, AlertTriangle, Info, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button, Field, Textarea } from './core';
import { useScrollLock } from '@/lib/scroll-lock';

function useEscape(open, onClose) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
}


/** Centered dialog. `footer` renders in a sticky bar. */
export function Modal({ open, onClose, title, subtitle, children, footer, size = 'md', icon: Icon }) {
  useEscape(open, onClose);
  useScrollLock(open);
  if (!open) return null;
  const width = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' }[size];
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-slate-950/40 animate-in" onClick={onClose} />
      <div role="dialog" aria-modal="true" data-overlay className={cn('relative w-full card shadow-[var(--shadow-pop)] animate-pop flex flex-col max-h-[92vh] rounded-b-none sm:rounded-b-[var(--radius-card)]', width)}>
        <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3 border-b border-line">
          <div className="flex items-center gap-3 min-w-0">
            {Icon && (
              <div className="grid place-items-center size-9 rounded-xl bg-brand-50 text-link dark:bg-brand-500/10 dark:text-brand-300">
                <Icon className="size-[18px]" />
              </div>
            )}
            <div className="min-w-0">
              <h2 className="text-[15px] font-semibold truncate">{title}</h2>
              {subtitle && <p className="text-xs text-muted truncate">{subtitle}</p>}
            </div>
          </div>
          <Button variant="ghost" size="sm" icon={X} onClick={onClose} aria-label="Close" />
        </div>
        <div className="px-5 py-4 overflow-y-auto">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-line bg-surface-2 rounded-b-[var(--radius-card)]">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/** Slide-over panel from the right, used for quick views and the assistant. */
export function Drawer({ open, onClose, title, subtitle, children, footer, width = 'max-w-lg', actions }) {
  useEscape(open, onClose);
  useScrollLock(open);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-slate-950/30 animate-in" onClick={onClose} />
      <aside role="dialog" aria-modal="true" data-overlay className={cn('absolute right-0 top-0 h-full w-full bg-surface border-l border-line shadow-[var(--shadow-pop)] flex flex-col animate-slide', width)}>
        <div className="flex items-center justify-between gap-3 px-5 h-14 border-b border-line shrink-0">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold truncate">{title}</h2>
            {subtitle && <p className="text-xs text-muted truncate">{subtitle}</p>}
          </div>
          <div className="flex items-center gap-1">
            {actions}
            <Button variant="ghost" size="sm" icon={X} onClick={onClose} aria-label="Close" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
        {footer && <div className="px-5 py-3 border-t border-line bg-surface-2">{footer}</div>}
      </aside>
    </div>,
    document.body,
  );
}

/**
 * Confirmation. With `reason`, the user must type why, every cancel, void and
 * reversal in ChipsTrader is recorded with its reason.
 */
export function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmLabel = 'Confirm', danger, reason, loading }) {
  const [text, setText] = useState('');
  useEffect(() => {
    if (open) setText('');
  }, [open]);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      icon={danger ? AlertTriangle : undefined}
      footer={
        <>
          <Button onClick={onClose}>Back</Button>
          <Button variant={danger ? 'danger' : 'primary'} loading={loading} disabled={reason && text.trim().length < 3} onClick={() => onConfirm(text.trim())}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {message && <p className="text-sm text-muted">{message}</p>}
      {reason && (
        <Field label="Reason" required className="mt-3" hint="Saved in the document history.">
          {(id) => <Textarea id={id} autoFocus value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={500} />}
        </Field>
      )}
    </Modal>
  );
}

/** Small anchored menu. */
/**
 * Position a floating panel (menu, dropdown) against its anchor with fixed
 * coordinates, rendered in a portal. Nothing can clip it: not a table's scroll
 * box, not a dialog body. It opens below, flips above when there is more room
 * there, stays inside the viewport and follows scrolling and resizing.
 */
export function useAnchored(anchorRef, open, { align = 'left', matchWidth = false, gap = 6 } = {}) {
  const panelRef = useRef(null);
  const [style, setStyle] = useState(null);
  useLayoutEffect(() => {
    if (!open) {
      setStyle(null);
      return;
    }
    const place = () => {
      const a = anchorRef.current?.getBoundingClientRect();
      const p = panelRef.current;
      if (!a || !p) return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const width = matchWidth ? Math.max(a.width, p.offsetWidth) : p.offsetWidth;
      const below = vh - a.bottom - gap - 8;
      const above = a.top - gap - 8;
      const up = p.scrollHeight > below && above > below;
      let left = align === 'right' ? a.right - width : a.left;
      left = Math.max(8, Math.min(left, vw - width - 8));
      setStyle({
        position: 'fixed',
        left,
        top: up ? undefined : a.bottom + gap,
        bottom: up ? vh - a.top + gap : undefined,
        minWidth: matchWidth ? a.width : undefined,
        maxHeight: Math.max(140, up ? above : below),
        zIndex: 60,
      });
    };
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open, align, matchWidth, gap, anchorRef]);
  // First frame: measured off-screen, then placed.
  return { panelRef, style: style ?? { position: 'fixed', top: 0, left: 0, visibility: 'hidden', zIndex: 60 } };
}

export function Menu({ trigger, items, align = 'right' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const { panelRef, style } = useAnchored(ref, open, { align });
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => !ref.current?.contains(e.target) && !panelRef.current?.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open, panelRef]);
  useEscape(open, () => setOpen(false));
  return (
    <div ref={ref} className="relative inline-block">
      <span onClick={() => setOpen((o) => !o)}>{trigger}</span>
      {open && createPortal(
        <div ref={panelRef} style={style} role="menu" data-overlay className="min-w-48 overflow-y-auto card shadow-[var(--shadow-pop)] p-1 animate-pop">
          {items.filter(Boolean).map((it, i) =>
            it === '-' ? (
              <div key={i} className="my-1 h-px bg-line" />
            ) : it.header ? (
              <div key={i} className="px-2.5 py-1.5 text-[12px] text-muted truncate">{it.label}</div>
            ) : (
              <button
                key={i}
                disabled={it.disabled}
                onClick={() => {
                  setOpen(false);
                  it.onClick?.();
                }}
                className={cn(
                  'w-full flex items-center gap-2.5 px-2.5 h-8 rounded-md text-[13px] text-left hover:bg-surface-3 disabled:text-muted disabled:cursor-default disabled:hover:bg-transparent',
                  it.danger && 'text-danger',
                )}
              >
                {it.icon && <it.icon className="size-4 text-faint" />}
                <span className="flex-1">{it.label}</span>
                {it.hint && <span className="text-[11px] text-faint">{it.hint}</span>}
              </button>
            ),
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}

// ─────────────────────────── toasts ───────────────────────────

const ToastCtx = createContext(null);
const ICONS = { success: CheckCircle2, error: XCircle, info: Info, warning: AlertTriangle };
const COLORS = { success: 'text-success', error: 'text-danger', info: 'text-link', warning: 'text-warning' };

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((kind, message, opts = {}) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t.slice(-3), { id, kind, message, ...opts }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), opts.duration ?? (kind === 'error' ? 6000 : 3500));
  }, []);
  const api = useRef(null);
  api.current ??= {};
  Object.assign(api.current, {
    success: (m, o) => push('success', m, o),
    error: (m, o) => push('error', m, o),
    info: (m, o) => push('info', m, o),
    warning: (m, o) => push('warning', m, o),
  });
  return (
    <ToastCtx.Provider value={api.current}>
      {children}
      {createPortal(
        <div className="fixed z-[60] bottom-4 right-4 left-4 sm:left-auto flex flex-col gap-2 items-end pointer-events-none">
          {toasts.map((t) => {
            const Icon = ICONS[t.kind];
            return (
              <div key={t.id} className="pointer-events-auto card shadow-[var(--shadow-pop)] px-3.5 py-3 flex items-start gap-2.5 max-w-sm w-full sm:w-auto animate-pop">
                <Icon className={cn('size-[18px] mt-px shrink-0', COLORS[t.kind])} />
                <div className="text-[13px] leading-snug">
                  <p>{t.message}</p>
                  {t.action && (
                    <button onClick={t.action.onClick} className="mt-1 font-medium text-link hover:underline">
                      {t.action.label}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>,
        document.body,
      )}
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

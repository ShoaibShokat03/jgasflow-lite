import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, Info, Trash2, X, XCircle } from 'lucide-react';
import { t } from '@/lib/i18n';
import { Button, cn, IconBox } from './kit';

function useEscape(open, onClose) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    // The page keeps its scrollbar (no layout jump); the backdrop is fixed.
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
}

/** Dialog: centered on desktop, bottom sheet on phones (16px top corners like the app). */
export function Modal({ open, onClose, title, sub, icon, iconColor, children, footer, size = 'md', className }) {
  useEscape(open, onClose);
  if (!open) return null;
  const width = { sm: 'sm:max-w-md', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl', xl: 'sm:max-w-4xl' }[size];
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 overscroll-contain">
      <div className="absolute inset-0 bg-primary-dark/45 animate-in" onClick={onClose} />
      <div role="dialog" aria-modal="true" className={cn('relative w-full bg-white shadow-[var(--shadow-pop)] flex flex-col max-h-[92vh] rounded-t-2xl sm:rounded-2xl animate-up sm:animate-pop', width, className)}>
        <div className="flex items-center gap-3 px-5 pt-4 pb-3">
          {icon && <IconBox icon={icon} color={iconColor || '#020033'} size={36} />}
          <div className="min-w-0 flex-1">
            <h2 className="text-[16px] font-bold truncate">{title}</h2>
            {sub && <p className="text-[12.5px] text-muted truncate">{sub}</p>}
          </div>
          <Button variant="ghost" icon={X} onClick={onClose} aria-label={t('close')} title={t('close')} className="-mr-2" />
        </div>
        <div className="px-5 pb-4 overflow-y-auto overflow-x-hidden overscroll-contain">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 px-5 py-3 bg-bg/70 rounded-b-2xl safe-bottom">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

// ───────── confirm

const ConfirmCtx = createContext(null);

export function ConfirmProvider({ children }) {
  const [req, setReq] = useState(null);
  const resolver = useRef(null);
  const confirm = useCallback(
    (opts) =>
      new Promise((resolve) => {
        resolver.current = resolve;
        setReq(opts);
      }),
    [],
  );
  const close = (v) => {
    resolver.current?.(v);
    setReq(null);
  };
  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      <Modal
        open={!!req}
        onClose={() => close(false)}
        size="sm"
        title={req?.title}
        icon={req?.danger ? AlertTriangle : req?.icon || Info}
        iconColor={req?.danger ? '#C62828' : '#020033'}
        footer={
          <>
            <Button variant="outline" onClick={() => close(false)}>
              {req?.cancelLabel || t('cancel')}
            </Button>
            <Button variant={req?.danger ? 'danger' : 'primary'} icon={req?.okIcon || (req?.danger ? Trash2 : undefined)} onClick={() => close(true)} autoFocus>
              {req?.okLabel || t('ok')}
            </Button>
          </>
        }
      >
        <div className="text-[14px] text-ink/85 whitespace-pre-line">{req?.message}</div>
      </Modal>
    </ConfirmCtx.Provider>
  );
}

/** await confirm({ title, message, okLabel, danger }) -> boolean */
export const useConfirm = () => useContext(ConfirmCtx);

// ───────── toast

let push = null;
/** toast('Saved') or toast(error.message, 'error') */
export const toast = (msg, tone = 'success') => push?.({ msg, tone, id: Math.random() });

export function Toaster() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    push = (it) => {
      setItems((s) => [...s.slice(-2), it]);
      setTimeout(() => setItems((s) => s.filter((x) => x.id !== it.id)), it.tone === 'error' ? 5000 : 2800);
    };
    return () => {
      push = null;
    };
  }, []);
  return createPortal(
    <div className="fixed z-[60] bottom-20 lg:bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 w-[calc(100%-32px)] max-w-md pointer-events-none no-print">
      {items.map((it) => {
        const Icon = it.tone === 'error' ? XCircle : it.tone === 'info' ? Info : CheckCircle2;
        return (
          <div key={it.id} className="pointer-events-auto flex items-center gap-2.5 w-full rounded-xl bg-primary-dark text-white px-4 py-3 shadow-[var(--shadow-pop)] animate-up">
            <Icon className={cn('size-5 shrink-0', it.tone === 'error' ? 'text-[#ff8a80]' : it.tone === 'info' ? 'text-white/80' : 'text-[#5BE49B]')} />
            <span className="text-[13.5px] font-medium">{it.msg}</span>
          </div>
        );
      })}
    </div>,
    document.body,
  );
}

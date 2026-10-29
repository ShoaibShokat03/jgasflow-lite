import { useEffect, useState, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import { Keyboard, RotateCcw } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { t } from '@/lib/i18n';
import { RESERVED, SHORTCUTS, comboOf, isChanged, keyOf, resetKeys, setKey, useShortcutKeys, worksWhileTyping } from '@/lib/shortcuts';
import { Button, cn } from './kit';
import { Modal, toast } from './overlay';

// The list window can be opened from anywhere (Settings, the top bar, the "?" key).
let helpOpen = false;
const helpSubs = new Set();
const setHelp = (v) => {
  helpOpen = v;
  helpSubs.forEach((f) => f());
};
export const openShortcuts = () => setHelp(true);
// While a key is being changed, shortcuts do nothing.
let capturing = false;

/** A key shown as keycaps: Ctrl + S. */
export function Kbd({ combo, className }) {
  if (!combo) return <span className={cn('text-[12px] text-muted font-semibold whitespace-nowrap', className)}>{t('sc_off')}</span>;
  return (
    <span className={cn('inline-flex items-center gap-1 whitespace-nowrap', className)}>
      {combo.split('+').map((k, i) => (
        <kbd key={i} className="inline-grid place-items-center min-w-7 h-7 px-1.5 rounded-[6px] border border-line bg-[#f7f8fb] text-[12px] font-bold text-ink shadow-[0_1px_0_#d9dce6]">
          {k}
        </kbd>
      ))}
    </span>
  );
}

const visible = (el) => !!el && el.offsetParent !== null && !el.disabled && el.getAttribute('aria-disabled') !== 'true';

/** The marked control on screen; one inside an open popup wins. */
function target(id) {
  const all = [...document.querySelectorAll(`[data-shortcut="${id}"]`)].filter(visible);
  const inPopup = all.filter((el) => el.closest('[role="dialog"]'));
  return (inPopup.length ? inPopup : all).at(-1) || null;
}

/** Listens for the keys on every shop page. */
export function useGlobalShortcuts() {
  const navigate = useNavigate();
  const auth = useAuth();
  useShortcutKeys();
  useEffect(() => {
    const onKey = (e) => {
      if (capturing || e.repeat || e.isComposing) return;
      const combo = comboOf(e);
      if (!combo) return;
      const a = SHORTCUTS.find((s) => keyOf(s.id) === combo);
      if (!a) return;
      const el = e.target;
      const typing = el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
      if (typing && !worksWhileTyping(combo)) return;
      if (a.to) {
        if (a.mgr && !auth.isManager) return;
        e.preventDefault();
        if (helpOpen) setHelp(false);
        navigate(a.to);
        return;
      }
      if (a.act === 'help') {
        e.preventDefault();
        setHelp(!helpOpen);
        return;
      }
      const x = target(a.id);
      if (!x) {
        // Ctrl+P with nothing to print here: let the browser print the page.
        if (a.id === 'print') return;
        e.preventDefault();
        toast(t('sc_nothing_here'), 'info');
        return;
      }
      e.preventDefault();
      if (a.act === 'focus') {
        const box = x.matches('input,textarea') ? x : x.querySelector('input,textarea');
        box?.focus();
        box?.select?.();
      } else {
        // Leave a box first so its last typed value is saved.
        if (typing && a.id === 'save') el.blur();
        x.click();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate, auth.isManager]);
}

/** "Keyboard shortcuts": every key, grouped, each one can be changed. */
export function ShortcutsDialog() {
  const open = useSyncExternalStore(
    (f) => (helpSubs.add(f), () => helpSubs.delete(f)),
    () => helpOpen,
  );
  const auth = useAuth();
  useShortcutKeys();
  const [editing, setEditing] = useState(null);

  useEffect(() => {
    capturing = !!editing;
    if (!editing) return;
    const onKey = (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.key === 'Escape') return setEditing(null);
      if (e.key === 'Backspace' || e.key === 'Delete') {
        setKey(editing, '');
        return setEditing(null);
      }
      const combo = comboOf(e);
      if (!combo) return;
      if (RESERVED.includes(combo)) return toast(t('sc_reserved', { key: combo }), 'error');
      const other = setKey(editing, combo);
      if (other) toast(t('sc_moved', { key: combo, name: t(`sc_${other}`) }), 'info');
      setEditing(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      capturing = false;
    };
  }, [editing]);

  const close = () => {
    if (editing) return setEditing(null);
    setHelp(false);
  };
  const list = SHORTCUTS.filter((s) => !s.mgr || auth.isManager);
  const group = (g) => list.filter((s) => s.group === g);

  return (
    <Modal
      open={open}
      onClose={close}
      title={t('sc_title')}
      sub={t('sc_sub')}
      icon={Keyboard}
      size="lg"
      footer={
        <>
          <Button variant="outline" icon={RotateCcw} onClick={() => (resetKeys(), toast(t('sc_reset_done')))}>
            {t('sc_reset')}
          </Button>
          <Button onClick={() => setHelp(false)}>{t('close')}</Button>
        </>
      }
    >
      <div className="grid gap-4">
        {['go', 'page'].map((g) => (
          <div key={g}>
            <div className="text-[12px] font-bold text-muted uppercase tracking-wide mb-1.5">{t(`sc_group_${g}`)}</div>
            <div className="rounded-[var(--radius-card)] border border-line divide-y divide-line">
              {group(g).map((s) => (
                <div key={s.id} className={cn('flex items-center gap-3 px-3 min-h-[52px] py-2', editing === s.id && 'bg-[#fff4ec]')}>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13.5px] font-semibold truncate">{t(`sc_${s.id}`)}</div>
                    <div className="text-[11.5px] text-muted truncate">{editing === s.id ? t('sc_press') : t(`sc_${s.id}_sub`)}</div>
                  </div>
                  {editing === s.id ? (
                    <span className="text-[12px] font-bold text-accent whitespace-nowrap animate-pulse">{t('sc_waiting')}</span>
                  ) : (
                    <Kbd combo={keyOf(s.id)} />
                  )}
                  <Button size="sm" variant={editing === s.id ? 'accent' : 'outline'} className="w-[84px]" onClick={() => setEditing(editing === s.id ? null : s.id)}>
                    {editing === s.id ? t('cancel') : t('sc_change')}
                  </Button>
                  <span className={cn('size-2 rounded-full shrink-0', isChanged(s.id) ? 'bg-accent' : 'bg-transparent')} title={isChanged(s.id) ? t('sc_changed') : undefined} />
                </div>
              ))}
            </div>
          </div>
        ))}
        <p className="text-[12px] text-muted leading-snug">{t('sc_footer')}</p>
      </div>
    </Modal>
  );
}

/** Small top-bar button that opens the list. */
export function ShortcutsButton({ className }) {
  return <Button variant="ghost" icon={Keyboard} className={className} aria-label={t('sc_title')} title={`${t('sc_title')} (${keyOf('help') || t('sc_off')})`} onClick={openShortcuts} />;
}

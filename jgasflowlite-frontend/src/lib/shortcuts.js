import { useSyncExternalStore } from 'react';

/**
 * Keyboard shortcuts. Each action has a default key; a user can change any of
 * them in "Keyboard shortcuts" (saved in this browser only).
 *
 *   go     opens a page
 *   click  presses the button marked data-shortcut="<id>" on the screen (the
 *          one in an open popup first)
 *   focus  puts the cursor in the field marked data-shortcut="<id>"
 */
export const SHORTCUTS = [
  { id: 'new_sale', group: 'go', key: 'Alt+N', to: '/app/sales/new' },
  { id: 'go_home', group: 'go', key: 'Alt+H', to: '/app' },
  { id: 'go_sales', group: 'go', key: 'Alt+S', to: '/app/sales' },
  { id: 'go_customers', group: 'go', key: 'Alt+C', to: '/app/customers' },
  { id: 'go_udhaar', group: 'go', key: 'Alt+U', to: '/app/udhaar' },
  { id: 'go_stock', group: 'go', key: 'Alt+K', to: '/app/stock', mgr: true },
  { id: 'new_purchase', group: 'go', key: 'Alt+B', to: '/app/purchases/new', mgr: true },
  { id: 'go_purchases', group: 'go', key: 'Alt+P', to: '/app/purchases', mgr: true },
  { id: 'go_reports', group: 'go', key: 'Alt+R', to: '/app/reports', mgr: true },
  { id: 'go_accounts', group: 'go', key: 'Alt+A', to: '/app/accounts', mgr: true },
  { id: 'go_settings', group: 'go', key: 'Alt+G', to: '/app/settings' },
  { id: 'save', group: 'page', key: 'Ctrl+S', act: 'click' },
  { id: 'print', group: 'page', key: 'Ctrl+P', act: 'click' },
  { id: 'export', group: 'page', key: 'Ctrl+E', act: 'click' },
  { id: 'add', group: 'page', key: 'Alt+I', act: 'click' },
  { id: 'search', group: 'page', key: '/', act: 'focus' },
  { id: 'help', group: 'page', key: '?', act: 'help' },
];

const KEY = 'jgf-shortcuts';
const MODS = ['Control', 'Alt', 'Shift', 'Meta', 'AltGraph', 'CapsLock'];

let custom = (() => {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}') || {};
  } catch {
    return {};
  }
})();
const subs = new Set();
let version = 0;

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(custom));
  } catch {
    /* kept for this visit only */
  }
  version++;
  subs.forEach((f) => f());
}

/** Key of an action now ('' = turned off). */
export const keyOf = (id) => (id in custom ? custom[id] : SHORTCUTS.find((s) => s.id === id)?.key || '');

/** Sets a key. Another action with the same key is turned off; returns its id. */
export function setKey(id, combo) {
  const other = combo ? SHORTCUTS.find((s) => s.id !== id && keyOf(s.id) === combo) : null;
  if (other) custom[other.id] = '';
  const def = SHORTCUTS.find((s) => s.id === id)?.key;
  if (combo === def) delete custom[id];
  else custom[id] = combo;
  save();
  return other?.id || null;
}

export function resetKeys() {
  custom = {};
  save();
}

export const isChanged = (id) => id in custom;

export function useShortcutKeys() {
  return useSyncExternalStore(
    (f) => (subs.add(f), () => subs.delete(f)),
    () => version,
  );
}

/**
 * The key pressed as text: "Ctrl+S", "Alt+N", "F2", "/", "?".
 * Letters and digits use the physical key (works with Alt on every keyboard);
 * Shift is only written for letters, digits and named keys ("?" already means Shift+/).
 */
export function comboOf(e) {
  if (MODS.includes(e.key)) return null;
  let k;
  if (/^Key[A-Z]$/.test(e.code)) k = e.code.slice(3);
  else if (/^Digit[0-9]$/.test(e.code)) k = e.code.slice(5);
  else if (e.code === 'Slash' && e.shiftKey) k = '?';
  else if (e.key === ' ') k = 'Space';
  else if (e.key.length === 1) k = e.key.toUpperCase();
  else k = e.key;
  const named = k.length > 1 || /^[A-Z0-9]$/.test(k);
  const parts = [];
  if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey && named) parts.push('Shift');
  parts.push(k);
  return parts.join('+');
}

/** Plain keys (no Ctrl / Alt, not F1 to F12) are not used while typing in a box. */
export const worksWhileTyping = (combo) => /(^|\+)(Ctrl|Alt)\+/.test(combo) || /^(Shift\+)?F([1-9]|1[0-2])$/.test(combo);

/** Keys the browser or Windows keep for themselves: refused when changing a key. */
export const RESERVED = ['Ctrl+W', 'Ctrl+T', 'Ctrl+N', 'Ctrl+Shift+N', 'Ctrl+Shift+T', 'Ctrl+Tab', 'Alt+F4', 'Alt+Tab', 'Alt+F', 'Alt+D', 'Alt+E', 'F5', 'Ctrl+R', 'Ctrl+L', 'F11', 'F12', 'Tab', 'Shift+Tab', 'Enter', 'Escape', 'Backspace', 'Delete'];

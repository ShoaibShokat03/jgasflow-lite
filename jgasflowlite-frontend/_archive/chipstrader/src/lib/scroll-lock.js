import { useEffect } from 'react';

/**
 * Background scroll lock for modals, drawers and the command palette.
 *
 * The usual trick (overflow: hidden on <body>) removes the scrollbar, so the
 * page widens and everything shifts sideways when a dialog opens. Instead the
 * scrollbar stays exactly where it is and we only stop the page from MOVING:
 * wheel, touch and keyboard scrolling are cancelled unless they happen inside
 * an open overlay (any element marked `data-overlay`) that can still scroll in
 * that direction. Overlays nest; the lock releases when the last one closes.
 */
let locks = 0;
let touchY = 0;

const SCROLL_KEYS = { ArrowUp: -1, ArrowDown: 1, PageUp: -1, PageDown: 1, Home: -1, End: 1, ' ': 1 };

/** Can something between `el` and its overlay scroll further in direction `dy`? */
function canScroll(el, dy) {
  const overlay = el instanceof Element ? el.closest('[data-overlay]') : null;
  if (!overlay) return false;
  for (let n = el; n; n = n.parentElement) {
    const { overflowY } = getComputedStyle(n);
    if ((overflowY === 'auto' || overflowY === 'scroll') && n.scrollHeight > n.clientHeight + 1) {
      if (dy < 0 && n.scrollTop > 0) return true;
      if (dy > 0 && n.scrollTop + n.clientHeight < n.scrollHeight - 1) return true;
    }
    if (n === overlay) break;
  }
  return false;
}

const isEditable = (el) => el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

function onWheel(e) {
  if (e.ctrlKey) return; // pinch-zoom on trackpads
  if (!canScroll(e.target, e.deltaY)) e.preventDefault();
}

function onTouchStart(e) {
  touchY = e.touches[0]?.clientY ?? 0;
}

function onTouchMove(e) {
  const y = e.touches[0]?.clientY ?? 0;
  if (!canScroll(e.target, touchY - y)) e.preventDefault();
}

function onKeyDown(e) {
  const dir = SCROLL_KEYS[e.key];
  if (dir === undefined || e.defaultPrevented) return;
  const el = document.activeElement;
  if (isEditable(el)) return; // the arrow keys move the caret, not the page
  if (!canScroll(el ?? document.body, e.shiftKey && e.key === ' ' ? -1 : dir)) e.preventDefault();
}

export function lockScroll() {
  if (locks++ === 0) {
    document.addEventListener('wheel', onWheel, { passive: false });
    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('keydown', onKeyDown);
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--locks === 0) {
      document.removeEventListener('wheel', onWheel);
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('keydown', onKeyDown);
    }
  };
}

/** Lock the page behind an overlay while `active` is true. */
export function useScrollLock(active) {
  useEffect(() => (active ? lockScroll() : undefined), [active]);
}

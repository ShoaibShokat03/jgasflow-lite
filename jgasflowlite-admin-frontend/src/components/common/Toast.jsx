// src/components/common/Toast.jsx
//
// App-wide notification provider. **API-compatible** with the old corner-
// toast implementation  the `useToast` hook still exposes
// `success / error / warning / info / dismiss`, and accepts either a string
// or `{ title, description, durationMs }`. What changed is the UI:
// notifications now render as a centered <AlertModal> popup (success / error
// / warning / info themes) instead of a slide-in toast.
//
// We keep the file + exports named `Toast.jsx` / `ToastProvider` / `useToast`
// so the 7+ existing callers don't need to be touched. Mentally treat this
// as the "notifications" provider; the toast filename is historical.
//
// Usage (unchanged):
//   1. Wrap the app in <ToastProvider> (done in main.jsx).
//   2. From any component:
//        const toast = useToast();
//        toast.success('Saved');
//        toast.error('Network failed');
//        toast.warning({ title: 'Not verified', description: 'check email' });
//        toast.info('Background job started');
//
// Behaviour:
//   - Multiple rapid calls QUEUE  the next alert pops automatically after
//     the previous one closes / auto-dismisses. Nothing is dropped.
//   - Auto-dismiss durations mirror the old toast defaults so the timing
//     feels familiar (success/info 3.5s, warning 5s, error 6s). Pass
//     `durationMs: 0` to keep an alert open until the user clicks X.

import React, {
  createContext, useCallback, useContext, useMemo, useState,
} from 'react';
import AlertModal from './AlertModal';

const ToastCtx = createContext(null);

// Default auto-dismiss windows per variant, matching the old toast UX.
const DEFAULT_DURATION_MS = {
  success: 3500,
  info:    3500,
  warning: 5000,
  error:   6000,
};

let alertId = 0;
const nextId = () => ++alertId;

export const ToastProvider = ({ children }) => {
  // FIFO queue of pending alerts. We show queue[0]; new alerts append; on
  // close / auto-dismiss we shift the head off. This way rapid-fire calls
  // (e.g. two `toast.warning()` from a validation pass) are all shown
  // sequentially rather than overwriting each other.
  const [queue, setQueue] = useState([]);

  const dismissCurrent = useCallback(() => {
    setQueue((q) => q.slice(1));
  }, []);

  const push = useCallback((variant, input) => {
    const data = typeof input === 'string' ? { title: input } : (input || {});
    const id = nextId();
    const entry = {
      id,
      variant,
      title: data.title || '',
      description: data.description || '',
      durationMs: data.durationMs ?? DEFAULT_DURATION_MS[variant] ?? 3500,
    };
    setQueue((q) => [...q, entry]);
    return id;
  }, []);

  const api = useMemo(() => ({
    success: (i) => push('success', i),
    error:   (i) => push('error', i),
    warning: (i) => push('warning', i),
    info:    (i) => push('info', i),
    dismiss: dismissCurrent,
  }), [push, dismissCurrent]);

  const current = queue[0] || null;

  return (
    <ToastCtx.Provider value={api}>
      {children}
      {/* One global <AlertModal> at the provider level. Keying by `id`
          forces a remount per alert so the internal auto-dismiss timer
          resets cleanly between consecutive notifications  otherwise two
          back-to-back alerts with the same `durationMs` would share a
          stale timer and dismiss too early. */}
      <AlertModal
        key={current?.id || 'empty'}
        isOpen={!!current}
        onClose={dismissCurrent}
        type={current?.variant || 'success'}
        title={current?.title || ''}
        message={current?.description || ''}
        duration={current?.durationMs ?? 0}
      />
    </ToastCtx.Provider>
  );
};

export const useToast = () => {
  const ctx = useContext(ToastCtx);
  if (!ctx) {
    // Don't crash callers if the provider isn't mounted; just no-op. Keeps
    // unit tests painless and matches the old behaviour.
    return {
      success: () => 0, error: () => 0, warning: () => 0, info: () => 0,
      dismiss: () => {},
    };
  }
  return ctx;
};

export default ToastProvider;

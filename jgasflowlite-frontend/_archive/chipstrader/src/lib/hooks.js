import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { get } from './api';
import { session } from './session';

/** Signed-in user + permission check. Cached; refreshed every 5 minutes. */
export function useMe() {
  const q = useQuery({
    queryKey: ['me'],
    queryFn: () => get('/auth/me'),
    enabled: session.isSignedIn(),
    staleTime: 5 * 60_000,
    initialData: session.user() ?? undefined,
  });
  const me = q.data;
  const can = useCallback(
    (...perms) => {
      const set = me?.permissions;
      if (!set) return false;
      if (set.includes('*')) return true;
      return perms.some((p) => set.includes(p));
    },
    [me],
  );
  return { me, can, isLoading: q.isLoading };
}

/**
 * Every lookup list in one request, kept for the whole session. `name(key, id)`
 * resolves an id to its label without another round trip.
 */
export function useMaster() {
  const q = useQuery({ queryKey: ['master-bundle'], queryFn: () => get('/master/bundle'), staleTime: 30 * 60_000, gcTime: Infinity });
  const data = q.data;
  const index = useMemo(() => {
    const out = {};
    if (data) for (const [k, rows] of Object.entries(data)) out[k] = new Map(rows.map((r) => [r.id, r]));
    return out;
  }, [data]);
  const get1 = useCallback((key, id) => (id ? index[key]?.get(Number(id)) : undefined), [index]);
  const name = useCallback(
    (key, id) => {
      const r = get1(key, id);
      if (!r) return '';
      return key === 'currencies' || key === 'incoterms' ? r.code : r.name;
    },
    [get1],
  );
  return { master: data, ready: !!data, get: get1, name };
}

export function useProfile() {
  return useQuery({ queryKey: ['company-profile'], queryFn: () => get('/company-profile'), staleTime: 10 * 60_000 });
}

export function useUsers() {
  return useQuery({ queryKey: ['user-options'], queryFn: () => get('/admin/users/options'), staleTime: 10 * 60_000 });
}

export function useDebounced(value, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/**
 * Browser full screen for the whole app. `active` follows the real state, so it
 * stays right when the user leaves with Esc or F11 instead of the button.
 */
export function useFullscreen() {
  const supported = typeof document !== 'undefined' && !!document.fullscreenEnabled;
  const [active, setActive] = useState(() => !!document.fullscreenElement);
  useEffect(() => {
    const sync = () => setActive(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);
  const toggle = useCallback(async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    } catch {
      /* refused by the browser, e.g. not triggered by a click */
    }
  }, []);
  return { supported, active, toggle };
}

export function useTheme() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  const toggle = useCallback(() => {
    setDark((d) => {
      const next = !d;
      document.documentElement.classList.toggle('dark', next);
      try {
        localStorage.setItem('ct-theme', next ? 'dark' : 'light');
      } catch {
        /* storage unavailable */
      }
      return next;
    });
  }, []);
  return { dark, toggle };
}

/** Global shortcut: useHotkey('mod+k', fn). `mod` = Ctrl on Windows, ⌘ on Mac. */
export function useHotkey(combo, handler, enabled = true) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!enabled) return;
    const [mod, key] = combo.includes('+') ? combo.split('+') : [null, combo];
    const onKey = (e) => {
      if (mod === 'mod' && !(e.ctrlKey || e.metaKey)) return;
      if (!mod && (e.ctrlKey || e.metaKey || e.altKey)) return;
      if (!mod && ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
      if (e.key.toLowerCase() === key) {
        e.preventDefault();
        ref.current(e);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [combo, enabled]);
}

/** URL-synced list state (page, search, filters) so back/forward and links work. */
export function useListParams(searchParams, setSearchParams, defaults = {}) {
  const params = useMemo(() => ({ ...defaults, ...Object.fromEntries(searchParams.entries()) }), [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = useCallback(
    (patch) => {
      const next = { ...params, ...patch };
      if (!('page' in patch)) next.page = '1';
      setSearchParams(Object.fromEntries(Object.entries(next).filter(([, v]) => v !== '' && v !== undefined && v !== null)), { replace: true });
    },
    [params, setSearchParams],
  );
  return [params, set];
}

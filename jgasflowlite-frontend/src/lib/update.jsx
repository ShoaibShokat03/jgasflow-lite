import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { t } from '@/lib/i18n';

/**
 * Keeps every open tab on the newest version, so nobody has to clear the cache.
 *
 * Each build writes /version.json with its id. The app checks it on start, every
 * few minutes and when the tab comes back into view. When a new version is out:
 *   - it reloads by itself on the next page change, or when the tab was away
 *     (nothing typed is lost there);
 *   - on a page with a form open it shows a bar with "Update now" instead.
 * A file of the old version that is gone after a deploy also reloads the page.
 */
const BUILD = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev';
const EVERY = 5 * 60 * 1000;
const RELOAD_KEY = 'jgf-reloaded-for';

let newVersion = null;

async function latest() {
  try {
    const r = await fetch(`${import.meta.env.BASE_URL}version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) return null;
    const j = await r.json();
    return typeof j.v === 'string' ? j.v : null;
  } catch {
    return null;
  }
}

/** Reload once per new version (never loops if the server is slow to update). */
function reloadFor(v) {
  try {
    if (sessionStorage.getItem(RELOAD_KEY) === v) return false;
    sessionStorage.setItem(RELOAD_KEY, v);
  } catch {
    /* reload anyway */
  }
  window.location.reload();
  return true;
}

// Pages where something may be half typed: never reload by itself there.
const EDITING = ['/app/sales/new', '/app/purchases/new'];
const formOpen = () => !!document.querySelector('[role="dialog"]');
const editing = (path) => EDITING.some((p) => path.startsWith(p)) || formOpen();

export function UpdateWatcher() {
  const loc = useLocation();
  const [ready, setReady] = useState(false);
  const first = useRef(true);

  useEffect(() => {
    if (BUILD === 'dev') return;
    let stop = false;
    const check = async () => {
      const v = await latest();
      if (stop || !v || v === BUILD) return;
      newVersion = v;
      // Just opened, or back after being away, and nothing being typed: update now.
      if (!editing(window.location.pathname) && document.visibilityState === 'visible' && reloadFor(v)) return;
      setReady(true);
    };
    check();
    const id = setInterval(check, EVERY);
    const onShow = () => document.visibilityState === 'visible' && check();
    document.addEventListener('visibilitychange', onShow);
    // A part of the old version was removed by a deploy: load the new one.
    const onChunk = (e) => {
      e.preventDefault?.();
      reloadFor(`chunk-${Date.now() >> 16}`);
    };
    window.addEventListener('vite:preloadError', onChunk);
    return () => {
      stop = true;
      clearInterval(id);
      document.removeEventListener('visibilitychange', onShow);
      window.removeEventListener('vite:preloadError', onChunk);
    };
  }, []);

  // Moving to another page is a safe moment: load the new version there.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (newVersion && !editing(loc.pathname)) reloadFor(newVersion);
  }, [loc.pathname]);

  if (!ready) return null;
  return (
    <div className="no-print fixed z-[60] left-1/2 -translate-x-1/2 top-[64px] lg:top-auto lg:bottom-5 w-[calc(100%-32px)] max-w-[440px]">
      <div className="flex items-center gap-3 rounded-[var(--radius-card)] border border-line bg-white px-3.5 py-2.5 shadow-[var(--shadow-pop)]">
        <RefreshCw className="size-5 shrink-0 text-accent" />
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-bold truncate">{t('upd_title')}</div>
          <div className="text-[12px] text-muted truncate">{t('upd_sub')}</div>
        </div>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="shrink-0 whitespace-nowrap h-9 px-3.5 rounded-[var(--radius-ctl)] bg-accent text-white text-[13px] font-bold hover:bg-accent-dark"
        >
          {t('upd_now')}
        </button>
      </div>
    </div>
  );
}

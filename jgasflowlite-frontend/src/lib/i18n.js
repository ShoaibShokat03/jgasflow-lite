import { useSyncExternalStore } from 'react';
import { APP_STRINGS } from './strings.app';
import { WEB_STRINGS } from './strings.web';

/** English / Roman Urdu, same wording as the mobile app. */
const S = { ...APP_STRINGS, ...WEB_STRINGS };
const KEY = 'jgf-lang';

let lang = (() => {
  try {
    return localStorage.getItem(KEY) === 'ur' ? 'ur' : 'en';
  } catch {
    return 'en';
  }
})();
const subs = new Set();

export function setLang(l) {
  lang = l === 'ur' ? 'ur' : 'en';
  try {
    localStorage.setItem(KEY, lang);
  } catch {
    /* not saved, still switches for this visit */
  }
  subs.forEach((f) => f());
}

export const getLang = () => lang;

/** Re-render on language change. */
export const useLang = () =>
  useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => lang,
  );

/** t('key') or t('key', {n: 3}) with {n} placeholders. */
export function t(key, vars) {
  const v = S[key];
  let s = !v ? key : lang === 'ur' && v[1] ? v[1] : v[0];
  if (vars) for (const [k, x] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(x));
  return s;
}

export const methodLabel = (m) => t(`pm_${m || 'cash'}`);
export const moveLabel = (r) => (S[`mv_${r}`] ? t(`mv_${r}`) : r === 'set' ? t('set_cylinders_held') : r);

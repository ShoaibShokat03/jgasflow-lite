// src/utils/saasAuth.js

/**
 * Token + profile storage for the SaaS platform admin.
 * Keys are namespaced (saas_*) so they can never collide with a
 * clinic-side app sharing the same origin.
 */
import {
  SAAS_MODULES,
  SAAS_MODULE_KEYS,
  SAAS_PERMISSION_KEYS,
  permsOfModule,
} from "../constants/saasModules";

const ACCESS_KEY = "saas_token";
const REFRESH_KEY = "saas_refresh";
const ADMIN_KEY = "saas_admin";

export const getAccessToken = () => localStorage.getItem(ACCESS_KEY) || null;
export const getRefreshToken = () => localStorage.getItem(REFRESH_KEY) || null;

export const getAdmin = () => {
  try {
    return JSON.parse(localStorage.getItem(ADMIN_KEY) || "null");
  } catch {
    return null;
  }
};

export const storeTokens = (accessToken, refreshToken, admin) => {
  if (accessToken) localStorage.setItem(ACCESS_KEY, accessToken);
  if (refreshToken) localStorage.setItem(REFRESH_KEY, refreshToken);
  if (admin) localStorage.setItem(ADMIN_KEY, JSON.stringify(admin));
};

export const clearAuth = () => {
  [ACCESS_KEY, REFRESH_KEY, ADMIN_KEY].forEach((k) => localStorage.removeItem(k));
};

export const isAuthenticated = () => !!getAccessToken();

/**
 * Every `${module}.${action}` permission this admin holds. Mirrors
 * `permissionsFor()` on the backend: super admins get everything, a NULL list
 * means unrestricted (accounts predating this feature), and a stored BARE
 * module key expands to all of that module's actions (rows written by the
 * first, module-only version of this feature).
 */
export const getPermissions = () => {
  const admin = getAdmin();
  if (!admin) return [];
  if (admin.role === "super_admin") return SAAS_PERMISSION_KEYS;

  const raw = admin.permissions ?? admin.modules;
  if (raw == null) return SAAS_PERMISSION_KEYS;
  if (!Array.isArray(raw)) return [];

  const granted = new Set();
  for (const key of raw) {
    if (SAAS_MODULE_KEYS.includes(key)) permsOfModule(key).forEach((p) => granted.add(p));
    else if (SAAS_PERMISSION_KEYS.includes(key)) granted.add(key);
  }
  return SAAS_PERMISSION_KEYS.filter((k) => granted.has(k));
};

/** `can("plans.delete")`, or `can("plans")` as shorthand for `plans.view`. */
export const can = (key) =>
  getPermissions().includes(key.includes(".") ? key : `${key}.view`);

/** Modules whose screen is open — `view` is the gate. */
export const getModules = () => {
  const perms = getPermissions();
  return SAAS_MODULE_KEYS.filter((m) => perms.includes(`${m}.view`));
};

export const canModule = (key) => getModules().includes(key);

/** Where to land after login — the first module this admin actually has. */
export const landingPath = () => {
  const allowed = getModules();
  const first = SAAS_MODULES.find((m) => allowed.includes(m.key));
  if (first) return first.path;
  return getAdmin()?.role === "super_admin" ? "/admins" : "/no-access";
};

/** Keep the cached profile fresh after /saas/auth/me — module grants change. */
export const storeAdmin = (admin) => {
  if (admin) localStorage.setItem(ADMIN_KEY, JSON.stringify(admin));
};

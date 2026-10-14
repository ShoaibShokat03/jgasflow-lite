// src/utils/saasAuth.js

/**
 * Session and profile storage for the JGasFlow console. Keys are namespaced
 * (jgf_console_*) so they never collide with the shop web app.
 */
import { SAAS_MODULES } from "../constants/saasModules";

const TOKEN_KEY = "jgf_console_token";
const ADMIN_KEY = "jgf_console_admin";

const read = (k) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k, v) => {
  try {
    if (v == null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    /* storage blocked: the session lasts for this tab only */
  }
};

export const getAccessToken = () => read(TOKEN_KEY) || null;

/** `{ id, name, email, role: 'super_admin' | 'admin', modules: [...] }` */
export const getAdmin = () => {
  try {
    return JSON.parse(read(ADMIN_KEY) || "null");
  } catch {
    return null;
  }
};

export const storeSession = (token, admin) => {
  if (token) write(TOKEN_KEY, token);
  if (admin) write(ADMIN_KEY, JSON.stringify(admin));
};

export const storeAdmin = (admin) => {
  if (admin) write(ADMIN_KEY, JSON.stringify({ ...getAdmin(), ...admin }));
};

export const clearAuth = () => {
  write(TOKEN_KEY, null);
  write(ADMIN_KEY, null);
};

export const isAuthenticated = () => !!getAccessToken();
export const isSuper = () => getAdmin()?.role === "super_admin";

/** Module keys this admin may open (from /platform/me). */
export const getModules = () => {
  const a = getAdmin();
  if (!a) return [];
  if (a.role === "super_admin") return [...SAAS_MODULES.map((m) => m.key), "ai_settings", "admins"];
  return Array.isArray(a.modules) ? a.modules : [];
};

export const canModule = (key) => getModules().includes(key);

/**
 * `can("shops")`, or the dotted keys the assistant screens use:
 * `assistant.settings` is the AI settings grant, `assistant.audit` (reading
 * other admins' questions) is super admin only.
 */
export const can = (key) => {
  if (isSuper()) return true;
  if (key === "assistant.settings") return canModule("ai_settings");
  if (key === "assistant.audit") return false;
  return canModule(key.split(".")[0]);
};

/** Where to land after sign in: the first screen this admin may open. */
export const landingPath = () => {
  const allowed = getModules();
  const first = SAAS_MODULES.find((m) => allowed.includes(m.key));
  if (first) return first.path;
  return isSuper() ? "/admins" : "/no-access";
};

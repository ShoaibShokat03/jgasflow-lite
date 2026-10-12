// src/config/app.js

/**
 * JDent SaaS Admin — application configuration.
 *
 * Switch environments with a single flag:
 *   - hostType = "local" → localhost URLs (backend on :5001)
 *   - hostType = "live"  → production URLs
 *
 * Everything is hardcoded here. No .env / VITE_* env vars.
 */

// ─── SWITCH ME ───────────────────────────────────────────────
export const hostType = "live"; // "local" | "live"
// ─────────────────────────────────────────────────────────────

const URLS = {
  local: {
    API_BASE_URL: "http://localhost:5000/api",
    BASE_URL: "http://localhost:5001",
    BASE_PATH: "",
    // Clinic portal — where "Open clinic as owner" hands off to.
    CLINIC_APP_URL: "http://localhost:5002",
  },
  live: {
    API_BASE_URL: "https://api.jdentclinic.com/api",
    BASE_URL: "https://admin.jdentclinic.com",
    BASE_PATH: "",
    CLINIC_APP_URL: "https://app.jdentclinic.com",
  },
};

const active = URLS[hostType] || URLS.live;

export const API_BASE_URL = active.API_BASE_URL;
export const BASE_PATH = active.BASE_PATH;
export const BASE_URL = active.BASE_URL;
export const CLINIC_APP_URL = active.CLINIC_APP_URL;

/** Server origin (API base without /api) — for /uploads/* asset paths. */
export const SERVER_ORIGIN = active.API_BASE_URL.replace(/\/api\/?$/, "");

/** Resolve a stored asset path (e.g. "/uploads/…") to a full URL. */
export const assetUrl = (p) =>
  p && p.startsWith("/uploads") ? `${SERVER_ORIGIN}${p}` : p;

export default {
  hostType,
  API_BASE_URL,
  BASE_PATH,
  BASE_URL,
  CLINIC_APP_URL,
};

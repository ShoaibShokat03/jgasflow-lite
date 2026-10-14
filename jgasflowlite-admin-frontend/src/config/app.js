// src/config/app.js

/**
 * JGasFlow Console: where the API lives.
 *
 * On localhost the console talks to the local API (Run.bat starts it on :5000).
 * Anywhere else it talks to production. Nothing here is shown in the UI.
 */
const isLocal =
  typeof window !== "undefined" &&
  /^(localhost|127\.0\.0\.1|\[::1\]|192\.168\.\d+\.\d+)$/.test(window.location.hostname);

const URLS = {
  local: {
    API_BASE_URL: `http://${typeof window !== "undefined" ? window.location.hostname : "localhost"}:5000/api`,
    SHOP_APP_URL: "http://localhost:5002",
  },
  live: {
    API_BASE_URL: "https://lite.jgasflow.com/backend/api",
    SHOP_APP_URL: "https://lite.jgasflow.com",
  },
};

const active = isLocal ? URLS.local : URLS.live;

export const API_BASE_URL = active.API_BASE_URL;
export const SHOP_APP_URL = active.SHOP_APP_URL;
/** The console is served from the domain root. */
export const BASE_PATH = "";

export default { API_BASE_URL, SHOP_APP_URL, BASE_PATH };

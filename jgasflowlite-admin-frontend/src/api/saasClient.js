// src/api/saasClient.js
import axios from "axios";
import { API_BASE_URL, BASE_URL } from "../config/app";
import {
  getAccessToken,
  getRefreshToken,
  storeTokens,
  clearAuth,
} from "../utils/saasAuth";

/**
 * Axios client for the SaaS platform-admin API.
 *
 * - Attaches the saas admin Bearer token to every request.
 * - On 401: tries ONE refresh-token rotation; if that fails,
 *   clears auth and redirects to /login.
 */
const saasClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: { "Content-Type": "application/json" },
});

saasClient.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let refreshPromise = null;

const redirectToLogin = () => {
  clearAuth();
  window.location.href = `${BASE_URL}/login`;
};

saasClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    const status = error.response?.status;

    // Never try to refresh the endpoints that MINT the session: login has no
    // session yet, refresh would recurse, logout is already tearing it down.
    // `/saas/auth/me` is an ordinary authenticated call and must NOT be in
    // this list — excluding the whole `/saas/auth/` prefix meant a 401 there
    // was swallowed, so an expired session sat unnoticed until some other
    // request happened to fail.
    const url = original?.url || "";
    const isSessionCall =
      url.includes("/saas/auth/login") ||
      url.includes("/saas/auth/refresh") ||
      url.includes("/saas/auth/logout");

    if (status === 401 && !original._retried && !isSessionCall) {
      original._retried = true;
      const refreshToken = getRefreshToken();
      if (!refreshToken) {
        redirectToLogin();
        return Promise.reject(error);
      }

      try {
        // De-dupe concurrent refreshes into a single call
        refreshPromise =
          refreshPromise ||
          axios.post(`${API_BASE_URL}/saas/auth/refresh`, {
            refresh_token: refreshToken,
          });
        const { data } = await refreshPromise;
        refreshPromise = null;

        storeTokens(data.access_token, data.refresh_token, data.admin);
        original.headers.Authorization = `Bearer ${data.access_token}`;
        return saasClient(original);
      } catch (refreshError) {
        refreshPromise = null;
        redirectToLogin();
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  },
);

export default saasClient;

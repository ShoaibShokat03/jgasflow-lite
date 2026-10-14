// src/api/saasClient.js
import axios from "axios";
import { API_BASE_URL, BASE_PATH } from "../config/app";
import { getAccessToken, clearAuth } from "../utils/saasAuth";

/**
 * Axios client for the JGasFlow console API.
 *
 * Sessions are a single long-lived token (no refresh rotation). A 401 means
 * the session ended (signed out elsewhere, password changed, admin removed),
 * so the console clears it and goes back to the sign-in screen.
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

saasClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const url = error.config?.url || "";
    if (status === 401 && !url.includes("/auth/login")) {
      clearAuth();
      if (!window.location.pathname.endsWith("/login")) {
        window.location.href = `${BASE_PATH}/login`;
      }
    }
    return Promise.reject(error);
  },
);

/** The message the API gave, or a plain fallback. */
export const errMsg = (err, fallback = "Something went wrong. Please try again.") => {
  const m = err?.response?.data?.message;
  if (Array.isArray(m)) return m.join(", ");
  if (m) return String(m);
  if (err?.code === "ECONNABORTED") return "The server took too long to answer.";
  if (!err?.response) return "Cannot reach the server. Check the internet connection.";
  return fallback;
};

export default saasClient;

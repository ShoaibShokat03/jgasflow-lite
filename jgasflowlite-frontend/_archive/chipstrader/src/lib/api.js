import axios from 'axios';
import { session } from './session';

/**
 * One axios instance for the whole app.
 *
 * VITE_API_URL points at the API (".../api"). Left empty, requests go to
 * "/api" on the same origin, the Vite dev proxy locally, a reverse proxy in
 * production.
 */
export const API_URL = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');
export const ASSET_URL = API_URL.replace(/\/api$/, '');

export const api = axios.create({ baseURL: API_URL, timeout: 30000 });

api.interceptors.request.use((config) => {
  const token = session.accessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Concurrent 401s share ONE refresh; everyone waits on the same promise.
let refreshing = null;

async function refresh() {
  const refresh_token = session.refreshToken();
  if (!refresh_token) throw new Error('no session');
  const { data } = await axios.post(`${API_URL}/auth/refresh`, { refresh_token });
  session.store(data);
  return data.access_token;
}

api.interceptors.response.use(
  (r) => r,
  async (error) => {
    const original = error.config;
    const status = error.response?.status;
    const isAuthCall = original?.url?.startsWith('/auth/login') || original?.url?.startsWith('/auth/refresh');
    if (status === 401 && !original._retry && !isAuthCall) {
      original._retry = true;
      try {
        refreshing ??= refresh().finally(() => (refreshing = null));
        const token = await refreshing;
        original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      } catch {
        session.clear();
        if (!location.pathname.startsWith('/login')) {
          location.assign(`/login?next=${encodeURIComponent(location.pathname + location.search)}`);
        }
      }
    }
    return Promise.reject(error);
  },
);

/** Human message from any API error. */
export function errorMessage(err, fallback = 'Something went wrong') {
  const m = err?.response?.data?.message;
  if (Array.isArray(m)) return m.join(', ');
  return m || err?.message || fallback;
}

/** GET returning `data`, the shape every query function wants. */
export const get = (url, params) => api.get(url, { params }).then((r) => r.data);
export const post = (url, body) => api.post(url, body).then((r) => r.data);
export const patch = (url, body) => api.patch(url, body).then((r) => r.data);
export const put = (url, body) => api.put(url, body).then((r) => r.data);

export function upload(url, file, params) {
  const fd = new FormData();
  fd.append('file', file);
  return api.post(url, fd, { params, timeout: 120000 }).then((r) => r.data);
}

/** Open an authenticated binary (PDF, attachment) in a new tab or download it. */
export async function openBlob(url, { download, filename } = {}) {
  const win = download ? null : window.open('', '_blank');
  try {
    const res = await api.get(url, { responseType: 'blob', timeout: 60000 });
    const href = URL.createObjectURL(res.data);
    if (download) {
      const a = Object.assign(document.createElement('a'), { href, download: filename || 'download' });
      a.click();
    } else if (win) {
      win.location.href = href;
    }
    setTimeout(() => URL.revokeObjectURL(href), 60000);
  } catch (e) {
    win?.close();
    throw e;
  }
}

import axios from 'axios';
import { QueryClient, useMutation, useQuery } from '@tanstack/react-query';

const TOKEN = 'jgf-token';

export const getToken = () => {
  try {
    return localStorage.getItem(TOKEN) || '';
  } catch {
    return '';
  }
};
export const setToken = (t) => {
  try {
    if (t) localStorage.setItem(TOKEN, t);
    else localStorage.removeItem(TOKEN);
  } catch {
    /* storage blocked: session lasts for this tab only */
  }
};

export const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || '/api', timeout: 60000 });

api.interceptors.request.use((cfg) => {
  const t = getToken();
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

api.interceptors.response.use(
  (r) => r.data,
  (err) => {
    const status = err.response?.status;
    const data = err.response?.data;
    if (status === 401 && getToken() && !String(err.config?.url).includes('/auth/login')) {
      setToken('');
      window.dispatchEvent(new CustomEvent('jgf:logout'));
    }
    if (status === 402) window.dispatchEvent(new CustomEvent('jgf:expired'));
    const message = Array.isArray(data?.message) ? data.message[0] : data?.message || (err.code === 'ERR_NETWORK' ? 'Cannot reach the server. Check your internet.' : err.message);
    return Promise.reject(Object.assign(new Error(message), { status, code: data?.code }));
  },
);

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 15000, retry: (n, e) => n < 1 && !(e?.status >= 400 && e?.status < 500), refetchOnWindowFocus: true },
  },
});

const clean = (params) => Object.fromEntries(Object.entries(params || {}).filter(([, v]) => v !== undefined && v !== null && v !== ''));

/** GET with caching. `path` null skips the request. */
export function useGet(path, params, opts = {}) {
  const p = clean(params);
  return useQuery({ queryKey: [path, p], queryFn: () => api.get(path, { params: p }), enabled: !!path, ...opts });
}

/**
 * Write and refresh. Every change can touch stock, balances and the dashboard,
 * so all cached reads are refreshed after a successful write.
 */
export function useAct(fn, opts = {}) {
  return useMutation({
    mutationFn: fn,
    ...opts,
    onSuccess: async (data, vars, ctx) => {
      await queryClient.invalidateQueries();
      opts.onSuccess?.(data, vars, ctx);
    },
  });
}

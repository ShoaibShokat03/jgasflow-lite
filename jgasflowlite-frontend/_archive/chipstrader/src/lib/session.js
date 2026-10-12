/**
 * Tokens live in localStorage so a refresh keeps you signed in; the access
 * token is short-lived and the refresh token rotates on every use.
 */
const KEY = 'ct-session';

function read() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || 'null');
  } catch {
    return null;
  }
}

export const session = {
  accessToken: () => read()?.access_token ?? null,
  refreshToken: () => read()?.refresh_token ?? null,
  user: () => read()?.user ?? null,
  isSignedIn: () => !!read()?.access_token,
  store(data) {
    const prev = read() || {};
    localStorage.setItem(KEY, JSON.stringify({ ...prev, ...data }));
  },
  clear() {
    localStorage.removeItem(KEY);
  },
};

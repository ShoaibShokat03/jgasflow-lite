import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, getToken, queryClient, setToken } from './api';
import { setCurrency } from './format';

const Ctx = createContext(null);

/**
 * Who is logged in. `me` = { user, shop, subscription } from /auth/me.
 * Roles: owner (everything), manager (all but billing and team),
 * salesman (sales, payments and customers).
 */
export function AuthProvider({ children }) {
  const [state, setState] = useState({ status: getToken() ? 'loading' : 'guest', me: null });

  const apply = useCallback((me) => {
    setCurrency(me?.shop?.currency || 'Rs');
    setState({ status: me ? 'user' : 'guest', me });
  }, []);

  const refresh = useCallback(async () => {
    if (!getToken()) return apply(null);
    try {
      apply(await api.get('/auth/me'));
    } catch (e) {
      if (e.status === 401) apply(null);
      else setState((s) => ({ ...s, status: s.me ? 'user' : 'error' }));
    }
  }, [apply]);

  useEffect(() => {
    refresh();
    const out = () => {
      queryClient.clear();
      apply(null);
    };
    const expired = () => refresh();
    window.addEventListener('jgf:logout', out);
    window.addEventListener('jgf:expired', expired);
    return () => {
      window.removeEventListener('jgf:logout', out);
      window.removeEventListener('jgf:expired', expired);
    };
  }, [refresh, apply]);

  const signIn = useCallback(
    (res) => {
      setToken(res.token);
      queryClient.clear();
      apply({ user: res.user, shop: res.shop, subscription: res.subscription });
    },
    [apply],
  );

  const signOut = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      /* already signed out on the server */
    }
    setToken('');
    queryClient.clear();
    apply(null);
  }, [apply]);

  const value = useMemo(() => {
    const me = state.me;
    const role = me?.user?.role;
    return {
      ...state,
      user: me?.user ?? null,
      shop: me?.shop ?? null,
      sub: me?.subscription ?? null,
      role,
      isSuper: !!me?.user?.is_super,
      isOwner: role === 'owner',
      isManager: role === 'owner' || role === 'manager',
      readOnly: !!me?.subscription?.read_only,
      refresh,
      signIn,
      signOut,
      setShop: (shop) => {
        setCurrency(shop?.currency);
        setState((s) => ({ ...s, me: { ...s.me, shop } }));
      },
    };
  }, [state, refresh, signIn, signOut]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);

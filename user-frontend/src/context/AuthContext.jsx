import { createContext, useContext, useCallback, useEffect, useMemo, useState } from 'react';
import { apiGet, apiPost } from '../api/client.js';
import { disablePush, syncPush } from '../notifications/push.js';

const AuthContext = createContext(null);
const STORAGE_KEY = 'auth';

export function AuthProvider({ children }) {
  const [auth, setAuth] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (auth) localStorage.setItem(STORAGE_KEY, JSON.stringify(auth));
    else localStorage.removeItem(STORAGE_KEY);
  }, [auth]);

  const login = async (loginId, password) => {
    const data = await apiPost('/auth/login', { loginId, password });
    setAuth({ token: data.token, user: data.user });
    syncPush(data.token); // a browser that allowed push keeps it, now for this account
    return data.user;
  };

  // Submit a sign-up request. The account is created pending admin approval and is
  // NOT signed in, so no token is stored. Returns the server's { ok, message }.
  const register = async (form) => {
    return apiPost('/auth/register', {
      name: form.name.trim(),
      loginId: form.loginId.trim(),
      password: form.password,
      referralId: form.referralId?.trim() || null,
      email: form.email?.trim() || null,
      bankName: form.bankName?.trim() || null,
      bankAccount: form.bankAccount?.trim() || null,
      bankMaster: form.bankMaster?.trim() || null,
    });
  };

  // Signing out also stops push on this browser, so a shared device does not
  // keep receiving this player's notifications.
  const logout = () => {
    disablePush(auth?.token);
    setAuth(null);
  };

  // Merge live balance/point (from the SignalR wallet hub) into the stored user.
  const updateWallet = useCallback(({ balance, point }) => {
    setAuth((prev) => {
      if (!prev?.user) return prev;
      return {
        ...prev,
        user: {
          ...prev.user,
          balance: balance ?? prev.user.balance,
          point: point ?? prev.user.point,
        },
      };
    });
  }, []);

  // Re-read the user's balance/point from the server. localStorage only holds the
  // snapshot taken at login, so without this a page refresh shows stale numbers.
  const token = auth?.token ?? null;
  const refreshUser = useCallback(async () => {
    if (!token) return;
    try {
      const fresh = await apiGet('/auth/me', token);
      setAuth((prev) => (prev?.token === token ? { ...prev, user: { ...prev.user, ...fresh } } : prev));
    } catch (err) {
      // Expired/invalid session or deactivated account: sign out.
      if (err.status === 401) setAuth((prev) => (prev?.token === token ? null : prev));
    }
  }, [token]);

  // Refresh on load/sign-in, and whenever the user comes back to this tab
  // (games open in a new window, so returning here should show the result).
  useEffect(() => {
    if (!token) return;
    refreshUser();
    const onVisible = () => { if (document.visibilityState === 'visible') refreshUser(); };
    window.addEventListener('focus', refreshUser);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', refreshUser);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [token, refreshUser]);

  const value = useMemo(
    () => ({ user: auth?.user ?? null, token, login, register, logout, updateWallet, refreshUser }),
    [auth, token, updateWallet, refreshUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}

import { createContext, useContext, useCallback, useEffect, useMemo, useState } from 'react';
import { apiPost } from '../api/client.js';

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

  const logout = () => setAuth(null);

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

  const value = useMemo(
    () => ({ user: auth?.user ?? null, token: auth?.token ?? null, login, register, logout, updateWallet }),
    [auth, updateWallet]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}

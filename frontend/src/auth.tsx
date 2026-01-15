import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import axios from 'axios';

type AuthUser = {
  id: string;
  email: string;
  role: string;
  name?: string | null;
  technicianId?: string | null;
};

type LoginResponse = {
  token: string;
  user: AuthUser;
};

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: () => void;
};

const TOKEN_KEY = 'authToken';
const USER_KEY = 'authUser';

const AuthContext = createContext<AuthContextValue | null>(null);

const loadToken = () => localStorage.getItem(TOKEN_KEY) || '';
const persistToken = (token: string) => localStorage.setItem(TOKEN_KEY, token);
const persistUser = (user: AuthUser) => localStorage.setItem(USER_KEY, JSON.stringify(user));
const clearStoredAuth = () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
};
const loadStoredUser = () => {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
};

const applyToken = (token?: string) => {
  if (token) {
    axios.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete axios.defaults.headers.common.Authorization;
  }
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = loadToken();
    if (!token) {
      setLoading(false);
      return;
    }
    applyToken(token);
    const storedUser = loadStoredUser();
    if (storedUser) {
      setUser(storedUser);
    }
    axios
      .get<AuthUser>('/api/v1/auth/me')
      .then((res) => {
        setUser(res.data);
        persistUser(res.data);
      })
      .catch(() => {
        clearStoredAuth();
        applyToken(undefined);
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    return {
      user,
      loading,
      login: async (email: string, password: string) => {
        const res = await axios.post<LoginResponse>('/api/v1/auth/login', { email, password });
        applyToken(res.data.token);
        persistToken(res.data.token);
        persistUser(res.data.user);
        setUser(res.data.user);
        return res.data.user;
      },
      logout: () => {
        clearStoredAuth();
        applyToken(undefined);
        setUser(null);
      },
    };
  }, [user, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}

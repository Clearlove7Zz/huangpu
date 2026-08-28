import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import MOCK_DATA from './data';

export interface UserInfo {
  name: string;
  role: string;
  avatar: string;
  nav: string[];
}

export const TEST_ACCOUNT = {
  username: 'test-admin',
  password: 'test-admin-123', // demo 值，仅前端 Mock 登录校验，非真实系统凭据
  role: '全权限测试账号',
} as const;

interface AuthState {
  user: UserInfo | null;
  login: (role: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthState>({ user: null, login: () => undefined, logout: () => undefined });

const ROLES = MOCK_DATA.roles as Record<string, { nav: string[]; name: string }>;

/** AI 助手对所有角色开放：统一在 nav 最前面注入（登录与刷新恢复共用，保证一致） */
function normalizeNav(nav: string[]): string[] {
  return nav.includes('ai') ? nav : ['ai', ...nav];
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserInfo | null>(() => {
    const saved = localStorage.getItem('hp-role');
    if (!saved || !ROLES[saved]) return null;
    return {
      name: ROLES[saved].name,
      role: saved,
      avatar: ROLES[saved].name.charAt(0),
      nav: normalizeNav(ROLES[saved].nav),
    };
  });

  const login = useCallback((role: string) => {
    const meta = ROLES[role];
    if (!meta) return;
    localStorage.setItem('hp-role', role);
    setUser({ name: meta.name, role, avatar: meta.name.charAt(0), nav: normalizeNav(meta.nav) });
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('hp-role');
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, login, logout }), [user, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}

export const ROLE_OPTIONS = Object.keys(ROLES);

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import MOCK_DATA from './data';
import { setToken } from './config/gateway-auth';

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
  /** 网关登录：POST /api/auth/login，成功签发令牌并写入用户态 */
  loginWithGateway: (username: string, password: string) => Promise<{ ok: boolean; offline?: boolean; error?: string }>;
  logout: () => void;
}

const AuthContext = createContext<AuthState>({ user: null, login: () => undefined, loginWithGateway: async () => ({ ok: false, offline: true }), logout: () => undefined });

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

  // 网关登录（demo 后端网关 huangpu-gateway）：成功后令牌存 localStorage，
  // 后续 /api/v1 请求统一经 gatewayHeaders() 附加；角色与 nav 复用前端 ROLES 元数据。
  const loginWithGateway = useCallback(async (username: string, password: string) => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        return { ok: false, error: body.error ?? `登录失败 HTTP ${res.status}` };
      }
      const data = (await res.json()) as { token: string; role: string; name: string };
      setToken(data.token);
      localStorage.setItem('hp-role', data.role);
      const meta = ROLES[data.role];
      setUser({
        name: meta?.name ?? data.name,
        role: data.role,
        avatar: (meta?.name ?? data.name).charAt(0),
        nav: normalizeNav(meta?.nav ?? []),
      });
      return { ok: true };
    } catch {
      // 网关未启动 → 调用方回退演示模式（前端 mock 登录）
      return { ok: false, offline: true };
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('hp-role');
    setToken('');
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, login, loginWithGateway, logout }), [user, login, loginWithGateway, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}

export const ROLE_OPTIONS = Object.keys(ROLES);

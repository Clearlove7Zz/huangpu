import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import MOCK_DATA from './data';
import { setToken } from './config/gateway-auth';

export interface GatewayScope {
  kbIds: string[];
  kbAll: boolean;
  kbWrite: boolean;
  pages: string[];
  agentIds: string[];
  agentNameKeywords: string[];
  defaultAgentId: string;
  defaultAgentName?: string;
  canAskProfit: boolean;
}

export interface UserInfo {
  name: string;
  role: string;
  avatar: string;
  nav: string[];
  scope: GatewayScope;
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

/** 前端 mock roles 仅作为离线演示模式的登录账号表；正式权限以网关下发的 scope 为准 */
const ROLES = MOCK_DATA.roles as Record<string, { nav: string[]; name: string }>;

const SCOPE_KEY = 'hp-gateway-scope';

function loadScope(): GatewayScope | null {
  try {
    const raw = localStorage.getItem(SCOPE_KEY);
    return raw ? (JSON.parse(raw) as GatewayScope) : null;
  } catch {
    return null;
  }
}

/** AI 助手对所有角色开放：统一在 nav 最前面注入（登录与刷新恢复共用，保证一致） */
function normalizeNav(nav: string[]): string[] {
  return nav.includes('ai') ? nav : ['ai', ...nav];
}

function buildUser(name: string, role: string, scope: GatewayScope): UserInfo {
  return {
    name,
    role,
    avatar: name.charAt(0),
    nav: normalizeNav(scope.pages ?? []),
    scope,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserInfo | null>(() => {
    // 刷新恢复：优先消费网关下发的 scope（hp-gateway-scope）；无 scope 时按离线 mock 登录态恢复
    const saved = localStorage.getItem('hp-role');
    if (!saved || !ROLES[saved]) return null;
    const scope = loadScope();
    if (!scope) return null; // 无网关 scope = 离线演示模式未完成，回登录页
    return buildUser(ROLES[saved]?.name ?? saved, saved, scope);
  });

  const login = useCallback((role: string) => {
    const meta = ROLES[role];
    if (!meta) return;
    localStorage.setItem('hp-role', role);
    // 离线演示模式：无网关 scope，仅按 mock nav 构建（不走受控接口）
    setUser({ name: meta.name, role, avatar: meta.name.charAt(0), nav: normalizeNav(meta.nav), scope: { kbIds: [], kbAll: false, kbWrite: false, pages: normalizeNav(meta.nav).filter((k) => k !== 'ai'), agentIds: [], agentNameKeywords: [], defaultAgentId: 'builtin-quick-answer', canAskProfit: true } });
  }, []);

  // 网关登录（demo 后端网关 huangpu-gateway）：令牌与网关下发的 scope 一并保存；
  // 前端各页的库/智能体/页面过滤全部消费 scope，不再本地重算矩阵。
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
      const data = (await res.json()) as { token: string; role: string; name: string; scope: GatewayScope };
      if (!data.scope) {
        return { ok: false, error: '网关未下发权限范围（scope），请检查网关版本' };
      }
      setToken(data.token);
      localStorage.setItem('hp-role', data.role);
      localStorage.setItem(SCOPE_KEY, JSON.stringify(data.scope));
      const meta = ROLES[data.role];
      setUser(buildUser(meta?.name ?? data.name, data.role, data.scope));
      return { ok: true };
    } catch {
      // 网关未启动 → 调用方回退演示模式（前端 mock 登录）
      return { ok: false, offline: true };
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('hp-role');
    localStorage.removeItem(SCOPE_KEY);
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

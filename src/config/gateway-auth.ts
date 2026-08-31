/**
 * 网关令牌存取。浏览器只持有网关签发的 HMAC 令牌（X-Gateway-Token 头），
 * WeKnora scoped API key 由后端网关（工作区 huangpu-gateway/）持有并注入上游，
 * 不再进浏览器 bundle（PRD §7.3 网关职责②）。
 */

const STORAGE_KEY = 'hp-gateway-token';

export function getToken(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

export function setToken(token: string): void {
  try {
    if (token) localStorage.setItem(STORAGE_KEY, token);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // localStorage 不可用时忽略（本次会话内无法走网关问答）
  }
}

/** 所有经 /api/v1 的请求统一附加网关令牌头 */
export function gatewayHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { 'X-Gateway-Token': token } : {};
}

/**
 * 网关认证（demo 版）：演示用户库 + HMAC 签名令牌。
 * - 用户/密码为 demo 值，非真实凭据；生产环境由统一认证（PRD §11 DevOps 项）替代。
 * - 令牌 = base64url(载荷JSON) + '.' + HMAC-SHA256 签名，载荷含角色与过期时间，
 *   网关用它识别角色以执行越权拦截；浏览器持有令牌但不持有 WeKnora API key。
 */

import crypto from 'node:crypto';

export const USERS = [
  { username: 'admin', password: 'admin123', role: '全权限测试账号', name: '测试管理员' },
  { username: 'ai', password: 'ai123', role: '指挥部-商务部', name: '艾经理' },
  { username: 'wang', password: 'wang123', role: '指挥部-财务部', name: '王会计' },
  { username: 'ning', password: 'ning123', role: '股份领导/指挥长', name: '宁总' },
  { username: 'cao', password: 'cao123', role: '指挥部-工程技术部', name: '曹经理' },
  { username: 'wu', password: 'wu123', role: '指挥部-外协部', name: '吴主任' },
  { username: 'xiong', password: 'xiong123', role: '安全员', name: '熊安全员' },
];

const SECRET = process.env.GATEWAY_TOKEN_SECRET || 'hp-gateway-demo-secret';
const TTL_MS = 12 * 60 * 60 * 1000; // 12 小时

function b64url(buf) {
  return Buffer.from(buf).toString('base64url');
}

function hmac(payloadB64) {
  return crypto.createHmac('sha256', SECRET).update(payloadB64).digest('base64url');
}

export function login(username, password) {
  const user = USERS.find((u) => u.username === username && u.password === password);
  if (!user) return null;
  const payload = { role: user.role, name: user.name, exp: Date.now() + TTL_MS };
  const payloadB64 = b64url(JSON.stringify(payload));
  return { token: `${payloadB64}.${hmac(payloadB64)}`, role: user.role, name: user.name };
}

/** 校验令牌，通过返回载荷，否则返回 null（签名不符/过期） */
export function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const payloadB64 = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expect = hmac(payloadB64);
  const a = Buffer.from(sig);
  const b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    if (typeof payload.exp !== 'number' || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

/** 从请求头提取令牌：优先 X-Gateway-Token，兼容 Authorization: Bearer */
export function tokenFromRequest(req) {
  const direct = req.headers['x-gateway-token'];
  if (direct) return String(direct);
  const auth = req.headers['authorization'];
  if (auth && auth.startsWith('Bearer ')) return auth.slice(7);
  return '';
}

import crypto from 'node:crypto';
import { config } from './config.js';

export function uid(prefix = '') {
  return prefix + crypto.randomBytes(6).toString('hex');
}

export function nowISO() {
  return new Date().toISOString();
}

export function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, 32).toString('hex');
  return { salt, hash };
}

export function verifyPassword(password, salt, hash) {
  try {
    const candidate = crypto.scryptSync(String(password), salt, 32);
    const expected = Buffer.from(hash, 'hex');
    return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
  } catch {
    return false;
  }
}

function b64url(input) {
  return Buffer.from(input).toString('base64url');
}

export function signToken(payload, ttlMs = 1000 * 60 * 60 * 24 * 14) {
  const body = b64url(JSON.stringify({ ...payload, exp: Date.now() + ttlMs }));
  const sig = crypto.createHmac('sha256', config.secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', config.secret).update(body).digest('base64url');
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const bad = (msg, details) => new HttpError(400, msg, details);
export const unauthorized = (msg = '请先登录') => new HttpError(401, msg);
export const forbidden = (msg = '无权访问该数据') => new HttpError(403, msg);
export const notFound = (msg = '资源不存在') => new HttpError(404, msg);

export function requireFields(body, fields) {
  const missing = fields.filter((f) => {
    const v = body?.[f];
    return v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
  });
  if (missing.length) throw bad(`缺少必填字段：${missing.join('、')}`);
}

export function clamp(n, min = 0, max = 100) {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

export function round(n, digits = 0) {
  const p = 10 ** digits;
  return Math.round(n * p) / p;
}

export function ageBandOf(age) {
  const a = Number(age);
  if (!Number.isFinite(a)) return '16-18';
  if (a <= 14) return '12-15';
  if (a <= 18) return '16-18';
  return '19-22';
}

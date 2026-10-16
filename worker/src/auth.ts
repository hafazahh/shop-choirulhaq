/**
 * auth.ts — scrypt password hashing, D1 admin sessions, cookie helpers.
 * Custom D1 login per resolved decision Q2 (no Cloudflare Access needed).
 */
import type { Context } from 'hono';
import type { Env } from './db';

const SESSION_COOKIE = 'admin_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
// PBKDF2-SHA256 — scrypt is NOT supported by workerd's Web Crypto, PBKDF2 is.
const PBKDF2_ITERATIONS = 600_000;
const FORMAT = `pbkdf2$${PBKDF2_ITERATIONS}`;

export function parseCookies(header: string | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(val);
  }
  return out;
}

function b64encode(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function b64decode(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function hashPassword(password: string, saltB64?: string): Promise<string> {
  const salt = saltB64
    ? b64decode(saltB64)
    : crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    256
  );
  return `${FORMAT}$${b64encode(salt)}$${b64encode(new Uint8Array(bits))}`;
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2' || !parts[2]) return false;
  const iterations = Number(parts[1]);
  if (!Number.isFinite(iterations) || iterations <= 0 || iterations > 5_000_000) return false;
  try {
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(password),
      'PBKDF2',
      false,
      ['deriveBits']
    );
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: b64decode(parts[2]) as BufferSource, iterations, hash: 'SHA-256' },
      keyMaterial,
      256
    );
    const actual = `${FORMAT.split('$')[0]}$${iterations}$${parts[2]}$${b64encode(new Uint8Array(bits))}`;
    return safeEqual(actual, stored);
  } catch {
    return false;
  }
}

export async function createSession(env: Env, adminUserId: string): Promise<string> {
  const id = crypto.randomUUID();
  const expires = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  await env.DB.prepare(
    'INSERT INTO sessions (id, admin_user_id, expires_at, created_at) VALUES (?, ?, ?, datetime(\'now\'))'
  ).bind(id, adminUserId, expires).run();
  return id;
}

export async function getSessionUserId(env: Env, sessionId: string): Promise<string | null> {
  const row = await env.DB
    .prepare('SELECT admin_user_id, expires_at FROM sessions WHERE id = ?')
    .bind(sessionId)
    .first<{ admin_user_id: string; expires_at: string }>();
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(sessionId).run();
    return null;
  }
  return row.admin_user_id;
}

export function sessionCookieHeader(sessionId: string, env: Env): string {
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  const secure = env.ENVIRONMENT === 'production' ? '; Secure' : '';
  return `${SESSION_COOKIE}=${sessionId}; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}; HttpOnly`;
}

export function clearSessionCookieHeader(): string {
  return `${SESSION_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}

// Hono middleware: require a valid admin session, else 401.
// Hono v4: middleware must return the Response or await next().
export async function requireAdmin(c: Context, next: () => Promise<void>): Promise<Response | void> {
  const cookies = parseCookies(c.req.header('cookie'));
  const sessionId = cookies[SESSION_COOKIE];
  const userId = sessionId ? await getSessionUserId(c.env as Env, sessionId) : null;
  if (!userId) {
    return c.json({ error: 'Authentication required' }, 401);
  }
  c.set('adminUserId', userId);
  await next();
}

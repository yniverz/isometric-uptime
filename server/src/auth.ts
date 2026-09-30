import crypto from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { config } from './config.js';

export const COOKIE = 'iu_session';

// Sessions are bound to the current password: changing ADMIN_PASSWORD logs everyone out.
const signingKey = crypto.createHash('sha256').update(`${config.auth.sessionSecret}|${config.auth.username}|${config.auth.password}`).digest();

function sign(payload: string): string {
  return crypto.createHmac('sha256', signingKey).update(payload).digest('base64url');
}

export function createSession(user: string): { value: string; maxAge: number } {
  const maxAge = config.auth.sessionDays * 86400;
  const exp = Date.now() + maxAge * 1000;
  const payload = `${Buffer.from(user).toString('base64url')}.${exp}`;
  return { value: `${payload}.${sign(payload)}`, maxAge };
}

function verifySession(value: string | undefined): string | null {
  if (!value) return null;
  const parts = value.split('.');
  if (parts.length !== 3) return null;
  const payload = `${parts[0]}.${parts[1]}`;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(parts[2]);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
  if (Number(parts[1]) < Date.now()) return null;
  return Buffer.from(parts[0], 'base64url').toString();
}

function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export function checkCredentials(username: string, password: string): boolean {
  // Evaluate both to keep timing uniform.
  const u = safeEqual(username ?? '', config.auth.username);
  const p = safeEqual(password ?? '', config.auth.password);
  return u && p;
}

export interface Access {
  user: string | null;
  canRead: boolean;
  canEdit: boolean;
}

export function access(req: FastifyRequest): Access {
  if (!config.auth.enabled) return { user: 'admin', canRead: true, canEdit: true };
  const user = verifySession(req.cookies[COOKIE]);
  return { user, canRead: !!user || config.auth.publicRead, canEdit: !!user };
}

export function requireRead(req: FastifyRequest, reply: FastifyReply): boolean {
  if (access(req).canRead) return true;
  reply.code(401).send({ error: 'Login required' });
  return false;
}

export function requireEdit(req: FastifyRequest, reply: FastifyReply): boolean {
  if (access(req).canEdit) return true;
  reply.code(401).send({ error: 'Login required' });
  return false;
}

/** Tiny in-memory limiter for login attempts: 10/min per IP and 60/min overall. */
const attempts = new Map<string, { count: number; reset: number }>();
const globalLimit = { count: 0, reset: 0 };
export function loginAllowed(ip: string): boolean {
  const now = Date.now();
  if (globalLimit.reset < now) {
    globalLimit.count = 0;
    globalLimit.reset = now + 60_000;
  }
  if (++globalLimit.count > 60) return false;
  if (attempts.size > 10_000) for (const [k, v] of attempts) if (v.reset < now) attempts.delete(k);
  const a = attempts.get(ip);
  if (!a || a.reset < now) {
    attempts.set(ip, { count: 1, reset: now + 60_000 });
    return true;
  }
  a.count++;
  return a.count <= 10;
}

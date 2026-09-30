import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

function bool(v: string | undefined, def: boolean): boolean {
  if (v == null || v === '') return def;
  return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
}

const dataDir = path.resolve(process.env.DATA_DIR ?? './data');
fs.mkdirSync(dataDir, { recursive: true });

const kumaUrl = (process.env.KUMA_URL ?? '').trim().replace(/\/+$/, '');

/** Reads a persisted secret from the data dir or creates one. */
function persistedSecret(file: string, bytes = 32): string {
  const p = path.join(dataDir, file);
  try {
    const v = fs.readFileSync(p, 'utf8').trim();
    if (v) return v;
  } catch {
    /* create below */
  }
  const v = crypto.randomBytes(bytes).toString('base64url');
  fs.writeFileSync(p, v, { mode: 0o600 });
  return v;
}

const authEnabled = !bool(process.env.AUTH_DISABLED, false);
let adminPassword = process.env.ADMIN_PASSWORD ?? '';
let generatedPassword = false;
if (authEnabled && !adminPassword) {
  adminPassword = persistedSecret('admin-password.txt', 12);
  generatedPassword = true;
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  host: process.env.HOST ?? '0.0.0.0',
  dataDir,
  kuma: {
    url: kumaUrl,
    publicUrl: (process.env.KUMA_PUBLIC_URL || kumaUrl).replace(/\/+$/, ''),
    username: process.env.KUMA_USERNAME ?? '',
    password: process.env.KUMA_PASSWORD ?? '',
    totpSecret: (process.env.KUMA_TOTP_SECRET ?? '').replace(/\s+/g, ''),
    token: process.env.KUMA_TOKEN ?? '',
  },
  demo: bool(process.env.DEMO_MODE, !kumaUrl),
  auth: {
    enabled: authEnabled,
    username: process.env.ADMIN_USERNAME ?? 'admin',
    password: adminPassword,
    generatedPassword,
    publicRead: bool(process.env.PUBLIC_READ, false),
    sessionSecret: process.env.SESSION_SECRET || persistedSecret('session-secret.txt'),
    sessionDays: Number(process.env.SESSION_DAYS ?? 30),
  },
  /** Which proxies may set X-Forwarded-*: 'true', 'false', or a list (fastify syntax). */
  trustProxy: (() => {
    const v = (process.env.TRUST_PROXY ?? 'loopback,linklocal,uniquelocal').trim();
    if (v === 'true') return true;
    if (v === 'false' || v === '') return false;
    return v;
  })() as boolean | string,
  /** CSP frame-ancestors, e.g. "'self' https://dash.example.com" to allow embedding. */
  frameAncestors: process.env.FRAME_ANCESTORS || "'self'",
  version: process.env.APP_VERSION ?? '0.1.0',
};

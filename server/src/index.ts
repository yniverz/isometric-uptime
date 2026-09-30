import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import { config } from './config.js';
import { access, checkCredentials, COOKIE, createSession, loginAllowed, requireEdit, requireRead } from './auth.js';
import { getWorldHistory, listWorldHistory, loadWorld, pruneEvents, queryEvents, saveWorld } from './db.js';
import { StatusStore } from './store.js';
import { KumaSource } from './sources/kuma.js';
import { DemoSource } from './sources/demo.js';
import type { MonitorSource } from './sources/types.js';
import { buildDemo } from './demoWorld.js';
import { emptyWorld, normalizeWorld, validateWorld, type World } from '../../shared/model.js';
import type { MonitorDTO, SessionDTO } from '../../shared/status.js';

const here = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const store = new StatusStore();
let source: MonitorSource;
if (config.demo) {
  source = new DemoSource(buildDemo().monitors);
  console.log('[boot] demo mode – serving fake monitors');
} else {
  source = new KumaSource({
    url: config.kuma.url,
    username: config.kuma.username,
    password: config.kuma.password,
    totpSecret: config.kuma.totpSecret,
  });
  console.log(`[boot] connecting to Uptime Kuma at ${config.kuma.url}`);
}
store.attach(source);

let world: { version: number; data: World };
{
  const stored = loadWorld();
  if (stored) {
    world = { version: stored.version, data: normalizeWorld(stored.data as World) };
  } else {
    world = { version: 1, data: config.demo ? buildDemo().world : emptyWorld() };
    saveWorld(world.data, world.version);
  }
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

const app = Fastify({ logger: false, bodyLimit: 20 * 1024 * 1024, trustProxy: config.trustProxy });
await app.register(fastifyCookie);

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  `frame-ancestors ${config.frameAncestors}`,
].join('; ');

app.addHook('onRequest', async (req, reply) => {
  reply.header('x-content-type-options', 'nosniff');
  reply.header('referrer-policy', 'same-origin');
  reply.header('content-security-policy', CSP);
  reply.header('cross-origin-opener-policy', 'same-origin');
  // Defence in depth against CSRF (on top of SameSite cookies and JSON-only bodies):
  // browsers mark requests coming from another site. Unlike comparing Origin with
  // Host, this keeps working behind reverse proxies that rewrite the Host header.
  if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS') {
    if (req.headers['sec-fetch-site'] === 'cross-site') return reply.code(403).send({ error: 'Cross-site request rejected' });
  }
});

app.get('/healthz', async () => ({ ok: true, source: source.state.state }));

app.get('/api/session', async (req): Promise<SessionDTO> => {
  const a = access(req);
  return {
    authEnabled: config.auth.enabled,
    authenticated: !!a.user,
    canRead: a.canRead,
    canEdit: a.canEdit,
    user: a.user ?? undefined,
    demo: config.demo,
    kumaUrl: config.demo || !a.canRead ? undefined : config.kuma.publicUrl,
    version: config.version,
  };
});

app.post<{ Body: { username?: string; password?: string } }>('/api/login', async (req, reply) => {
  if (!config.auth.enabled) return { ok: true };
  if (!loginAllowed(req.ip)) return reply.code(429).send({ error: 'Too many attempts, try again in a minute' });
  const { username = '', password = '' } = req.body ?? {};
  if (!checkCredentials(username, password)) return reply.code(401).send({ error: 'Invalid username or password' });
  const s = createSession(username);
  reply.setCookie(COOKIE, s.value, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: req.protocol === 'https',
    maxAge: s.maxAge,
  });
  return { ok: true };
});

app.post('/api/logout', async (_req, reply) => {
  reply.clearCookie(COOKIE, { path: '/' });
  return { ok: true };
});

app.get('/api/world', async (req, reply) => {
  if (!requireRead(req, reply)) return;
  return { version: world.version, world: world.data };
});

app.put<{ Body: { version: number; world: World; force?: boolean } }>('/api/world', async (req, reply) => {
  if (!requireEdit(req, reply)) return;
  const body = req.body;
  if (!body || typeof body !== 'object') return reply.code(400).send({ error: 'Invalid body' });
  if (!body.force && body.version !== world.version) {
    return reply.code(409).send({ error: 'The world was changed elsewhere', version: world.version });
  }
  const normalized = normalizeWorld(body.world);
  const err = validateWorld(normalized);
  if (err) return reply.code(400).send({ error: err });
  world = { version: world.version + 1, data: normalized };
  saveWorld(world.data, world.version);
  broadcast('world', { version: world.version });
  return { version: world.version };
});

app.get('/api/world/history', async (req, reply) => {
  if (!requireEdit(req, reply)) return;
  return listWorldHistory();
});

app.get<{ Params: { version: string } }>('/api/world/history/:version', async (req, reply) => {
  if (!requireEdit(req, reply)) return;
  const data = getWorldHistory(Number(req.params.version));
  if (!data) return reply.code(404).send({ error: 'Not found' });
  return { world: data };
});

app.get('/api/demo-world', async (req, reply) => {
  if (!requireEdit(req, reply)) return;
  return { world: buildDemo().world };
});

app.get('/api/monitors', async (req, reply) => {
  if (!requireRead(req, reply)) return;
  return { source: source.state, monitors: store.list() };
});

app.get<{ Params: { id: string }; Querystring: { hours?: string } }>('/api/monitors/:id/beats', async (req, reply) => {
  if (!requireRead(req, reply)) return;
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 0) return reply.code(400).send({ error: 'Invalid monitor id' });
  const hours = Math.min(Math.max(Number(req.query.hours ?? 24), 1), 24 * 30);
  try {
    const beats = await source.getBeats(id, hours);
    return { beats: beats.map((b) => [b.time, b.status, b.ping]) };
  } catch {
    return { beats: store.cached(id).map((b) => [b.time, b.status, b.ping]), cached: true };
  }
});

app.get<{ Querystring: { monitors?: string; limit?: string; before?: string } }>('/api/events', async (req, reply) => {
  if (!requireRead(req, reply)) return;
  const monitorIds = req.query.monitors
    ? req.query.monitors
        .split(',')
        .map(Number)
        .filter((n) => Number.isInteger(n))
        .slice(0, 500)
    : undefined;
  return {
    events: queryEvents({ monitorIds, limit: Number(req.query.limit ?? 50), before: req.query.before ? Number(req.query.before) : undefined }),
  };
});

// ---------------------------------------------------------------------------
// Live stream (Server-Sent Events)
// ---------------------------------------------------------------------------

type Client = { write: (event: string, data: unknown) => void };
const clients = new Set<Client>();

function broadcast(event: string, data: unknown) {
  for (const c of clients) c.write(event, data);
}

store.on('monitors', (dtos: MonitorDTO[]) => broadcast('monitors', dtos));
store.on('removed', (ids: number[]) => broadcast('removed', ids));
store.on('source', (s) => broadcast('source', s));

app.get('/api/stream', (req, reply) => {
  if (!requireRead(req, reply)) return;
  if (clients.size >= 500) return reply.code(503).send({ error: 'Too many live connections' });
  reply.hijack();
  const res = reply.raw;
  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  });
  const client: Client = {
    write(event, data) {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    },
  };
  client.write('snapshot', { source: source.state, monitors: store.list(), worldVersion: world.version });
  clients.add(client);
  const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
  req.raw.on('close', () => {
    clearInterval(ping);
    clients.delete(client);
  });
});

// ---------------------------------------------------------------------------
// Static web app
// ---------------------------------------------------------------------------

const webCandidates = [process.env.WEB_DIR, path.resolve(here, '../../web'), path.resolve(here, '../../build/web')].filter(Boolean) as string[];
const webDir = webCandidates.find((d) => fs.existsSync(path.join(d, 'index.html')));
if (webDir) {
  await app.register(fastifyStatic, { root: webDir, wildcard: false });
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api/')) return reply.code(404).send({ error: 'Not found' });
    return reply.sendFile('index.html');
  });
} else {
  console.warn('[boot] web build not found – API only (run `npm run build:web` or use the Vite dev server)');
}

// ---------------------------------------------------------------------------

source.start();
pruneEvents();
setInterval(pruneEvents, 24 * 3600_000).unref();

await app.listen({ port: config.port, host: config.host });
console.log(`[boot] isometric-uptime ${config.version} listening on http://${config.host}:${config.port}`);
if (config.auth.enabled && config.auth.generatedPassword) {
  console.log(`[boot] no ADMIN_PASSWORD set – generated one. Login: ${config.auth.username} / ${config.auth.password}`);
  console.log(`[boot] (stored in ${path.join(config.dataDir, 'admin-password.txt')})`);
}
if (!config.auth.enabled) console.log('[boot] AUTH_DISABLED=true – everyone can view and edit');

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, async () => {
    source.stop();
    await app.close();
    process.exit(0);
  });
}

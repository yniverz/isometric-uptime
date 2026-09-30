import { EventEmitter } from 'node:events';
import { io, type Socket } from 'socket.io-client';
import { kumaStatus, type Heartbeat, type SourceState } from '../../../shared/status.js';
import type { MonitorInfo, MonitorSource } from './types.js';
import { totp } from './totp.js';

export interface KumaOptions {
  url: string;
  username: string;
  password: string;
  totpSecret?: string;
}

type AuthMode = 'unknown' | 'better-auth' | 'legacy';

/** Kuma stores times as UTC "YYYY-MM-DD HH:mm:ss.SSS" without a zone designator. */
export function parseKumaTime(t: unknown): number {
  if (typeof t === 'number') return t;
  const s = String(t ?? '');
  if (!s) return Date.now();
  if (/[zZ]$|[+-]\d\d:?\d\d$/.test(s)) return Date.parse(s);
  return Date.parse(s.replace(' ', 'T') + 'Z');
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function normalizeBeat(raw: any, fallbackId?: number): Heartbeat {
  return {
    monitorId: Number(raw.monitorID ?? raw.monitor_id ?? fallbackId),
    status: kumaStatus(Number(raw.status)),
    time: parseKumaTime(raw.time),
    ping: raw.ping == null ? null : Number(raw.ping),
    msg: String(raw.msg ?? ''),
    important: raw.important === true || raw.important === 1 || raw.important === '1',
  };
}

function normalizeMonitor(m: any): MonitorInfo & { maintenance?: boolean } {
  const url = typeof m.url === 'string' && m.url && m.url !== 'https://' && m.url !== 'http://' ? m.url : null;
  return {
    id: Number(m.id),
    name: String(m.name ?? `Monitor ${m.id}`),
    type: String(m.type ?? 'unknown'),
    pathName: m.pathName ?? m.name,
    parent: m.parent ?? null,
    url,
    hostname: m.hostname ?? null,
    port: m.port ?? null,
    description: m.description ?? null,
    active: m.active === undefined ? true : !!m.active && !m.forceInactive,
    tags: Array.isArray(m.tags) ? m.tags.map((t: any) => ({ name: String(t.name ?? ''), value: t.value ?? null, color: t.color })) : [],
    interval: m.interval ?? null,
    maintenance: !!m.maintenance,
  };
}

/**
 * Talks to Uptime Kuma the same way its own web UI does: over Socket.IO.
 *
 *  - Kuma >= 2.5 authenticates with better-auth: an HTTP sign-in returns a
 *    session cookie which is then presented on the socket handshake.
 *  - Kuma 1.x / 2.0-2.4 authenticate with a `login` socket event.
 *
 * Both are detected automatically.
 */
export class KumaSource extends EventEmitter implements MonitorSource {
  state: SourceState;
  private socket: Socket | null = null;
  private cookie: string | null = null;
  private authMode: AuthMode = 'unknown';
  private stopped = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private backoff = 2000;
  private freshLogin = false;
  private readonly origin: string;

  constructor(private opts: KumaOptions) {
    super();
    this.origin = new URL(opts.url).origin;
    this.state = { mode: 'kuma', state: 'connecting', url: opts.url };
  }

  start(): void {
    this.stopped = false;
    void this.connect();
  }

  stop(): void {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.socket?.removeAllListeners();
    this.socket?.disconnect();
    this.socket = null;
  }

  private setState(state: SourceState['state'], message?: string) {
    this.state = { mode: 'kuma', state, message, url: this.opts.url } as SourceState;
    this.emit('state', this.state);
  }

  private scheduleReconnect(reason: string) {
    if (this.stopped || this.reconnectTimer) return;
    const delay = this.backoff;
    this.backoff = Math.min(this.backoff * 2, 60_000);
    console.warn(`[kuma] ${reason} – reconnecting in ${Math.round(delay / 1000)}s`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, delay);
  }

  // -------------------------------------------------------------------------
  // better-auth HTTP login (Kuma >= 2.5)
  // -------------------------------------------------------------------------

  private collectCookies(res: Response, jar: Map<string, string>) {
    const setCookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
    for (const c of setCookies) {
      const [pair] = c.split(';');
      const idx = pair.indexOf('=');
      if (idx > 0) jar.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
    }
  }

  private jarToHeader(jar: Map<string, string>): string {
    return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  /** Returns true when logged in via better-auth, false when the server is a legacy Kuma. */
  private async httpLogin(): Promise<boolean> {
    const jar = new Map<string, string>();
    const headers = { 'content-type': 'application/json', origin: this.origin, accept: 'application/json' };
    const res = await fetch(`${this.opts.url}/api/auth/sign-in/username`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ username: this.opts.username, password: this.opts.password, rememberMe: true }),
      redirect: 'manual',
    });
    const ctype = res.headers.get('content-type') ?? '';
    if (res.status === 404 || !ctype.includes('json')) return false;
    const body: any = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Kuma login failed: ${body?.message ?? res.status}`);
    this.collectCookies(res, jar);

    if (body?.twoFactorRedirect) {
      if (!this.opts.totpSecret) throw new Error('Kuma account requires 2FA – set KUMA_TOTP_SECRET');
      const res2 = await fetch(`${this.opts.url}/api/auth/two-factor/verify-totp`, {
        method: 'POST',
        headers: { ...headers, cookie: this.jarToHeader(jar) },
        body: JSON.stringify({ code: totp(this.opts.totpSecret) }),
        redirect: 'manual',
      });
      const body2: any = await res2.json().catch(() => ({}));
      if (!res2.ok) throw new Error(`Kuma 2FA failed: ${body2?.message ?? res2.status}`);
      this.collectCookies(res2, jar);
    }
    this.cookie = this.jarToHeader(jar);
    return true;
  }

  // -------------------------------------------------------------------------
  // Socket
  // -------------------------------------------------------------------------

  private async connect(): Promise<void> {
    if (this.stopped) return;
    this.setState('connecting');
    this.socket?.removeAllListeners();
    this.socket?.disconnect();
    this.socket = null;

    try {
      if (this.authMode !== 'legacy' && !this.cookie && this.opts.username) {
        const ok = await this.httpLogin();
        this.authMode = ok ? 'better-auth' : 'legacy';
        this.freshLogin = ok;
        if (ok) console.log('[kuma] signed in (better-auth session)');
        else console.log('[kuma] legacy Kuma detected – using socket login');
      }
    } catch (err) {
      this.setState('error', (err as Error).message);
      this.scheduleReconnect((err as Error).message);
      return;
    }

    const socket = io(this.opts.url, {
      transports: ['websocket'],
      reconnection: false,
      timeout: 15_000,
      extraHeaders: this.cookie ? { cookie: this.cookie } : undefined,
    });
    this.socket = socket;

    socket.on('connect', () => {
      console.log('[kuma] socket connected');
      if (this.authMode === 'legacy' && this.opts.username) this.legacyLogin();
    });

    socket.on('connect_error', (err) => {
      this.setState('error', `Cannot connect to Kuma: ${err.message}`);
      this.scheduleReconnect(err.message);
    });

    socket.on('disconnect', (reason) => {
      this.loginInFlight = false;
      if (this.stopped) return;
      this.setState('disconnected', `Disconnected: ${reason}`);
      this.scheduleReconnect(`disconnected (${reason})`);
    });

    // Kuma >= 2.5: a valid cookie session is announced with "session".
    socket.on('session', (username: string) => {
      console.log(`[kuma] session active for ${username}`);
      this.onLoggedIn();
    });

    socket.on('loginRequired', () => {
      if (this.authMode === 'legacy') {
        if (this.opts.username) this.legacyLogin();
        else this.setState('error', 'Kuma requires login – set KUMA_USERNAME and KUMA_PASSWORD');
        return;
      }
      if (!this.opts.username) {
        this.setState('error', 'Kuma requires login – set KUMA_USERNAME and KUMA_PASSWORD');
        return;
      }
      if (this.freshLogin) {
        this.setState('error', 'Kuma did not accept the session cookie');
        this.freshLogin = false;
        this.cookie = null;
        this.scheduleReconnect('session rejected');
        return;
      }
      // Session expired: sign in again.
      this.cookie = null;
      socket.disconnect();
    });

    // Legacy "disable auth"
    socket.on('autoLogin', () => this.onLoggedIn());

    socket.on('monitorList', (list: Record<string, any>) => {
      this.onLoggedIn();
      this.emit('monitors', Object.values(list ?? {}).map(normalizeMonitor));
    });
    socket.on('updateMonitorIntoList', (list: Record<string, any>) => {
      for (const m of Object.values(list ?? {})) this.emit('monitorUpdate', normalizeMonitor(m));
    });
    socket.on('deleteMonitorFromList', (id: number) => this.emit('monitorDelete', Number(id)));

    socket.on('heartbeatList', (monitorId: number, data: any[], overwrite: boolean) => {
      const beats = (data ?? []).map((b) => normalizeBeat(b, Number(monitorId)));
      this.emit('beats', Number(monitorId), beats, !!overwrite);
    });
    socket.on('importantHeartbeatList', (monitorId: number, data: any[]) => {
      const beats = (data ?? []).map((b) => ({ ...normalizeBeat(b, Number(monitorId)), important: true }));
      this.emit('important', Number(monitorId), beats);
    });
    socket.on('heartbeat', (raw: any) => this.emit('beat', normalizeBeat(raw)));
    socket.on('avgPing', (id: number, avgPing: number | null) => this.emit('meta', Number(id), { avgPing }));
    socket.on('uptime', (id: number, period: number | string, value: number) => {
      if (period === 24 || period === '24') this.emit('meta', Number(id), { uptime24: value });
      else if (period === 720 || period === '720') this.emit('meta', Number(id), { uptime720: value });
    });
    socket.on('certInfo', (id: number, infoJson: string) => {
      try {
        const info = typeof infoJson === 'string' ? JSON.parse(infoJson) : infoJson;
        const ci = info?.certInfo;
        this.emit('meta', Number(id), {
          cert: {
            valid: !!info?.valid,
            daysRemaining: ci?.daysRemaining,
            issuer: ci?.issuer?.O ?? ci?.issuer?.CN,
            subject: ci?.subject?.CN,
          },
        });
      } catch {
        /* ignore */
      }
    });
  }

  private onLoggedIn() {
    if (this.state.state !== 'connected') {
      this.backoff = 2000;
      this.freshLogin = false;
      this.setState('connected');
    }
  }

  private loginInFlight = false;

  private legacyLogin() {
    if (this.loginInFlight || this.state.state === 'connected') return;
    this.loginInFlight = true;
    const token = this.opts.totpSecret ? totp(this.opts.totpSecret) : '';
    this.socket?.emit(
      'login',
      { username: this.opts.username, password: this.opts.password, token },
      (res: { ok: boolean; msg?: string; tokenRequired?: boolean }) => {
        this.loginInFlight = false;
        if (res?.ok) {
          console.log('[kuma] logged in (legacy socket login)');
          this.onLoggedIn();
        } else if (res?.tokenRequired) {
          this.setState('error', 'Kuma account requires 2FA – set KUMA_TOTP_SECRET');
        } else {
          this.setState('error', `Kuma login failed: ${res?.msg ?? 'unknown error'}`);
        }
      },
    );
  }

  getBeats(monitorId: number, hours: number): Promise<Heartbeat[]> {
    return new Promise((resolve, reject) => {
      if (!this.socket?.connected) return reject(new Error('Not connected to Kuma'));
      const timer = setTimeout(() => reject(new Error('Kuma did not answer in time')), 15_000);
      this.socket.emit('getMonitorBeats', monitorId, hours, (res: { ok: boolean; data?: any[]; msg?: string }) => {
        clearTimeout(timer);
        if (!res?.ok) return reject(new Error(res?.msg ?? 'Failed to fetch beats'));
        resolve((res.data ?? []).map((b) => normalizeBeat(b, monitorId)));
      });
    });
  }
}

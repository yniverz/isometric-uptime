import { EventEmitter } from 'node:events';
import type { Heartbeat, SourceState, Status } from '../../../shared/status.js';
import type { MonitorInfo, MonitorSource } from './types.js';

const INTERVAL_MS = 20_000;
const MESSAGES_DOWN = ['Request timed out', 'connect ECONNREFUSED', 'getaddrinfo ENOTFOUND', '503 Service Unavailable', 'No response to ICMP echo'];

/** Deterministic PRNG so the demo history looks the same on every start. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A fake monitor source that produces believable heartbeats and the
 * occasional incident, so the UI can be explored without Uptime Kuma.
 */
export class DemoSource extends EventEmitter implements MonitorSource {
  state: SourceState = { mode: 'demo', state: 'connected', message: 'Demo mode – no Uptime Kuma configured' };
  private timers: NodeJS.Timeout[] = [];
  private history = new Map<number, Heartbeat[]>();
  /** monitorId -> timestamp until which it is down */
  private incidents = new Map<number, { until: number; status: Status; msg: string }>();
  private rand = mulberry32(42);
  private basePing = new Map<number, number>();

  constructor(private monitors: MonitorInfo[]) {
    super();
  }

  start(): void {
    const now = Date.now();
    for (const m of this.monitors) this.basePing.set(m.id, 5 + Math.floor(this.rand() * 80));

    // Generate 24h of history with a few historic incidents.
    for (const m of this.monitors) {
      const beats: Heartbeat[] = [];
      const count = Math.floor((24 * 3600_000) / (INTERVAL_MS * 9)); // sparse: one beat per 3 min
      let prev: Status = 'up';
      const incidentAt = this.rand() < 0.35 ? Math.floor(this.rand() * count) : -1;
      const incidentLen = 2 + Math.floor(this.rand() * 8);
      for (let i = 0; i < count; i++) {
        const time = now - (count - i) * INTERVAL_MS * 9;
        const status: Status = i >= incidentAt && i < incidentAt + incidentLen && incidentAt >= 0 ? 'down' : 'up';
        beats.push(this.makeBeat(m.id, status, time, status !== prev));
        prev = status;
      }
      this.history.set(m.id, beats);
    }

    // Some initial trouble to look at.
    const byName = (n: string) => this.monitors.find((m) => m.name === n)?.id;
    const printer = byName('Brother Laser');
    if (printer) this.incidents.set(printer, { until: now + 3600_000 * 24, status: 'down', msg: 'No response to ICMP echo' });
    const paperless = byName('Paperless');
    if (paperless) this.incidents.set(paperless, { until: now + 90_000, status: 'down', msg: '502 Bad Gateway' });
    const pbs = byName('Proxmox Backup');
    if (pbs) this.incidents.set(pbs, { until: now + 600_000, status: 'maintenance', msg: 'Scheduled maintenance' });

    queueMicrotask(() => {
      this.emit('monitors', this.monitors);
      for (const m of this.monitors) {
        const list = this.history.get(m.id)!;
        const inc = this.incidents.get(m.id);
        if (inc) list.push(this.makeBeat(m.id, inc.status, now, true, inc.msg));
        else list.push(this.makeBeat(m.id, 'up', now, false));
        this.emit('beats', m.id, list.slice(-100), true);
        this.emitStats(m.id);
      }
    });

    // Live heartbeats, spread over the interval.
    this.monitors.forEach((m, i) => {
      const offset = (i * INTERVAL_MS) / this.monitors.length;
      const t = setTimeout(() => {
        this.beat(m.id);
        this.timers.push(setInterval(() => this.beat(m.id), INTERVAL_MS));
      }, offset);
      this.timers.push(t);
    });

    // Random incidents.
    this.timers.push(
      setInterval(() => {
        if (this.incidents.size > 4) return;
        const m = this.monitors[Math.floor(Math.random() * this.monitors.length)];
        if (this.incidents.has(m.id)) return;
        const roll = Math.random();
        const status: Status = roll < 0.7 ? 'down' : roll < 0.85 ? 'pending' : 'maintenance';
        const msg = status === 'maintenance' ? 'Scheduled maintenance' : MESSAGES_DOWN[Math.floor(Math.random() * MESSAGES_DOWN.length)];
        this.incidents.set(m.id, { until: Date.now() + 30_000 + Math.random() * 90_000, status, msg });
        this.beat(m.id);
      }, 25_000),
    );
  }

  stop(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
  }

  private makeBeat(monitorId: number, status: Status, time: number, important: boolean, msg?: string): Heartbeat {
    const base = this.basePing.get(monitorId) ?? 20;
    const ping = status === 'up' ? Math.round(base + this.rand() * base * 0.6 + (this.rand() < 0.05 ? base * 3 : 0)) : null;
    return { monitorId, status, time, ping, msg: msg ?? (status === 'up' ? (ping ? `${ping} ms` : 'OK') : 'Down'), important };
  }

  private beat(monitorId: number) {
    const list = this.history.get(monitorId) ?? [];
    const prev = list[list.length - 1]?.status ?? 'up';
    let status: Status = 'up';
    let msg: string | undefined;
    const inc = this.incidents.get(monitorId);
    if (inc) {
      if (inc.until < Date.now()) this.incidents.delete(monitorId);
      else {
        status = inc.status;
        msg = inc.msg;
      }
    }
    const beat = this.makeBeat(monitorId, status, Date.now(), status !== prev, msg);
    list.push(beat);
    if (list.length > 600) list.splice(0, list.length - 600);
    this.history.set(monitorId, list);
    this.emit('beat', beat);
    if (beat.important || Math.random() < 0.1) this.emitStats(monitorId);
  }

  private emitStats(monitorId: number) {
    const list = this.history.get(monitorId) ?? [];
    const up = list.filter((b) => b.status === 'up' || b.status === 'maintenance').length;
    const pings = list.filter((b) => b.ping != null).map((b) => b.ping!);
    this.emit('meta', monitorId, {
      uptime24: list.length ? up / list.length : null,
      uptime720: list.length ? Math.min(1, up / list.length + 0.004) : null,
      avgPing: pings.length ? Math.round(pings.reduce((a, b) => a + b, 0) / pings.length) : null,
    });
  }

  async getBeats(monitorId: number, hours: number): Promise<Heartbeat[]> {
    const since = Date.now() - hours * 3600_000;
    return (this.history.get(monitorId) ?? []).filter((b) => b.time >= since);
  }
}

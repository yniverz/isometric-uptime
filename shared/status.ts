/** Status vocabulary shared by server and web. */

export type Status = 'up' | 'down' | 'pending' | 'maintenance' | 'paused' | 'unknown';
/** Roll-up status adds "degraded": the thing itself is fine but something inside it is not. */
export type RollupStatus = Status | 'degraded';

/** Uptime Kuma numeric status codes. */
export function kumaStatus(code: number | null | undefined): Status {
  switch (code) {
    case 0:
      return 'down';
    case 1:
      return 'up';
    case 2:
      return 'pending';
    case 3:
      return 'maintenance';
    default:
      return 'unknown';
  }
}

const SEVERITY: Record<RollupStatus, number> = {
  down: 6,
  degraded: 5,
  pending: 4,
  maintenance: 3,
  up: 2,
  paused: 1,
  unknown: 0,
};

export function severity(s: RollupStatus): number {
  return SEVERITY[s] ?? 0;
}

export function worst(a: RollupStatus, b: RollupStatus): RollupStatus {
  return severity(a) >= severity(b) ? a : b;
}

export const STATUS_LABEL: Record<RollupStatus, string> = {
  up: 'Up',
  down: 'Down',
  pending: 'Pending',
  maintenance: 'Maintenance',
  paused: 'Paused',
  unknown: 'Unknown',
  degraded: 'Degraded',
};

/** Compact heartbeat: [unix ms, status, ping ms | null] */
export type BeatTuple = [number, Status, number | null];

export interface Heartbeat {
  monitorId: number;
  status: Status;
  time: number;
  ping: number | null;
  msg: string;
  important: boolean;
}

export interface MonitorDTO {
  id: number;
  name: string;
  type: string;
  pathName?: string;
  parent?: number | null;
  url?: string | null;
  hostname?: string | null;
  port?: number | null;
  description?: string | null;
  active: boolean;
  maintenance?: boolean;
  tags: { name: string; value?: string | null; color?: string }[];
  status: Status;
  lastBeat?: number | null;
  lastChange?: number | null;
  ping?: number | null;
  avgPing?: number | null;
  msg?: string | null;
  uptime24?: number | null;
  uptime720?: number | null;
  cert?: { valid: boolean; daysRemaining?: number; issuer?: string; subject?: string } | null;
  interval?: number | null;
  /** The most recent heartbeats, oldest first. */
  beats: BeatTuple[];
}

export type SourceState =
  | { mode: 'demo'; state: 'connected'; message?: string }
  | { mode: 'kuma'; state: 'connecting' | 'connected' | 'error' | 'disconnected'; message?: string; url?: string };

export interface EventDTO {
  id: number;
  monitorId: number;
  status: Status;
  time: number;
  msg: string;
}

export interface SessionDTO {
  authEnabled: boolean;
  authenticated: boolean;
  canRead: boolean;
  canEdit: boolean;
  user?: string;
  demo: boolean;
  kumaUrl?: string;
  version: string;
}

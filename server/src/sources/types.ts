import type { EventEmitter } from 'node:events';
import type { Heartbeat, MonitorDTO, SourceState } from '../../../shared/status.js';

/** Static-ish monitor information as reported by the source. */
export type MonitorInfo = Omit<MonitorDTO, 'status' | 'beats' | 'lastBeat' | 'lastChange' | 'ping' | 'msg'>;

/**
 * A source of monitors and heartbeats. Uptime Kuma today; other sources
 * (Prometheus, Zabbix, a push agent, ...) can implement the same interface.
 *
 * Events:
 *   'monitors'  (list: MonitorInfo[])           full monitor list replaced
 *   'monitorUpdate' (m: MonitorInfo)             one monitor added/changed
 *   'monitorDelete' (id: number)
 *   'important' (monitorId, beats: Heartbeat[])  historic status changes
 *   'beats'     (monitorId, beats: Heartbeat[], overwrite: boolean)
 *   'beat'      (beat: Heartbeat)                 live heartbeat
 *   'meta'      (monitorId, patch: Partial<MonitorInfo>)
 *   'state'     (state: SourceState)
 */
export interface MonitorSource extends EventEmitter {
  readonly state: SourceState;
  start(): void;
  stop(): void;
  /** Heartbeats for the last `hours` hours, oldest first. */
  getBeats(monitorId: number, hours: number): Promise<Heartbeat[]>;
}

import { EventEmitter } from 'node:events';
import type { BeatTuple, Heartbeat, MonitorDTO, SourceState, Status } from '../../shared/status.js';
import type { MonitorInfo, MonitorSource } from './sources/types.js';
import { recordEvent } from './db.js';

const KEEP_BEATS = 100;
const DTO_BEATS = 60;

interface Entry {
  info: MonitorInfo & { maintenance?: boolean };
  meta: Partial<MonitorDTO>;
  beats: Heartbeat[];
}

/**
 * Holds the live state of every monitor and fans changes out to listeners
 * (the SSE stream). Changes are coalesced and flushed in small batches.
 *
 * Events: 'monitors' (dtos: MonitorDTO[]), 'removed' (ids: number[]), 'source' (state)
 */
export class StatusStore extends EventEmitter {
  private entries = new Map<number, Entry>();
  private dirty = new Set<number>();
  private removed = new Set<number>();
  private flushTimer: NodeJS.Timeout | null = null;
  source!: MonitorSource;

  attach(source: MonitorSource) {
    this.source = source;
    source.on('state', (s: SourceState) => this.emit('source', s));

    source.on('monitors', (list: MonitorInfo[]) => {
      const seen = new Set<number>();
      for (const info of list) {
        seen.add(info.id);
        const e = this.entries.get(info.id);
        if (e) e.info = info;
        else this.entries.set(info.id, { info, meta: {}, beats: [] });
        this.touch(info.id);
      }
      for (const id of [...this.entries.keys()]) {
        if (!seen.has(id)) this.remove(id);
      }
    });
    source.on('monitorUpdate', (info: MonitorInfo) => {
      const e = this.entries.get(info.id);
      if (e) e.info = info;
      else this.entries.set(info.id, { info, meta: {}, beats: [] });
      this.touch(info.id);
    });
    source.on('monitorDelete', (id: number) => this.remove(id));

    source.on('beats', (monitorId: number, beats: Heartbeat[], overwrite: boolean) => {
      const e = this.ensure(monitorId);
      const merged = overwrite ? beats : [...e.beats, ...beats];
      merged.sort((a, b) => a.time - b.time);
      e.beats = dedupe(merged).slice(-KEEP_BEATS);
      for (const b of beats) if (b.important) recordEvent(b.monitorId, b.status, b.time, b.msg);
      this.touch(monitorId);
    });
    source.on('important', (monitorId: number, beats: Heartbeat[]) => {
      for (const b of beats) recordEvent(monitorId, b.status, b.time, b.msg);
    });
    source.on('beat', (b: Heartbeat) => {
      const e = this.ensure(b.monitorId);
      const prev = e.beats[e.beats.length - 1];
      e.beats.push(b);
      if (e.beats.length > KEEP_BEATS) e.beats.splice(0, e.beats.length - KEEP_BEATS);
      if (b.important || (prev && prev.status !== b.status)) recordEvent(b.monitorId, b.status, b.time, b.msg);
      this.touch(b.monitorId);
    });
    source.on('meta', (monitorId: number, patch: Partial<MonitorDTO>) => {
      const e = this.ensure(monitorId);
      Object.assign(e.meta, patch);
      this.touch(monitorId);
    });
  }

  private ensure(id: number): Entry {
    let e = this.entries.get(id);
    if (!e) {
      e = { info: { id, name: `Monitor ${id}`, type: 'unknown', active: true, tags: [] }, meta: {}, beats: [] };
      this.entries.set(id, e);
    }
    return e;
  }

  private remove(id: number) {
    this.entries.delete(id);
    this.dirty.delete(id);
    this.removed.add(id);
    this.scheduleFlush();
  }

  private touch(id: number) {
    this.dirty.add(id);
    this.scheduleFlush();
  }

  private scheduleFlush() {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      if (this.dirty.size) {
        const dtos = [...this.dirty].map((id) => this.dto(id)).filter((d): d is MonitorDTO => !!d);
        this.dirty.clear();
        this.emit('monitors', dtos);
      }
      if (this.removed.size) {
        this.emit('removed', [...this.removed]);
        this.removed.clear();
      }
    }, 300);
  }

  dto(id: number): MonitorDTO | null {
    const e = this.entries.get(id);
    if (!e) return null;
    const last = e.beats[e.beats.length - 1];
    let status: Status = last ? last.status : 'unknown';
    if (!e.info.active) status = 'paused';
    else if (e.info.maintenance && status !== 'down') status = 'maintenance';

    let lastChange: number | null = null;
    for (let i = e.beats.length - 1; i > 0; i--) {
      if (e.beats[i].status !== e.beats[i - 1].status) {
        lastChange = e.beats[i].time;
        break;
      }
    }
    if (lastChange == null && e.beats.length) lastChange = e.beats[0].time;

    const beats: BeatTuple[] = e.beats.slice(-DTO_BEATS).map((b) => [b.time, b.status, b.ping]);
    return {
      ...e.info,
      ...e.meta,
      status,
      lastBeat: last?.time ?? null,
      lastChange,
      ping: last?.ping ?? null,
      msg: last?.msg ?? null,
      beats,
    };
  }

  list(): MonitorDTO[] {
    return [...this.entries.keys()].map((id) => this.dto(id)!).sort((a, b) => a.name.localeCompare(b.name));
  }

  cached(id: number): Heartbeat[] {
    return this.entries.get(id)?.beats ?? [];
  }
}

function dedupe(beats: Heartbeat[]): Heartbeat[] {
  const out: Heartbeat[] = [];
  for (const b of beats) {
    const prev = out[out.length - 1];
    if (prev && prev.time === b.time) out[out.length - 1] = b;
    else out.push(b);
  }
  return out;
}

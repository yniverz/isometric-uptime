import type { World } from '../../../shared/model';
import type { BeatTuple, EventDTO, MonitorDTO, SessionDTO, SourceState } from '../../../shared/status';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown,
  ) {
    super(message);
  }
}

async function req<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(res.status, data?.error ?? res.statusText, data);
  return data as T;
}

export const api = {
  session: () => req<SessionDTO>('GET', '/api/session'),
  login: (username: string, password: string) => req<{ ok: boolean }>('POST', '/api/login', { username, password }),
  logout: () => req<{ ok: boolean }>('POST', '/api/logout', {}),
  world: () => req<{ version: number; world: World }>('GET', '/api/world'),
  saveWorld: (version: number, world: World, force = false) => req<{ version: number }>('PUT', '/api/world', { version, world, force }),
  demoWorld: () => req<{ world: World }>('GET', '/api/demo-world'),
  history: () => req<{ version: number; updatedAt: number; size: number }[]>('GET', '/api/world/history'),
  historyVersion: (v: number) => req<{ world: World }>('GET', `/api/world/history/${v}`),
  monitors: () => req<{ source: SourceState; monitors: MonitorDTO[] }>('GET', '/api/monitors'),
  beats: (id: number, hours: number) => req<{ beats: BeatTuple[]; cached?: boolean }>('GET', `/api/monitors/${id}/beats?hours=${hours}`),
  events: (monitorIds: number[] | null, limit = 50) =>
    req<{ events: EventDTO[] }>('GET', `/api/events?limit=${limit}${monitorIds ? `&monitors=${monitorIds.join(',')}` : ''}`),
};

export interface StreamHandlers {
  snapshot: (d: { source: SourceState; monitors: MonitorDTO[]; worldVersion: number }) => void;
  monitors: (d: MonitorDTO[]) => void;
  removed: (ids: number[]) => void;
  source: (s: SourceState) => void;
  world: (d: { version: number }) => void;
  open: () => void;
  error: () => void;
}

/** Server-Sent Events with automatic reconnect (EventSource handles it). */
export function openStream(h: StreamHandlers): () => void {
  const es = new EventSource('/api/stream');
  const on = <K extends keyof StreamHandlers>(name: K) =>
    es.addEventListener(name, (e) => {
      try {
        (h[name] as (d: unknown) => void)(JSON.parse((e as MessageEvent).data));
      } catch (err) {
        console.error('stream', name, err);
      }
    });
  on('snapshot');
  on('monitors');
  on('removed');
  on('source');
  on('world');
  es.onopen = () => h.open();
  es.onerror = () => h.error();
  return () => es.close();
}

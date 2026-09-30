import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { BeatTuple, EventDTO, MonitorDTO, RollupStatus } from '../../../shared/status';
import { STATUS_LABEL } from '../../../shared/status';
import { api } from '../state/api';
import { useStore } from '../state/store';
import type { Counts } from '../state/health';
import { ExternalLink, ShieldCheck, ShieldAlert } from 'lucide-react';

export function Dot({ status, pulse }: { status: RollupStatus; pulse?: boolean }) {
  return <span className={`dot st-${status} ${pulse ?? (status === 'down') ? 'pulse' : ''}`} />;
}

export function StatusPill({ status, label }: { status: RollupStatus; label?: string }) {
  return (
    <span className={`pill st-${status}`}>
      <Dot status={status} pulse={false} />
      {label ?? STATUS_LABEL[status]}
    </span>
  );
}

export function CountChips({ c, label }: { c: Counts; label?: string }) {
  const total = c.up + c.down + c.warn + c.other;
  if (!total) return <span className="muted small">none</span>;
  return (
    <span className="counts">
      {label && <span className="muted small">{label}</span>}
      <span className="count st-up" title="up">
        <Dot status="up" pulse={false} />
        {c.up}
      </span>
      {c.down > 0 && (
        <span className="count st-down" title="down">
          <Dot status="down" pulse={false} />
          {c.down}
        </span>
      )}
      {c.warn > 0 && (
        <span className="count st-pending" title="pending / maintenance">
          <Dot status="pending" pulse={false} />
          {c.warn}
        </span>
      )}
      {c.other > 0 && (
        <span className="count st-unknown" title="no data">
          <Dot status="unknown" pulse={false} />
          {c.other}
        </span>
      )}
    </span>
  );
}

export function Section({ title, right, children, className }: { title: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`section ${className ?? ''}`}>
      <header>
        <h3>{title}</h3>
        {right}
      </header>
      {children}
    </section>
  );
}

export function KV({ items }: { items: [string, ReactNode][] }) {
  const rows = items.filter(([, v]) => v != null && v !== '');
  if (!rows.length) return null;
  return (
    <dl className="kv">
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function timeAgo(t: number | null | undefined): string {
  if (!t) return '—';
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return `${Math.round(s)}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

export function duration(ms: number): string {
  const s = Math.max(0, ms / 1000);
  if (s < 60) return `${Math.round(s)}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${(s / 3600).toFixed(s < 36000 ? 1 : 0)}h`;
  return `${(s / 86400).toFixed(1)}d`;
}

export function pct(v: number | null | undefined): string {
  if (v == null) return '—';
  const p = v * 100;
  return `${p >= 99.995 ? '100' : p.toFixed(p >= 99 ? 2 : 1)}%`;
}

/** Row of recent heartbeats, like Uptime Kuma's. */
export function HeartbeatBar({ beats, max = 40 }: { beats: BeatTuple[]; max?: number }) {
  const list = beats.slice(-max);
  const pad = Math.max(0, max - list.length);
  return (
    <div className="hbbar" style={{ gridTemplateColumns: `repeat(${max}, 1fr)` }}>
      {Array.from({ length: pad }, (_, i) => (
        <span key={`p${i}`} className="hb empty" />
      ))}
      {list.map(([t, st, ping], i) => (
        <span key={i} className={`hb st-${st}`} title={`${new Date(t).toLocaleString()} · ${STATUS_LABEL[st]}${ping != null ? ` · ${ping} ms` : ''}`} />
      ))}
    </div>
  );
}

/** Response-time sparkline with downtime shading. */
export function Sparkline({ beats, height = 56 }: { beats: BeatTuple[]; height?: number }) {
  const W = 320;
  const H = height;
  const data = beats.filter((b) => b[0]);
  const path = useMemo(() => {
    if (data.length < 2) return null;
    const t0 = data[0][0];
    const t1 = data[data.length - 1][0];
    const pings = data.map((b) => b[2]).filter((v): v is number => v != null);
    const maxP = Math.max(10, ...pings) * 1.15;
    const x = (t: number) => ((t - t0) / Math.max(1, t1 - t0)) * W;
    const y = (v: number) => H - 4 - (v / maxP) * (H - 10);
    let d = '';
    let area = '';
    let penDown = false;
    let firstX = 0;
    let lastX = 0;
    const downs: [number, number][] = [];
    let downStart: number | null = null;
    for (const [t, st, ping] of data) {
      if (st === 'down') {
        if (downStart == null) downStart = x(t);
      } else if (downStart != null) {
        downs.push([downStart, x(t)]);
        downStart = null;
      }
      if (ping == null) {
        penDown = false;
        continue;
      }
      const px = x(t);
      const py = y(ping);
      if (!penDown) {
        d += `M${px.toFixed(1)},${py.toFixed(1)}`;
        if (!area) firstX = px;
        penDown = true;
      } else d += `L${px.toFixed(1)},${py.toFixed(1)}`;
      area += `${area ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`;
      lastX = px;
    }
    if (downStart != null) downs.push([downStart, W]);
    const fillD = area ? `${area}L${lastX.toFixed(1)},${H}L${firstX.toFixed(1)},${H}Z` : '';
    return { d, fillD, downs, maxP };
  }, [data, H]);
  if (!path) return <div className="spark empty muted small">Not enough data yet</div>;
  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ height }}>
      {path.downs.map(([a, b], i) => (
        <rect key={i} x={a} y={0} width={Math.max(2, b - a)} height={H} className="spark-down" />
      ))}
      <path d={path.fillD} className="spark-fill" />
      <path d={path.d} className="spark-line" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function useMonitor(id: number | null | undefined): MonitorDTO | null {
  return useStore((s) => (id == null ? null : (s.monitors[id] ?? null)));
}

function useBeats(id: number | null | undefined, hours: number) {
  const [beats, setBeats] = useState<BeatTuple[] | null>(null);
  const last = useStore((s) => (id == null ? null : s.monitors[id]?.lastBeat));
  useEffect(() => {
    setBeats(null);
  }, [id]);
  useEffect(() => {
    if (id == null) return;
    let alive = true;
    api
      .beats(id, hours)
      .then((r) => alive && setBeats(r.beats))
      .catch(() => alive && setBeats([]));
    return () => {
      alive = false;
    };
    // refresh roughly every minute of new heartbeats
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, hours, Math.floor((last ?? 0) / 60000)]);
  return beats;
}

export function useEvents(ids: number[], limit = 30) {
  const key = ids.join(',');
  const [events, setEvents] = useState<EventDTO[] | null>(null);
  const changeKey = useStore((s) => ids.map((id) => s.monitors[id]?.status ?? '').join(','));
  useEffect(() => {
    if (!ids.length) {
      setEvents([]);
      return;
    }
    let alive = true;
    api
      .events(ids, limit)
      .then((r) => alive && setEvents(r.events))
      .catch(() => alive && setEvents([]));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, limit, changeKey]);
  return events;
}

export function kumaLink(id: number): string | null {
  const url = useStore.getState().session?.kumaUrl;
  return url ? `${url}/dashboard/${id}` : null;
}

/** Everything we know about one monitor. */
export function MonitorCard({ id, compact }: { id: number | null | undefined; compact?: boolean }) {
  const m = useMonitor(id);
  const [hours, setHours] = useState(24);
  const beats = useBeats(id, hours);
  if (id == null) return <div className="empty-note">No monitor linked.</div>;
  if (!m) return <div className="empty-note">Monitor #{id} not found in Uptime Kuma.</div>;
  const link = kumaLink(m.id);
  const target = m.url || (m.hostname ? `${m.hostname}${m.port ? `:${m.port}` : ''}` : null);
  return (
    <div className={`moncard st-${m.status}`}>
      <div className="moncard-head">
        <div>
          <div className="moncard-name">{m.name}</div>
          <div className="muted small">
            {m.type.toUpperCase()}
            {target ? ` · ${target}` : ''}
          </div>
        </div>
        <StatusPill status={m.status} />
      </div>
      <HeartbeatBar beats={m.beats} max={compact ? 30 : 40} />
      <div className="stats">
        <div>
          <span className="muted small">24h</span>
          <b>{pct(m.uptime24)}</b>
        </div>
        <div>
          <span className="muted small">30d</span>
          <b>{pct(m.uptime720)}</b>
        </div>
        <div>
          <span className="muted small">Ping</span>
          <b>{m.ping != null ? `${m.ping} ms` : '—'}</b>
        </div>
        <div>
          <span className="muted small">Since</span>
          <b>{m.lastChange ? duration(Date.now() - m.lastChange) : '—'}</b>
        </div>
      </div>
      {!compact && (
        <>
          <div className="spark-head">
            <span className="muted small">Response time</span>
            <div className="seg small">
              {[1, 24, 168].map((h) => (
                <button key={h} className={hours === h ? 'on' : ''} onClick={() => setHours(h)}>
                  {h === 1 ? '1h' : h === 24 ? '24h' : '7d'}
                </button>
              ))}
            </div>
          </div>
          {beats ? <Sparkline beats={beats} /> : <div className="spark skeleton" />}
        </>
      )}
      {m.msg && m.status !== 'up' && <div className={`msg st-${m.status}`}>{m.msg}</div>}
      <div className="moncard-foot">
        {m.cert && (
          <span className={`cert ${m.cert.valid && (m.cert.daysRemaining ?? 99) > 14 ? 'ok' : 'warn'}`}>
            {m.cert.valid ? <ShieldCheck size={13} /> : <ShieldAlert size={13} />}
            {m.cert.valid ? `Cert ${m.cert.daysRemaining ?? '?'}d` : 'Cert invalid'}
          </span>
        )}
        <span className="muted small">Last check {timeAgo(m.lastBeat)}</span>
        {link && (
          <a className="link small" href={link} target="_blank" rel="noreferrer">
            Kuma <ExternalLink size={12} />
          </a>
        )}
      </div>
    </div>
  );
}

export function EventList({ ids, names }: { ids: number[]; names?: Map<number, string> }) {
  const events = useEvents(ids);
  const monitors = useStore((s) => s.monitors);
  if (!events) return <div className="skeleton" style={{ height: 60 }} />;
  if (!events.length) return <div className="empty-note">No status changes recorded yet.</div>;
  return (
    <ul className="events">
      {events.map((e) => (
        <li key={e.id}>
          <Dot status={e.status} pulse={false} />
          <div>
            <div>
              <b>{names?.get(e.monitorId) ?? monitors[e.monitorId]?.name ?? `#${e.monitorId}`}</b> {e.status === 'up' ? 'recovered' : `went ${STATUS_LABEL[e.status].toLowerCase()}`}
            </div>
            {e.msg && e.status !== 'up' && <div className="muted small ellipsis">{e.msg}</div>}
          </div>
          <time className="muted small" title={new Date(e.time).toLocaleString()}>
            {timeAgo(e.time)}
          </time>
        </li>
      ))}
    </ul>
  );
}

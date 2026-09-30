import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import { monitorUsage } from '../../../../shared/model';
import type { MonitorDTO } from '../../../../shared/status';
import { useStore } from '../../state/store';
import { Dot } from '../widgets';

export function Field({ label, children, hint, error }: { label: string; children: ReactNode; hint?: ReactNode; error?: string | null }) {
  return (
    <label className={`field ${error ? 'has-error' : ''}`}>
      <span className="field-label">{label}</span>
      {children}
      {error ? <span className="field-error">{error}</span> : hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}

export function Text({ value, onChange, placeholder, mono }: { value: string | undefined | null; onChange: (v: string) => void; placeholder?: string; mono?: boolean }) {
  return <input className={`input ${mono ? 'mono' : ''}`} value={value ?? ''} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />;
}

export function TextArea({ value, onChange, placeholder }: { value: string | undefined | null; onChange: (v: string) => void; placeholder?: string }) {
  return <textarea className="input" rows={3} value={value ?? ''} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />;
}

/** Number input that only commits valid numbers but lets you type freely. */
export function Num({ value, onChange, min, max, step = 1 }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  return (
    <input
      className="input num"
      type="number"
      value={text}
      min={min}
      max={max}
      step={step}
      onChange={(e) => {
        setText(e.target.value);
        const n = Number(e.target.value);
        if (e.target.value !== '' && Number.isFinite(n) && (min == null || n >= min) && (max == null || n <= max)) onChange(n);
      }}
      onBlur={() => setText(String(value))}
    />
  );
}

export function Select<T extends string | number>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; group?: string }[] }) {
  const groups = [...new Set(options.map((o) => o.group ?? ''))];
  return (
    <div className="select-wrap">
      <select
        className="input"
        value={String(value)}
        onChange={(e) => {
          const o = options.find((x) => String(x.value) === e.target.value);
          if (o) onChange(o.value);
        }}
      >
        {groups.length > 1
          ? groups.map((g) => (
              <optgroup key={g} label={g}>
                {options
                  .filter((o) => (o.group ?? '') === g)
                  .map((o) => (
                    <option key={String(o.value)} value={String(o.value)}>
                      {o.label}
                    </option>
                  ))}
              </optgroup>
            ))
          : options.map((o) => (
              <option key={String(o.value)} value={String(o.value)}>
                {o.label}
              </option>
            ))}
      </select>
      <ChevronDown size={14} className="select-chev" />
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[] }) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button type="button" key={o.value} className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Monitor picker
// ---------------------------------------------------------------------------

function score(m: MonitorDTO, q: string): number {
  if (!q) return 1;
  const hay = `${m.name} ${m.pathName ?? ''} ${m.hostname ?? ''} ${m.url ?? ''} ${m.type} ${m.tags.map((t) => `${t.name}:${t.value ?? ''}`).join(' ')}`.toLowerCase();
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  let s = 0;
  for (const w of words) {
    const i = hay.indexOf(w);
    if (i < 0) return 0;
    s += i === 0 ? 3 : hay[i - 1] === ' ' ? 2 : 1;
  }
  return s;
}

/** Monitors whose name/host look like they belong to `hint` (name or ip). */
export function suggestMonitors(monitors: MonitorDTO[], hints: (string | undefined | null)[], used: Map<number, string[]>): MonitorDTO[] {
  const hs = hints.filter((h): h is string => !!h && h.length > 1).map((h) => h.toLowerCase());
  if (!hs.length) return [];
  return monitors
    .filter((m) => !used.has(m.id) && m.type !== 'group')
    .filter((m) => {
      const name = m.name.toLowerCase();
      const host = `${m.hostname ?? ''} ${m.url ?? ''}`.toLowerCase();
      return hs.some((h) => name === h || name.includes(h) || host.includes(h));
    })
    .slice(0, 4);
}

export function MonitorPicker({ value, onChange, placeholder = 'Link a Kuma monitor…', hints }: { value: number | null | undefined; onChange: (id: number | null, m?: MonitorDTO) => void; placeholder?: string; hints?: (string | undefined | null)[] }) {
  const monitors = useStore((s) => s.monitors);
  const world = useStore((s) => s.world);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [hi, setHi] = useState(0);
  const btn = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; width: number; up: boolean }>({ left: 0, top: 0, width: 300, up: false });
  const usage = useMemo(() => (world ? monitorUsage(world) : new Map<number, string[]>()), [world]);
  const list = useMemo(() => {
    return Object.values(monitors)
      .map((m) => ({ m, s: score(m, q) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s || (usage.has(a.m.id) ? 1 : 0) - (usage.has(b.m.id) ? 1 : 0) || a.m.name.localeCompare(b.m.name))
      .slice(0, 60)
      .map((x) => x.m);
  }, [monitors, q, usage]);
  const current = value != null ? monitors[value] : undefined;
  const suggestions = !current && hints ? suggestMonitors(Object.values(monitors), hints, usage) : [];

  const openMenu = () => {
    const r = btn.current?.getBoundingClientRect();
    if (r) {
      const up = r.bottom + 340 > window.innerHeight;
      setPos({ left: Math.min(r.left, window.innerWidth - 330), top: up ? r.top - 6 : r.bottom + 6, width: Math.max(r.width, 320), up });
    }
    setQ('');
    setHi(0);
    setOpen(true);
  };

  const pick = (m: MonitorDTO | null) => {
    onChange(m?.id ?? null, m ?? undefined);
    setOpen(false);
  };

  return (
    <div className="mpick">
      <div className="mpick-row">
        <button ref={btn} type="button" className="input mpick-btn" onClick={openMenu}>
          {current ? (
            <>
              <Dot status={current.status} />
              <span className="ellipsis">{current.name}</span>
              <span className="tag">{current.type}</span>
            </>
          ) : value != null ? (
            <span className="muted">Monitor #{value} (missing)</span>
          ) : (
            <span className="muted">{placeholder}</span>
          )}
          <ChevronDown size={14} className="mpick-chev" />
        </button>
        {value != null && (
          <button type="button" className="icon-btn" title="Unlink" onClick={() => onChange(null)}>
            <X size={14} />
          </button>
        )}
      </div>
      {suggestions.length > 0 && (
        <div className="suggest">
          <span className="muted small">Suggested:</span>
          {suggestions.map((m) => (
            <button key={m.id} type="button" className="chip-btn" onClick={() => pick(m)}>
              <Dot status={m.status} pulse={false} /> {m.name}
            </button>
          ))}
        </div>
      )}
      {open &&
        createPortal(
          <div className="menu-backdrop" onMouseDown={() => setOpen(false)}>
            <div
              className={`menu mpick-menu ${pos.up ? 'up' : ''}`}
              style={{ left: pos.left, top: pos.up ? undefined : pos.top, bottom: pos.up ? window.innerHeight - pos.top : undefined, width: pos.width }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div className="menu-search">
                <Search size={14} />
                <input
                  autoFocus
                  placeholder="Search monitors by name, host, tag…"
                  value={q}
                  onChange={(e) => {
                    setQ(e.target.value);
                    setHi(0);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      setHi((h) => Math.min(list.length - 1, h + 1));
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      setHi((h) => Math.max(0, h - 1));
                    } else if (e.key === 'Enter') {
                      e.preventDefault();
                      if (list[hi]) pick(list[hi]);
                    } else if (e.key === 'Escape') setOpen(false);
                  }}
                />
              </div>
              <div className="menu-list">
                {value != null && (
                  <button type="button" className="menu-item" onClick={() => pick(null)}>
                    <X size={14} /> <span>No monitor</span>
                  </button>
                )}
                {list.map((m, i) => {
                  const used = usage.get(m.id);
                  return (
                    <button type="button" key={m.id} className={`menu-item ${i === hi ? 'hi' : ''}`} onMouseEnter={() => setHi(i)} onClick={() => pick(m)}>
                      <Dot status={m.status} pulse={false} />
                      <span className="menu-main">
                        <span className="ellipsis">{m.pathName && m.pathName !== m.name ? m.pathName : m.name}</span>
                        <span className="muted small ellipsis">
                          {m.type}
                          {m.hostname ? ` · ${m.hostname}` : m.url ? ` · ${m.url}` : ''}
                          {used ? ` · used by ${used[0]}${used.length > 1 ? ` +${used.length - 1}` : ''}` : ''}
                        </span>
                      </span>
                      {m.id === value && <Check size={14} />}
                    </button>
                  );
                })}
                {!list.length && <div className="empty-note">{Object.keys(monitors).length ? 'No matching monitors' : 'No monitors received from Uptime Kuma yet'}</div>}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

/** Multi-select of monitors, used for "add services from Kuma". */
export function MonitorMultiPicker({ onPick, onClose }: { onPick: (ms: MonitorDTO[]) => void; onClose: () => void }) {
  const monitors = useStore((s) => s.monitors);
  const world = useStore((s) => s.world);
  const usage = useMemo(() => (world ? monitorUsage(world) : new Map<number, string[]>()), [world]);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [hideUsed, setHideUsed] = useState(true);
  const list = Object.values(monitors)
    .filter((m) => m.type !== 'group')
    .filter((m) => !hideUsed || !usage.has(m.id))
    .map((m) => ({ m, s: score(m, q) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.m.name.localeCompare(b.m.name))
    .map((x) => x.m);
  return createPortal(
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2>Add services from Uptime Kuma</h2>
          <button className="icon-btn" onClick={onClose}>
            <X size={16} />
          </button>
        </header>
        <div className="menu-search boxed">
          <Search size={14} />
          <input autoFocus placeholder="Filter monitors…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <label className="check small">
          <input type="checkbox" checked={hideUsed} onChange={(e) => setHideUsed(e.target.checked)} /> Hide monitors already placed
        </label>
        <div className="menu-list tall">
          {list.map((m) => (
            <label key={m.id} className="menu-item">
              <input
                type="checkbox"
                checked={sel.has(m.id)}
                onChange={(e) => {
                  const n = new Set(sel);
                  if (e.target.checked) n.add(m.id);
                  else n.delete(m.id);
                  setSel(n);
                }}
              />
              <Dot status={m.status} pulse={false} />
              <span className="menu-main">
                <span className="ellipsis">{m.pathName ?? m.name}</span>
                <span className="muted small ellipsis">
                  {m.type}
                  {m.hostname ? ` · ${m.hostname}` : m.url ? ` · ${m.url}` : ''}
                </span>
              </span>
            </label>
          ))}
          {!list.length && <div className="empty-note">Nothing to add.</div>}
        </div>
        <footer className="modal-foot">
          <span className="muted small">{sel.size} selected</span>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn primary"
            disabled={!sel.size}
            onClick={() => {
              onPick(Object.values(monitors).filter((m) => sel.has(m.id)));
              onClose();
            }}
          >
            Add {sel.size || ''}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

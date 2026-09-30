import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, CloudOff, Command, Eye, LogIn, LogOut, Minus, PanelRightClose, PanelRightOpen, Pencil, Plus, Redo2, Search, Settings, Undo2, X } from 'lucide-react';
import { DEVICE_TYPES, walkWorld, type EntityRef } from '../../../shared/model';
import { STATUS_LABEL, type RollupStatus } from '../../../shared/status';
import { indexWorld, resolvePath } from '../state';
import { buildingHealth, guestHealth, machineHealth, monStatus, siteHealth, unitHealth, worldHealth } from '../state/health';
import { dismissToast, goToEntity, levelOf, logout, navigate, navigateUp, redo, setEdit, undo, useStore } from '../state/store';
import { camera } from '../scene/camera';
import { Inspector } from './editor/Inspector';
import { kindIcon, ViewPanel } from './panels';
import { CountChips, Dot, StatusPill } from './widgets';

// ---------------------------------------------------------------------------
// Top bar
// ---------------------------------------------------------------------------

function Logo() {
  return (
    <svg viewBox="0 0 32 32" width="26" height="26" className="logo">
      <polygon points="16,3 28,10 16,17 4,10" fill="#93A5CC" />
      <polygon points="4,10 16,17 16,30 4,23" fill="#7084AE" />
      <polygon points="28,10 16,17 16,30 28,23" fill="#4B5B82" />
      <polygon points="7,15 13,18.5 13,19.5 7,16" fill="#556893" />
      <polygon points="7,18.5 13,22 13,23 7,19.5" fill="#556893" />
      <polygon points="22,20 24,18.8 24,20.3 22,21.5" className="logo-led" />
    </svg>
  );
}

function Breadcrumbs() {
  const world = useStore((s) => s.world);
  const focus = useStore((s) => s.focus);
  if (!world) return null;
  const r = resolvePath(world, focus.path);
  const crumbs: { label: string; path: string[] }[] = [{ label: 'World', path: [] }];
  if (r.site) crumbs.push({ label: r.site.name, path: [r.site.id] });
  if (r.building) crumbs.push({ label: r.building.name, path: [r.site!.id, r.building.id] });
  if (r.unit) crumbs.push({ label: r.unit.name, path: [r.site!.id, r.building!.id, r.unit.id] });
  if (r.device) crumbs.push({ label: r.device.name, path: focus.path.slice(0, 4) });
  const cluster = focus.cluster ? world.clusters.find((c) => c.id === focus.cluster) : null;
  return (
    <nav className="crumbs">
      {focus.path.length > 0 || cluster ? (
        <button className="icon-btn back" title="Back (Esc)" onClick={navigateUp}>
          <ChevronLeft size={16} />
        </button>
      ) : null}
      {crumbs.map((c, i) => (
        <span key={c.path.join('/') || 'root'} className="crumb-wrap">
          {i > 0 && <ChevronRight size={13} className="crumb-sep" />}
          <button className={`crumb ${i === crumbs.length - 1 && !cluster ? 'current' : ''}`} onClick={() => navigate(c.path)}>
            {c.label}
          </button>
        </span>
      ))}
      {cluster && (
        <span className="crumb-wrap">
          <ChevronRight size={13} className="crumb-sep" />
          <span className="crumb current">
            <span className="swatch" style={{ background: cluster.color }} /> {cluster.name}
          </span>
        </span>
      )}
    </nav>
  );
}

function SourceBadge() {
  const source = useStore((s) => s.source);
  const streamOk = useStore((s) => s.streamOk);
  if (!streamOk)
    return (
      <span className="badge warn" title="Lost connection to the server – retrying">
        <CloudOff size={13} /> offline
      </span>
    );
  if (!source) return null;
  if (source.mode === 'demo') return <span className="badge info" title={source.message}>demo data</span>;
  if (source.state === 'connected') return null;
  return (
    <span className="badge warn" title={source.message}>
      <Dot status={source.state === 'connecting' ? 'pending' : 'down'} /> Kuma {source.state}
    </span>
  );
}

function SaveBadge() {
  const st = useStore((s) => s.saveState);
  const label = { idle: '', pending: 'Unsaved…', saving: 'Saving…', saved: 'Saved', error: 'Save failed', conflict: 'Conflict' }[st];
  if (!label) return null;
  return <span className={`badge save ${st}`}>{label}</span>;
}

export function TopBar() {
  const session = useStore((s) => s.session);
  const edit = useStore((s) => s.edit);
  const world = useStore((s) => s.world);
  const monitors = useStore((s) => s.monitors);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const h = world ? worldHealth(world, monitors) : null;
  return (
    <header className="topbar">
      <div className="tb-left glass">
        <button className="brand" onClick={() => navigate([])} title="Isometric Uptime">
          <Logo />
          <span className="brand-name">Isometric Uptime</span>
        </button>
        <Breadcrumbs />
      </div>
      <div className="tb-right glass">
        {h && (
          <span className="tb-health" title="Devices up / down">
            <CountChips c={h.machines} />
          </span>
        )}
        <SourceBadge />
        {edit && <SaveBadge />}
        <button className="tb-search" onClick={() => useStore.setState({ searchOpen: true })}>
          <Search size={14} />
          <span>Search</span>
          <kbd>
            <Command size={10} />K
          </kbd>
        </button>
        {edit && (
          <>
            <button className="icon-btn" title="Undo (⌘Z)" disabled={!canUndo} onClick={undo}>
              <Undo2 size={16} />
            </button>
            <button className="icon-btn" title="Redo (⇧⌘Z)" disabled={!canRedo} onClick={redo}>
              <Redo2 size={16} />
            </button>
          </>
        )}
        {session?.canEdit || session?.authEnabled ? (
          <button className={`btn ${edit ? 'primary' : ''} sm`} onClick={() => setEdit(!edit)} title="Toggle edit mode (E)">
            {edit ? <Eye size={14} /> : <Pencil size={14} />}
            <span className="hide-sm">{edit ? 'Done' : 'Edit'}</span>
          </button>
        ) : null}
        <button className="icon-btn" title="Settings" onClick={() => useStore.setState({ settingsOpen: true })}>
          <Settings size={16} />
        </button>
        {session?.authEnabled &&
          (session.authenticated ? (
            <button className="icon-btn" title={`Log out ${session.user ?? ''}`} onClick={() => void logout()}>
              <LogOut size={16} />
            </button>
          ) : (
            <button className="icon-btn" title="Log in" onClick={() => useStore.setState({ loginOpen: true })}>
              <LogIn size={16} />
            </button>
          ))}
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Side panel / bottom sheet
// ---------------------------------------------------------------------------

export function SidePanel({ open, setOpen, mobile, sheet, setSheet }: { open: boolean; setOpen: (v: boolean) => void; mobile: boolean; sheet: 'peek' | 'half' | 'full'; setSheet: (s: 'peek' | 'half' | 'full') => void }) {
  const edit = useStore((s) => s.edit);
  const focusKey = useStore((s) => `${s.focus.path.join('/')}|${s.focus.sub ?? ''}|${s.focus.cluster ?? ''}|${s.selected ?? ''}`);
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [focusKey]);
  const drag = useRef<{ y: number; start: 'peek' | 'half' | 'full' } | null>(null);

  if (!mobile && !open)
    return (
      <button className="panel-tab glass" onClick={() => setOpen(true)} title="Show panel">
        <PanelRightOpen size={16} />
      </button>
    );

  return (
    <aside
      className={`panel glass ${mobile ? `sheet ${sheet}` : ''} ${edit ? 'editing' : ''}`}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {mobile ? (
        <div
          className="sheet-handle"
          onPointerDown={(e) => {
            drag.current = { y: e.clientY, start: sheet };
            (e.target as Element).setPointerCapture(e.pointerId);
          }}
          onPointerUp={(e) => {
            const d = drag.current;
            drag.current = null;
            if (!d) return;
            const dy = e.clientY - d.y;
            const order: ('peek' | 'half' | 'full')[] = ['peek', 'half', 'full'];
            let i = order.indexOf(d.start);
            if (Math.abs(dy) < 8) i = (i + 1) % 3;
            else i = Math.max(0, Math.min(2, i + (dy < 0 ? 1 : -1)));
            setSheet(order[i]);
          }}
        >
          <span />
        </div>
      ) : (
        <button className="icon-btn panel-close" onClick={() => setOpen(false)} title="Hide panel">
          <PanelRightClose size={16} />
        </button>
      )}
      <div className="panel-scroll" ref={scroller}>
        {edit ? <Inspector /> : <ViewPanel />}
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Hover tooltip
// ---------------------------------------------------------------------------

export function Tooltip() {
  const hover = useStore((s) => s.hover);
  const world = useStore((s) => s.world);
  const monitors = useStore((s) => s.monitors);
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 220, h: 80 });
  useEffect(() => {
    if (ref.current) setSize({ w: ref.current.offsetWidth, h: ref.current.offsetHeight });
  }, [hover?.id]);
  if (!hover || !world) return null;
  const e = indexWorld(world).get(hover.id);
  if (!e) return null;
  let title = '';
  let kicker = '';
  let status: RollupStatus = 'unknown';
  let extra: React.ReactNode = null;
  switch (e.kind) {
    case 'site': {
      const h = siteHealth(e.site, monitors);
      title = e.site.name;
      kicker = 'Site';
      status = h.rollup;
      extra = <CountChips c={h.machines} label="Devices" />;
      break;
    }
    case 'building': {
      const h = buildingHealth(e.building, monitors);
      title = e.building.name;
      kicker = `${e.building.kind} building`;
      status = h.rollup;
      extra = <CountChips c={h.machines} label="Devices" />;
      break;
    }
    case 'rack': {
      const h = unitHealth(e.rack, monitors);
      title = e.rack.name;
      kicker = `${e.rack.heightU}U rack`;
      status = h.rollup;
      extra = <CountChips c={h.machines} label="Devices" />;
      break;
    }
    case 'machine': {
      const h = machineHealth(e.machine, monitors);
      const m = e.machine.monitorId != null ? monitors[e.machine.monitorId] : null;
      title = e.machine.name;
      kicker = DEVICE_TYPES[e.machine.type]?.label ?? e.machine.type;
      status = h.rollup;
      extra = (
        <>
          {m && (
            <div className="muted small">
              {m.ping != null ? `${m.ping} ms` : ''} {m.status !== 'up' && m.msg ? `· ${m.msg}` : ''}
            </div>
          )}
          {h.services.up + h.services.down + h.services.warn > 0 && <CountChips c={h.services} label="Workloads" />}
        </>
      );
      break;
    }
    case 'service': {
      const m = e.service.monitorId != null ? monitors[e.service.monitorId] : null;
      title = e.service.name;
      kicker = `Service${e.ownerKind === 'cluster' ? ' · HA' : ''}`;
      status = monStatus(monitors, e.service.monitorId);
      extra = m ? <div className="muted small">{[m.type, m.ping != null ? `${m.ping} ms` : null, m.status !== 'up' ? m.msg : null].filter(Boolean).join(' · ')}</div> : <div className="muted small">No monitor linked</div>;
      break;
    }
    case 'guest': {
      title = e.guest.name;
      kicker = `${e.guest.kind.toUpperCase()}${e.ownerKind === 'cluster' ? ' · HA' : ''}`;
      status = guestHealth(e.guest, monitors).rollup;
      extra = <div className="muted small">{e.guest.services.length} services</div>;
      break;
    }
    case 'room':
      title = e.room.name;
      kicker = 'Room';
      break;
    default:
      return null;
  }
  const x = hover.x + 16 + size.w > window.innerWidth ? hover.x - size.w - 12 : hover.x + 16;
  const y = hover.y + 16 + size.h > window.innerHeight ? hover.y - size.h - 12 : hover.y + 16;
  return (
    <div className="tooltip glass" ref={ref} style={{ left: x, top: y }}>
      <div className="tt-head">
        <div>
          <div className="kicker">{kicker}</div>
          <div className="tt-title">{title}</div>
        </div>
        {e.kind !== 'room' && <StatusPill status={status} />}
      </div>
      {extra}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------------------

export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className={`toast glass ${t.kind}`} onClick={() => t.path && navigate(t.path, { sub: t.sub })} role={t.path ? 'button' : undefined}>
          <span className={`toast-bar st-${t.kind === 'down' ? 'down' : t.kind === 'up' ? 'up' : t.kind === 'error' ? 'down' : t.kind === 'warn' ? 'pending' : 'maintenance'}`} />
          <div className="toast-body">
            <div className="toast-title">{t.title}</div>
            {t.body && <div className="muted small">{t.body}</div>}
            {t.action && (
              <button
                className="btn sm"
                onClick={(e) => {
                  e.stopPropagation();
                  t.action!.run();
                  dismissToast(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
          <button
            className="icon-btn"
            onClick={(e) => {
              e.stopPropagation();
              dismissToast(t.id);
            }}
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Zoom controls
// ---------------------------------------------------------------------------

export function ZoomControls() {
  const zoom = (f: number) => {
    const vp = camera.viewport();
    camera.zoomAt(vp.x + vp.w / 2, vp.y + vp.h / 2, f);
  };
  return (
    <div className="zoom glass">
      <button className="icon-btn" onClick={() => zoom(1.3)} title="Zoom in">
        <Plus size={16} />
      </button>
      <button className="icon-btn" onClick={() => zoom(1 / 1.3)} title="Zoom out">
        <Minus size={16} />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Search (⌘K)
// ---------------------------------------------------------------------------

const KIND_LABEL: Record<string, string> = { site: 'Site', building: 'Building', room: 'Room', rack: 'Rack', machine: 'Device', device: 'Device', guest: 'VM / container', service: 'Service', cluster: 'Cluster' };

export function SearchPalette() {
  const open = useStore((s) => s.searchOpen);
  const world = useStore((s) => s.world);
  const monitors = useStore((s) => s.monitors);
  const [q, setQ] = useState('');
  const [hi, setHi] = useState(0);
  useEffect(() => {
    if (open) {
      setQ('');
      setHi(0);
    }
  }, [open]);
  const all = useMemo(() => {
    const list: EntityRef[] = [];
    if (world) walkWorld(world, (e) => list.push(e));
    return list;
  }, [world]);
  const results = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const scored = all
      .map((e) => {
        const m = e.monitorId != null ? monitors[e.monitorId] : undefined;
        const hay = `${e.name} ${e.location} ${KIND_LABEL[e.kind]} ${m?.hostname ?? ''} ${m?.url ?? ''} ${m?.name ?? ''}`.toLowerCase();
        let s = 0;
        for (const w of words) {
          const i = hay.indexOf(w);
          if (i < 0) return null;
          s += i === 0 ? 4 : e.name.toLowerCase().startsWith(w) ? 3 : 1;
        }
        if (m && m.status === 'down') s += 0.5;
        return { e, s };
      })
      .filter((x): x is { e: EntityRef; s: number } => !!x);
    scored.sort((a, b) => b.s - a.s);
    return scored.slice(0, 40).map((x) => x.e);
  }, [all, q, monitors]);
  if (!open || !world) return null;
  const close = () => useStore.setState({ searchOpen: false });
  const go = (e: EntityRef) => {
    close();
    goToEntity(e.id);
  };
  return (
    <div className="modal-backdrop top" onMouseDown={close}>
      <div className="search glass" onMouseDown={(e) => e.stopPropagation()}>
        <div className="search-input">
          <Search size={18} />
          <input
            autoFocus
            placeholder="Jump to a site, building, rack, device, VM or service…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setHi(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setHi((h) => Math.min(results.length - 1, h + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setHi((h) => Math.max(0, h - 1));
              } else if (e.key === 'Enter' && results[hi]) go(results[hi]);
              else if (e.key === 'Escape') close();
            }}
          />
          <kbd>esc</kbd>
        </div>
        <div className="search-results">
          {results.map((e, i) => (
            <SearchRow key={`${e.kind}-${e.id}`} e={e} hi={i === hi} onHover={() => setHi(i)} onPick={() => go(e)} />
          ))}
          {!results.length && <div className="empty-note pad">Nothing found for “{q}”.</div>}
        </div>
      </div>
    </div>
  );
}

function SearchRow({ e, hi, onHover, onPick }: { e: EntityRef; hi: boolean; onHover: () => void; onPick: () => void }) {
  const world = useStore((s) => s.world)!;
  const status = useStore((s) => {
    const x = indexWorld(world).get(e.id);
    if (!x) return 'unknown';
    if (x.kind === 'site') return siteHealth(x.site, s.monitors).rollup;
    if (x.kind === 'building') return buildingHealth(x.building, s.monitors).rollup;
    if (x.kind === 'rack') return unitHealth(x.rack, s.monitors).rollup;
    if (x.kind === 'machine') return machineHealth(x.machine, s.monitors).rollup;
    if (x.kind === 'guest') return guestHealth(x.guest, s.monitors).rollup;
    if (x.kind === 'service') return monStatus(s.monitors, x.service.monitorId);
    return 'unknown';
  });
  const x = indexWorld(world).get(e.id);
  const icon = x?.kind === 'building' ? kindIcon(x.building.kind) : x?.kind === 'machine' ? kindIcon(x.machine.type) : kindIcon(e.kind);
  return (
    <button className={`search-row ${hi ? 'hi' : ''}`} onMouseEnter={onHover} onClick={onPick}>
      <span className="row-icon">{icon}</span>
      <span className="row-main">
        <span className="row-title">{e.name}</span>
        <span className="row-sub">
          {KIND_LABEL[e.kind]}
          {e.location ? ` · ${e.location}` : ''}
        </span>
      </span>
      {e.kind !== 'room' && e.kind !== 'cluster' && <span title={STATUS_LABEL[status]}><Dot status={status} /></span>}
    </button>
  );
}

// ---------------------------------------------------------------------------

export function EmptyWorld() {
  const world = useStore((s) => s.world);
  const edit = useStore((s) => s.edit);
  const session = useStore((s) => s.session);
  const level = useStore((s) => levelOf(s.world, s.focus.path));
  if (!world || world.sites.length || level !== 'world') return null;
  return (
    <div className="empty-world glass">
      <Logo />
      <h2>Your world is empty</h2>
      <p className="muted">Create sites, buildings, racks and devices, then link them to your Uptime Kuma monitors.</p>
      {!edit && (
        <button className="btn primary" onClick={() => setEdit(true)}>
          <Pencil size={14} /> {session?.canEdit ? 'Start building' : 'Log in to start building'}
        </button>
      )}
      {edit && <p className="muted small">Use “Add site” in the panel, or load the example layout from Settings.</p>}
    </div>
  );
}

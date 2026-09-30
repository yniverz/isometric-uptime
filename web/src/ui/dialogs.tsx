import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Bell, BellOff, Download, History, Monitor, Moon, Network, Plus, Sparkles, Sun, Upload, X } from 'lucide-react';
import { normalizeWorld, validateWorld, type World } from '../../../shared/model';
import { api } from '../state/api';
import { commit, login, select, setNotify, setThemePref, toast, useStore } from '../state/store';
import { ClusterForm, newClusterAndSelect } from './editor/Inspector';
import { Segmented } from './editor/fields';
import { timeAgo } from './widgets';

function Modal({ title, onClose, children, wide }: { title: ReactNode; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return createPortal(
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className={`modal ${wide ? 'wide' : ''}`} onMouseDown={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose}>
            <X size={16} />
          </button>
        </header>
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function LoginDialog() {
  const open = useStore((s) => s.loginOpen);
  const [u, setU] = useState('admin');
  const [p, setP] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!open) return null;
  return (
    <Modal title="Log in" onClose={() => useStore.setState({ loginOpen: false })}>
      <LoginForm u={u} p={p} setU={setU} setP={setP} err={err} busy={busy} onSubmit={async () => {
        setBusy(true);
        setErr(null);
        try {
          await login(u, p);
          setP('');
        } catch (e) {
          setErr((e as Error).message);
        } finally {
          setBusy(false);
        }
      }} />
    </Modal>
  );
}

function LoginForm({ u, p, setU, setP, err, busy, onSubmit }: { u: string; p: string; setU: (v: string) => void; setP: (v: string) => void; err: string | null; busy: boolean; onSubmit: () => void }) {
  return (
    <form
      className="login-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <label className="field">
        <span className="field-label">Username</span>
        <input className="input" autoComplete="username" value={u} onChange={(e) => setU(e.target.value)} />
      </label>
      <label className="field">
        <span className="field-label">Password</span>
        <input className="input" type="password" autoComplete="current-password" autoFocus value={p} onChange={(e) => setP(e.target.value)} />
      </label>
      {err && <div className="form-error">{err}</div>}
      <button className="btn primary block" disabled={busy}>
        {busy ? 'Logging in…' : 'Log in'}
      </button>
    </form>
  );
}

/** Full-screen login when the viewer may not even read. */
export function LoginScreen() {
  const [u, setU] = useState('admin');
  const [p, setP] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="login-screen">
      <div className="login-card glass">
        <svg viewBox="0 0 32 32" width="44" height="44">
          <polygon points="16,3 28,10 16,17 4,10" fill="#93A5CC" />
          <polygon points="4,10 16,17 16,30 4,23" fill="#7084AE" />
          <polygon points="28,10 16,17 16,30 28,23" fill="#4B5B82" />
          <polygon points="22,20 24,18.8 24,20.3 22,21.5" fill="#6FF0C4" />
        </svg>
        <h1>Isometric Uptime</h1>
        <p className="muted">Log in to see your infrastructure.</p>
        <LoginForm u={u} p={p} setU={setU} setP={setP} err={err} busy={busy} onSubmit={async () => {
          setBusy(true);
          setErr(null);
          try {
            await login(u, p);
          } catch (e) {
            setErr((e as Error).message);
          } finally {
            setBusy(false);
          }
        }} />
      </div>
    </div>
  );
}

function download(name: string, data: string) {
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function replaceWorld(w: World, label: string) {
  const normalized = normalizeWorld(w);
  const err = validateWorld(normalized);
  if (err) {
    toast({ kind: 'error', title: 'Invalid layout', body: err });
    return false;
  }
  commit((draft) => {
    draft.sites = normalized.sites;
    draft.clusters = normalized.clusters;
  });
  select(null);
  toast({ kind: 'info', title: label, body: 'Use undo to go back.' });
  return true;
}

export function SettingsDialog() {
  const open = useStore((s) => s.settingsOpen);
  const themePref = useStore((s) => s.themePref);
  const notify = useStore((s) => s.notify);
  const session = useStore((s) => s.session);
  const world = useStore((s) => s.world);
  const source = useStore((s) => s.source);
  const canEdit = !!session?.canEdit;
  const fileRef = useRef<HTMLInputElement>(null);
  const [history, setHistory] = useState<{ version: number; updatedAt: number; size: number }[] | null>(null);
  if (!open) return null;
  const close = () => {
    useStore.setState({ settingsOpen: false });
    setHistory(null);
  };
  const needEdit = () => {
    if (canEdit) return true;
    useStore.setState({ settingsOpen: false, loginOpen: true });
    return false;
  };
  return (
    <Modal title="Settings" onClose={close}>
      <div className="settings">
        <div className="setting">
          <div>
            <b>Appearance</b>
            <div className="muted small">Follow the system, or pick one.</div>
          </div>
          <Segmented
            value={themePref}
            onChange={setThemePref}
            options={[
              { value: 'auto', label: <Monitor size={14} /> },
              { value: 'light', label: <Sun size={14} /> },
              { value: 'dark', label: <Moon size={14} /> },
            ]}
          />
        </div>
        <div className="setting">
          <div>
            <b>Desktop notifications</b>
            <div className="muted small">Get notified when something goes down while this tab is in the background.</div>
          </div>
          <button className={`btn sm ${notify ? 'primary' : ''}`} onClick={() => void setNotify(!notify)}>
            {notify ? <Bell size={14} /> : <BellOff size={14} />} {notify ? 'On' : 'Off'}
          </button>
        </div>
        <div className="setting">
          <div>
            <b>Layout</b>
            <div className="muted small">Back up or move your world as JSON.</div>
          </div>
          <div className="btn-row">
            <button className="btn sm" disabled={!world} onClick={() => world && download(`isometric-uptime-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(world, null, 2))}>
              <Download size={14} /> Export
            </button>
            <button className="btn sm" onClick={() => needEdit() && fileRef.current?.click()}>
              <Upload size={14} /> Import
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (!f) return;
                try {
                  const data = JSON.parse(await f.text());
                  if (replaceWorld(data.world ?? data, 'Layout imported')) close();
                } catch (err) {
                  toast({ kind: 'error', title: 'Could not read file', body: (err as Error).message });
                }
              }}
            />
          </div>
        </div>
        <div className="setting">
          <div>
            <b>Version history</b>
            <div className="muted small">Every save is kept (last 50).</div>
          </div>
          <button
            className="btn sm"
            onClick={async () => {
              if (!needEdit()) return;
              setHistory(await api.history());
            }}
          >
            <History size={14} /> Show
          </button>
        </div>
        {history && (
          <div className="history">
            {history.map((h) => (
              <div key={h.version} className="history-row">
                <span>v{h.version}</span>
                <span className="muted small">
                  {new Date(h.updatedAt).toLocaleString()} · {timeAgo(h.updatedAt)}
                </span>
                <button
                  className="btn sm"
                  onClick={async () => {
                    const r = await api.historyVersion(h.version);
                    if (replaceWorld(r.world, `Restored version ${h.version}`)) close();
                  }}
                >
                  Restore
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="setting">
          <div>
            <b>Example layout</b>
            <div className="muted small">Replace the world with the demo home + datacenter to play around.</div>
          </div>
          <button
            className="btn sm"
            onClick={async () => {
              if (!needEdit()) return;
              const r = await api.demoWorld();
              if (replaceWorld(r.world, 'Example layout loaded')) close();
            }}
          >
            <Sparkles size={14} /> Load
          </button>
        </div>
        <div className="about muted small">
          Isometric Uptime {session?.version} · {source?.mode === 'demo' ? 'demo mode' : `Uptime Kuma ${source?.state ?? ''}`}
          {session?.kumaUrl && (
            <>
              {' · '}
              <a className="link" href={session.kumaUrl} target="_blank" rel="noreferrer">
                open Kuma
              </a>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

export function ClustersDialog() {
  const open = useStore((s) => s.clustersOpen);
  const world = useStore((s) => s.world);
  const [sel, setSel] = useState<string | null>(null);
  if (!open || !world) return null;
  const current = world.clusters.find((c) => c.id === sel) ?? world.clusters[0];
  return (
    <Modal title={<><Network size={16} /> Clusters</>} onClose={() => useStore.setState({ clustersOpen: false })} wide>
      <div className="clusters">
        <div className="clusters-list">
          {world.clusters.map((c) => (
            <button key={c.id} className={`row ${current?.id === c.id ? 'active' : ''}`} onClick={() => setSel(c.id)}>
              <span className="swatch" style={{ background: c.color }} />
              <span className="row-main">
                <span className="row-title">{c.name}</span>
                <span className="row-sub">
                  {c.members.length} members · {c.guests.length + c.services.length} HA workloads
                </span>
              </span>
            </button>
          ))}
          <button className="btn sm" onClick={() => setSel(newClusterAndSelect())}>
            <Plus size={13} /> New cluster
          </button>
          <p className="muted small">A cluster groups devices anywhere in your world. Workloads attached to a cluster float between its members – ideal for Proxmox HA or Kubernetes, where you can't tell which node is running something.</p>
        </div>
        <div className="clusters-form">{current ? <ClusterForm c={current} /> : <div className="empty-note pad">Create your first cluster.</div>}</div>
      </div>
    </Modal>
  );
}

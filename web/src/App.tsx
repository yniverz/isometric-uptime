import { useEffect, useState } from 'react';
import { Scene } from './scene/Scene';
import { openStream } from './state/api';
import { worldHealth } from './state/health';
import {
  applyMonitors,
  applySnapshot,
  isDark,
  loadSession,
  loadWorld,
  navigateUp,
  onRemoteWorld,
  readHash,
  redo,
  removeMonitors,
  select,
  setEdit,
  undo,
  useStore,
} from './state/store';
import { commit } from './state/store';
import { removeEntity, rotateUnit } from './ui/editor/ops';
import { EmptyWorld, SearchPalette, SidePanel, Toasts, Tooltip, TopBar, ZoomControls } from './ui/chrome';
import { ClustersDialog, LoginDialog, LoginScreen, SettingsDialog } from './ui/dialogs';

const STATUS_COLORS: Record<string, string> = { up: '#22c58b', down: '#ff5a64', degraded: '#ff8a3d', pending: '#f5b331', maintenance: '#5b8cff' };

function useMedia(q: string) {
  const [m, setM] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setM(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [q]);
  return m;
}

/** Favicon + title reflect overall health. */
function useHealthChrome() {
  const summary = useStore((s) => {
    if (!s.world) return '';
    const h = worldHealth(s.world, s.monitors);
    return `${h.rollup}|${h.machines.down + h.services.down}`;
  });
  useEffect(() => {
    if (!summary) return;
    const [rollup, downStr] = summary.split('|');
    const down = Number(downStr);
    document.title = down ? `(${down} down) Isometric Uptime` : 'Isometric Uptime';
    const color = STATUS_COLORS[rollup] ?? '#9aa9c0';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><polygon points="32,6 56,20 32,34 8,20" fill="#93A5CC"/><polygon points="8,20 32,34 32,60 8,46" fill="#7084AE"/><polygon points="56,20 32,34 32,60 56,46" fill="#4B5B82"/><circle cx="48" cy="48" r="13" fill="${color}" stroke="white" stroke-width="4"/></svg>`;
    const link = document.getElementById('favicon') as HTMLLinkElement | null;
    if (link) link.href = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  }, [summary]);
}

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
      const s = useStore.getState();
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        useStore.setState({ searchOpen: !s.searchOpen });
        return;
      }
      if (typing) return;
      if (s.searchOpen || s.loginOpen || s.settingsOpen || s.clustersOpen) return;
      if (e.key === 'Escape') {
        if (s.edit && s.selected) select(null);
        else navigateUp();
      } else if (mod && e.key.toLowerCase() === 'z' && s.edit) {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && e.key.toLowerCase() === 'y' && s.edit) {
        e.preventDefault();
        redo();
      } else if (e.key === '/' ) {
        e.preventDefault();
        useStore.setState({ searchOpen: true });
      } else if (e.key.toLowerCase() === 'r' && !mod && s.edit && s.selected) {
        rotateUnit(s.selected);
      } else if (e.key.toLowerCase() === 'e' && !mod) {
        setEdit(!s.edit);
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && s.edit && s.selected) {
        const id = s.selected;
        if (window.confirm('Delete the selected item?')) {
          commit((w) => removeEntity(w, id));
          select(null);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

export function App() {
  const session = useStore((s) => s.session);
  const world = useStore((s) => s.world);
  const dark = useStore(isDark);
  const [error, setError] = useState<string | null>(null);
  const mobile = useMedia('(max-width: 760px)');
  const [panelOpen, setPanelOpen] = useState(true);
  const [sheet, setSheet] = useState<'peek' | 'half' | 'full'>('peek');

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0e1422' : '#dfe7ef');
  }, [dark]);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const on = () => useStore.setState({ systemDark: mq.matches });
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  useEffect(() => {
    loadSession().catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    if (!session?.canRead) return;
    useStore.setState({ focus: readHash() });
    loadWorld().catch((e) => setError(String(e)));
    return openStream({
      snapshot: (d) => applySnapshot(d.monitors, d.source),
      monitors: applyMonitors,
      removed: removeMonitors,
      source: (s) => useStore.setState({ source: s }),
      world: (d) => void onRemoteWorld(d.version),
      open: () => useStore.setState({ streamOk: true }),
      error: () => useStore.setState({ streamOk: false }),
    });
  }, [session?.canRead]);

  useEffect(() => {
    const onHash = () => useStore.setState({ focus: readHash() });
    window.addEventListener('popstate', onHash);
    return () => window.removeEventListener('popstate', onHash);
  }, []);

  // Open the sheet a bit when the user drills down on mobile.
  const depth = useStore((s) => s.focus.path.length + (s.focus.sub ? 1 : 0));
  useEffect(() => {
    if (mobile && depth >= 3 && sheet === 'peek') setSheet('half');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depth, mobile]);

  useHealthChrome();
  useShortcuts();

  if (error)
    return (
      <div className="fatal">
        <h2>Something went wrong</h2>
        <p className="muted">{error}</p>
        <button className="btn" onClick={() => location.reload()}>
          Reload
        </button>
      </div>
    );
  if (!session) return <div className="loading-screen"><div className="loader" /></div>;
  if (!session.canRead) return <LoginScreen />;

  const vh = window.innerHeight;
  const sheetH = sheet === 'peek' ? 150 : sheet === 'half' ? vh * 0.5 : vh * 0.86;
  const insets = mobile ? { top: 64, right: 0, bottom: sheetH, left: 0 } : { top: 72, right: panelOpen ? 412 : 0, bottom: 0, left: 0 };

  return (
    <div className={`app ${mobile ? 'mobile' : ''}`}>
      {world ? <Scene insets={insets} /> : <div className="loading-screen"><div className="loader" /></div>}
      <TopBar />
      <SidePanel open={panelOpen} setOpen={setPanelOpen} mobile={mobile} sheet={sheet} setSheet={setSheet} />
      {!mobile && <ZoomControls />}
      <EmptyWorld />
      <Tooltip />
      <Toasts />
      <SearchPalette />
      <LoginDialog />
      <SettingsDialog />
      <ClustersDialog />
    </div>
  );
}

import { create } from 'zustand';
import type { World } from '../../../shared/model';
import { normalizeWorld } from '../../../shared/model';
import type { MonitorDTO, SessionDTO, SourceState } from '../../../shared/status';
import { api, ApiError } from './api';
import { indexWorld, invalidateIndex, resolvePath } from './index';
import { useHover } from './ephemeral';

export type Level = 'world' | 'site' | 'building' | 'rack' | 'machine';
export type ThemePref = 'auto' | 'light' | 'dark';

export interface Toast {
  id: number;
  kind: 'down' | 'up' | 'info' | 'error' | 'warn';
  title: string;
  body?: string;
  path?: string[];
  sub?: string | null;
  action?: { label: string; run: () => void };
  sticky?: boolean;
}

export interface Focus {
  path: string[];
  /** Selected service/guest inside the focused machine. */
  sub?: string | null;
  /** Highlighted cluster (shows links between members). */
  cluster?: string | null;
}

interface State {
  session: SessionDTO | null;
  world: World | null;
  worldVersion: number;
  monitors: Record<number, MonitorDTO>;
  source: SourceState | null;
  streamOk: boolean;

  focus: Focus;

  edit: boolean;
  selected: string | null;
  saveState: 'idle' | 'pending' | 'saving' | 'saved' | 'error' | 'conflict';
  past: World[];
  future: World[];

  themePref: ThemePref;
  systemDark: boolean;
  notify: boolean;

  toasts: Toast[];
  searchOpen: boolean;
  loginOpen: boolean;
  clustersOpen: boolean;
  settingsOpen: boolean;
}

const ls = {
  get(k: string): string | null {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string) {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* private mode */
    }
  },
};

const prefersDark = typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;

export const useStore = create<State>(() => ({
  session: null,
  world: null,
  worldVersion: 0,
  monitors: {},
  source: null,
  streamOk: false,
  focus: { path: [] },
  edit: false,
  selected: null,
  saveState: 'idle',
  past: [],
  future: [],
  themePref: (ls.get('iu.theme') as ThemePref) || 'auto',
  systemDark: !!prefersDark,
  notify: ls.get('iu.notify') === '1',
  toasts: [],
  searchOpen: false,
  loginOpen: false,
  clustersOpen: false,
  settingsOpen: false,
}));

const set = useStore.setState;
const get = useStore.getState;

// ---------------------------------------------------------------------------
// Derived
// ---------------------------------------------------------------------------

export function levelOf(world: World | null, path: string[]): Level {
  if (!path.length || !world) return 'world';
  if (path.length === 1) return 'site';
  if (path.length === 2) return 'building';
  const r = resolvePath(world, path);
  if (path.length === 3 && r.unit?.kind === 'rack') return 'rack';
  return 'machine';
}

export function useLevel(): Level {
  return useStore((s) => levelOf(s.world, s.focus.path));
}

export function isDark(s: Pick<State, 'themePref' | 'systemDark'>): boolean {
  return s.themePref === 'dark' || (s.themePref === 'auto' && s.systemDark);
}

// ---------------------------------------------------------------------------
// Navigation (mirrored into the URL hash so views can be bookmarked)
// ---------------------------------------------------------------------------

function writeHash(f: Focus) {
  const parts = ['', ...f.path];
  let h = '#' + (parts.join('/') || '/');
  if (f.sub) h += `?sub=${encodeURIComponent(f.sub)}`;
  else if (f.cluster) h += `?cluster=${encodeURIComponent(f.cluster)}`;
  if (location.hash !== h) history.replaceState(null, '', h);
}

export function readHash(): Focus {
  const raw = location.hash.replace(/^#\/?/, '');
  const [p, q] = raw.split('?');
  const path = p ? p.split('/').filter(Boolean).map(decodeURIComponent) : [];
  const params = new URLSearchParams(q ?? '');
  return { path, sub: params.get('sub'), cluster: params.get('cluster') };
}

export function navigate(path: string[], extra: Partial<Focus> = {}) {
  const focus: Focus = { path, sub: extra.sub ?? null, cluster: extra.cluster ?? null };
  set({ focus, selected: get().edit ? get().selected : null });
  useHover.setState({ hover: null });
  writeHash(focus);
}

export function navigateUp() {
  const { focus, world } = get();
  if (focus.cluster) return navigate(focus.path);
  if (focus.sub) return navigate(focus.path);
  if (!focus.path.length) return;
  let path = focus.path.slice(0, -1);
  // Standalone machines are one level shallower than rack devices.
  if (path.length === 3 && levelOf(world, path) === 'machine') path = path.slice(0, 2);
  navigate(path);
}

export function selectSub(sub: string | null) {
  const f = { ...get().focus, sub };
  set({ focus: f });
  writeHash(f);
}

export function focusCluster(id: string | null) {
  const f: Focus = { path: id ? [] : get().focus.path, cluster: id, sub: null };
  set({ focus: f });
  useHover.setState({ hover: null });
  writeHash(f);
}

/** Navigate to any entity by id (sites ... services, clusters). */
export function goToEntity(id: string) {
  const world = get().world;
  if (!world) return;
  const e = indexWorld(world).get(id);
  if (!e) return;
  if (e.kind === 'cluster') return focusCluster(id);
  if (e.kind === 'service' || e.kind === 'guest') {
    if (e.ownerKind === 'cluster') {
      // Show the cluster; its services live on every member.
      return focusCluster(e.owner.id);
    }
    return navigate(e.path, { sub: id });
  }
  navigate(e.path);
}

// ---------------------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------------------

let toastId = 1;
export function toast(t: Omit<Toast, 'id'>, ttl = 6000) {
  const id = toastId++;
  set({ toasts: [...get().toasts.slice(-4), { ...t, id }] });
  if (!t.sticky) setTimeout(() => dismissToast(id), ttl);
  return id;
}
export function dismissToast(id: number) {
  set({ toasts: get().toasts.filter((t) => t.id !== id) });
}

// ---------------------------------------------------------------------------
// Monitors
// ---------------------------------------------------------------------------

const ownerCache = new WeakMap<World, Map<number, { name: string; path: string[]; sub: string | null }>>();
export function monitorOwners(world: World) {
  const hit = ownerCache.get(world);
  if (hit) return hit;
  const map = new Map<number, { name: string; path: string[]; sub: string | null }>();
  for (const [id, e] of indexWorld(world)) {
    let mid: number | null | undefined;
    let name = '';
    if (e.kind === 'machine') {
      mid = e.machine.monitorId;
      name = e.machine.name;
    } else if (e.kind === 'service') {
      mid = e.service.monitorId;
      name = `${e.service.name} on ${e.guest?.name ?? e.owner.name}`;
    } else if (e.kind === 'guest') {
      mid = e.guest.monitorId;
      name = `${e.guest.name} (${e.guest.kind.toUpperCase()})`;
    } else if (e.kind === 'cluster') {
      mid = e.cluster.monitorId;
      name = `Cluster ${e.cluster.name}`;
    }
    if (mid != null && !map.has(mid)) map.set(mid, { name, path: e.path, sub: e.kind === 'service' || e.kind === 'guest' ? id : null });
  }
  ownerCache.set(world, map);
  return map;
}

export function applySnapshot(monitors: MonitorDTO[], source: SourceState) {
  const map: Record<number, MonitorDTO> = {};
  for (const m of monitors) map[m.id] = m;
  set({ monitors: map, source });
}

export function applyMonitors(dtos: MonitorDTO[]) {
  const prev = get().monitors;
  const next = { ...prev };
  const world = get().world;
  const owners = world ? monitorOwners(world) : null;
  for (const d of dtos) {
    const old = prev[d.id];
    next[d.id] = d;
    if (!old || old.status === d.status || !owners) continue;
    const owner = owners.get(d.id);
    if (!owner) continue;
    if (d.status === 'down') {
      toast({ kind: 'down', title: `${owner.name} is down`, body: d.msg ?? undefined, path: owner.path, sub: owner.sub }, 10000);
      notifyBrowser(`${owner.name} is DOWN`, d.msg ?? '');
    } else if (old.status === 'down' && d.status === 'up') {
      toast({ kind: 'up', title: `${owner.name} is back up`, path: owner.path, sub: owner.sub });
      notifyBrowser(`${owner.name} is back UP`, '');
    }
  }
  set({ monitors: next });
}

export function removeMonitors(ids: number[]) {
  const next = { ...get().monitors };
  for (const id of ids) delete next[id];
  set({ monitors: next });
}

function notifyBrowser(title: string, body: string) {
  if (!get().notify || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  if (document.visibilityState === 'visible' && document.hasFocus()) return;
  try {
    new Notification(title, { body, icon: '/favicon.svg', tag: title });
  } catch {
    /* ignore */
  }
}

export async function setNotify(on: boolean) {
  if (on && typeof Notification !== 'undefined' && Notification.permission !== 'granted') {
    const p = await Notification.requestPermission();
    if (p !== 'granted') {
      toast({ kind: 'warn', title: 'Notifications blocked', body: 'Allow notifications for this site in your browser settings.' });
      on = false;
    }
  }
  ls.set('iu.notify', on ? '1' : '0');
  set({ notify: on });
}

export function setThemePref(p: ThemePref) {
  ls.set('iu.theme', p);
  set({ themePref: p });
}

// ---------------------------------------------------------------------------
// Session & world loading
// ---------------------------------------------------------------------------

export async function loadSession() {
  const session = await api.session();
  set({ session });
  return session;
}

export async function loadWorld() {
  const { version, world } = await api.world();
  set({ world: normalizeWorld(world), worldVersion: version, past: [], future: [] });
}

export async function login(username: string, password: string) {
  await api.login(username, password);
  await loadSession();
  set({ loginOpen: false });
}

export async function logout() {
  await api.logout();
  set({ edit: false });
  const s = await loadSession();
  if (!s.canRead) set({ world: null, monitors: {} });
}

// ---------------------------------------------------------------------------
// Editing
// ---------------------------------------------------------------------------

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let savingNow = false;
let lastSavedVersion = 0;

export function setEdit(on: boolean) {
  if (on && !get().session?.canEdit) {
    set({ loginOpen: true });
    return;
  }
  set({ edit: on, selected: null });
}

export function select(id: string | null) {
  set({ selected: id });
}

let lastKey: string | null = null;
let lastAt = 0;

/**
 * Apply a change to the world. The mutator receives a deep copy.
 * Consecutive commits with the same `key` (e.g. typing in one field) share one undo step.
 */
export function commit(mutate: (w: World) => void, opts: { key?: string } = {}) {
  const { world, past } = get();
  if (!world) return;
  const draft = structuredClone(world);
  mutate(draft);
  // The mutator may have indexed the draft before changing its structure.
  invalidateIndex(draft);
  const now = Date.now();
  const coalesce = !!opts.key && opts.key === lastKey && now - lastAt < 2000 && past.length > 0;
  lastKey = opts.key ?? null;
  lastAt = now;
  const nextPast = coalesce ? past : [...past.slice(-60), world];
  set({ world: draft, past: nextPast, future: [], saveState: 'pending' });
  scheduleSave();
}

/** Replace the world without a deep copy (used while dragging). */
export function commitLive(world: World) {
  set({ world, saveState: 'pending' });
  scheduleSave(1200);
}

/** Remember the current world as an undo point (call before a drag starts). */
export function checkpoint() {
  const { world, past } = get();
  if (world) set({ past: [...past.slice(-60), world], future: [] });
}

export function undo() {
  const { past, world, future } = get();
  if (!past.length || !world) return;
  set({ world: past[past.length - 1], past: past.slice(0, -1), future: [world, ...future], saveState: 'pending' });
  scheduleSave();
}

export function redo() {
  const { past, world, future } = get();
  if (!future.length || !world) return;
  set({ world: future[0], future: future.slice(1), past: [...past, world], saveState: 'pending' });
  scheduleSave();
}

function scheduleSave(delay = 700) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => void save(), delay);
}

export async function save(force = false) {
  const { world, worldVersion } = get();
  if (!world) return;
  if (savingNow) return scheduleSave(400);
  savingNow = true;
  set({ saveState: 'saving' });
  try {
    const res = await api.saveWorld(worldVersion, world, force);
    lastSavedVersion = res.version;
    set({ worldVersion: res.version, saveState: get().saveState === 'saving' ? 'saved' : get().saveState });
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) {
      set({ saveState: 'conflict' });
      toast({
        kind: 'warn',
        title: 'Someone else changed the layout',
        body: 'Reload their version, or overwrite it with yours.',
        sticky: true,
        action: { label: 'Overwrite', run: () => void save(true) },
      });
    } else {
      set({ saveState: 'error' });
      toast({ kind: 'error', title: 'Saving failed', body: (err as Error).message });
    }
  } finally {
    savingNow = false;
  }
}

/** Called when the server announces a new world version. */
export async function onRemoteWorld(version: number) {
  if (version === lastSavedVersion || version <= get().worldVersion) return;
  const st = get().saveState;
  if (st === 'pending' || st === 'saving') return; // our save will get a conflict
  await loadWorld();
}

if (import.meta.env.DEV) (window as unknown as { __store: typeof useStore }).__store = useStore;

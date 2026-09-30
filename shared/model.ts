/**
 * The world model: everything the user lays out in the editor.
 *
 * All positions and sizes are in "tiles" (1 tile = 0.6 m, a raised-floor tile).
 * Positions are relative to the parent container:
 *   world -> site.pos -> building.pos -> unit.pos
 *
 * The model deliberately keeps ids globally unique so later features
 * (network links, VPN tunnels, ...) can reference any entity by id.
 */

export const WORLD_SCHEMA = 1;

export interface Vec2 {
  x: number;
  y: number;
}

export type SiteTheme = 'grass' | 'urban' | 'sand' | 'snow';
export type BuildingKind = 'residential' | 'commercial' | 'industrial';
export type FloorMaterial = 'raised' | 'wood' | 'carpet' | 'concrete' | 'tile';
export type Facing = 'left' | 'right';
export type GuestKind = 'vm' | 'lxc' | 'container';
export type ClusterKind = 'proxmox' | 'kubernetes' | 'swarm' | 'generic';

export type DeviceType =
  // rack-mountable or standalone
  | 'server'
  | 'switch'
  | 'router'
  | 'firewall'
  | 'nas'
  | 'ups'
  | 'patch-panel'
  | 'pdu'
  | 'kvm'
  | 'blank'
  // standalone
  | 'tower-server'
  | 'desktop'
  | 'laptop'
  | 'mini-pc'
  | 'sbc'
  | 'access-point'
  | 'modem'
  | 'camera'
  | 'printer'
  | 'smart-hub'
  | 'tv'
  | 'phone'
  | 'iot';

export interface Service {
  id: string;
  name: string;
  monitorId?: number | null;
  url?: string;
}

export interface Guest {
  id: string;
  name: string;
  kind: GuestKind;
  monitorId?: number | null;
  services: Service[];
  inventory?: Inventory;
}

export interface Inventory {
  ip?: string;
  os?: string;
  cpu?: string;
  ram?: string;
  disk?: string;
  serial?: string;
  purchased?: string;
  url?: string;
  notes?: string;
}

export interface Machine {
  id: string;
  name: string;
  type: DeviceType;
  /** Monitor that represents the machine itself (ping, agent, ...). Drives the main LED. */
  monitorId?: number | null;
  services: Service[];
  guests: Guest[];
  inventory: Inventory;
}

/** A machine mounted in a rack. `u` is the lowest occupied slot (1-based), `size` in rack units. */
export interface RackDevice extends Machine {
  u: number;
  size: number;
}

export interface RackUnit {
  id: string;
  kind: 'rack';
  name: string;
  pos: Vec2;
  facing: Facing;
  heightU: number;
  devices: RackDevice[];
}

export interface MachineUnit extends Machine {
  kind: 'machine';
  pos: Vec2;
  facing: Facing;
}

export type Unit = RackUnit | MachineUnit;

export interface Room {
  id: string;
  name: string;
  x: number;
  y: number;
  w: number;
  d: number;
  floor: FloorMaterial;
}

export interface Building {
  id: string;
  name: string;
  kind: BuildingKind;
  pos: Vec2;
  w: number;
  d: number;
  /** Visual number of storeys for the exterior. The interior shows the ground floor. */
  floors: number;
  floor: FloorMaterial;
  rooms: Room[];
  units: Unit[];
}

export interface Site {
  id: string;
  name: string;
  description?: string;
  theme: SiteTheme;
  pos: Vec2;
  w: number;
  d: number;
  buildings: Building[];
}

/**
 * A group of machines that behaves as one (Proxmox HA, k8s, ...).
 * Members may live anywhere in the world. HA guests/services attached to
 * the cluster are not bound to a single machine.
 */
export interface Cluster {
  id: string;
  name: string;
  kind: ClusterKind;
  color: string;
  members: string[];
  /** Minimum members that must be up. Defaults to a majority. */
  quorum?: number | null;
  /** Optional monitor for the cluster itself (e.g. a VIP or API endpoint). */
  monitorId?: number | null;
  guests: Guest[];
  services: Service[];
}

export interface World {
  schema: number;
  sites: Site[];
  clusters: Cluster[];
}

export function emptyWorld(): World {
  return { schema: WORLD_SCHEMA, sites: [], clusters: [] };
}

// ---------------------------------------------------------------------------
// Device catalog
// ---------------------------------------------------------------------------

export interface DeviceTypeInfo {
  label: string;
  group: 'Compute' | 'Network' | 'Power' | 'Storage' | 'Endpoint' | 'Rack accessory';
  rack: boolean;
  standalone: boolean;
  defaultU: number;
  /** Standalone footprint in tiles [w (along x when facing left), d] */
  footprint: [number, number];
  /** Whether it usually carries a status (patch panels and blanks don't). */
  monitored: boolean;
}

export const DEVICE_TYPES: Record<DeviceType, DeviceTypeInfo> = {
  server: { label: 'Server', group: 'Compute', rack: true, standalone: false, defaultU: 2, footprint: [1, 2], monitored: true },
  'tower-server': { label: 'Tower server', group: 'Compute', rack: false, standalone: true, defaultU: 4, footprint: [1, 1], monitored: true },
  desktop: { label: 'Desktop PC', group: 'Endpoint', rack: false, standalone: true, defaultU: 4, footprint: [3, 2], monitored: true },
  laptop: { label: 'Laptop', group: 'Endpoint', rack: false, standalone: true, defaultU: 1, footprint: [2, 2], monitored: true },
  'mini-pc': { label: 'Mini PC / NUC', group: 'Compute', rack: true, standalone: true, defaultU: 1, footprint: [2, 1], monitored: true },
  sbc: { label: 'Raspberry Pi / SBC', group: 'Compute', rack: true, standalone: true, defaultU: 1, footprint: [2, 1], monitored: true },
  switch: { label: 'Switch', group: 'Network', rack: true, standalone: true, defaultU: 1, footprint: [2, 1], monitored: true },
  router: { label: 'Router', group: 'Network', rack: true, standalone: true, defaultU: 1, footprint: [2, 1], monitored: true },
  firewall: { label: 'Firewall', group: 'Network', rack: true, standalone: true, defaultU: 1, footprint: [2, 1], monitored: true },
  modem: { label: 'Modem / ONT', group: 'Network', rack: false, standalone: true, defaultU: 1, footprint: [2, 1], monitored: true },
  'access-point': { label: 'Wi-Fi access point', group: 'Network', rack: false, standalone: true, defaultU: 1, footprint: [1, 1], monitored: true },
  'patch-panel': { label: 'Patch panel', group: 'Rack accessory', rack: true, standalone: false, defaultU: 1, footprint: [1, 1], monitored: false },
  nas: { label: 'NAS / Storage', group: 'Storage', rack: true, standalone: true, defaultU: 2, footprint: [1, 1], monitored: true },
  ups: { label: 'UPS', group: 'Power', rack: true, standalone: true, defaultU: 2, footprint: [1, 1], monitored: true },
  pdu: { label: 'PDU', group: 'Power', rack: true, standalone: false, defaultU: 1, footprint: [1, 1], monitored: true },
  kvm: { label: 'KVM console', group: 'Rack accessory', rack: true, standalone: false, defaultU: 1, footprint: [1, 1], monitored: false },
  blank: { label: 'Blank panel', group: 'Rack accessory', rack: true, standalone: false, defaultU: 1, footprint: [1, 1], monitored: false },
  camera: { label: 'IP camera', group: 'Endpoint', rack: false, standalone: true, defaultU: 1, footprint: [1, 1], monitored: true },
  printer: { label: 'Printer', group: 'Endpoint', rack: false, standalone: true, defaultU: 1, footprint: [2, 1], monitored: true },
  'smart-hub': { label: 'Smart home hub', group: 'Endpoint', rack: false, standalone: true, defaultU: 1, footprint: [2, 1], monitored: true },
  tv: { label: 'TV / Media player', group: 'Endpoint', rack: false, standalone: true, defaultU: 1, footprint: [3, 1], monitored: true },
  phone: { label: 'Phone / Tablet', group: 'Endpoint', rack: false, standalone: true, defaultU: 1, footprint: [2, 1], monitored: true },
  iot: { label: 'IoT device', group: 'Endpoint', rack: false, standalone: true, defaultU: 1, footprint: [1, 1], monitored: true },
};

export const RACK_SIZES = [6, 9, 12, 15, 18, 22, 24, 27, 32, 42, 45, 47];

/** Rack footprint (tiles). Width across the front, depth front-to-back. */
export const RACK_WIDTH = 1;
export const RACK_DEPTH = 2;
/** One rack unit in tiles (44.45 mm / 600 mm). */
export const U_HEIGHT = 0.0741;
export const RACK_BASE = 0.12;
export const RACK_TOP = 0.14;

export function rackHeight(heightU: number): number {
  return RACK_BASE + heightU * U_HEIGHT + RACK_TOP;
}

/** Footprint of a unit in tiles, taking facing into account. [w along x, d along y] */
export function unitFootprint(u: Unit): [number, number] {
  let fw: number;
  let fd: number;
  if (u.kind === 'rack') {
    fw = RACK_WIDTH;
    fd = RACK_DEPTH;
  } else {
    [fw, fd] = DEVICE_TYPES[u.type]?.footprint ?? [1, 1];
  }
  return u.facing === 'right' ? [fd, fw] : [fw, fd];
}

// ---------------------------------------------------------------------------
// Tree helpers
// ---------------------------------------------------------------------------

export type EntityKind = 'site' | 'building' | 'room' | 'rack' | 'machine' | 'device' | 'guest' | 'service' | 'cluster';

export interface EntityRef {
  kind: EntityKind;
  id: string;
  name: string;
  /** Navigation path of ids from site down to the entity (or its owning machine for guests/services). */
  path: string[];
  /** Human readable location. */
  location: string;
  /** For guests and services: the id of the owning machine or cluster. */
  ownerId?: string;
  monitorId?: number | null;
}

/** Walks every entity in the world. */
export function walkWorld(world: World, fn: (e: EntityRef) => void): void {
  for (const s of world.sites) {
    fn({ kind: 'site', id: s.id, name: s.name, path: [s.id], location: '' });
    for (const b of s.buildings) {
      const bLoc = s.name;
      fn({ kind: 'building', id: b.id, name: b.name, path: [s.id, b.id], location: bLoc });
      for (const r of b.rooms) {
        fn({ kind: 'room', id: r.id, name: r.name, path: [s.id, b.id], location: `${s.name} › ${b.name}` });
      }
      for (const u of b.units) {
        const uLoc = `${s.name} › ${b.name}`;
        if (u.kind === 'rack') {
          fn({ kind: 'rack', id: u.id, name: u.name, path: [s.id, b.id, u.id], location: uLoc });
          for (const d of u.devices) {
            const path = [s.id, b.id, u.id, d.id];
            fn({ kind: 'device', id: d.id, name: d.name, path, location: `${uLoc} › ${u.name}`, monitorId: d.monitorId });
            walkMachineChildren(d, path, `${uLoc} › ${u.name} › ${d.name}`, fn);
          }
        } else {
          const path = [s.id, b.id, u.id];
          fn({ kind: 'machine', id: u.id, name: u.name, path, location: uLoc, monitorId: u.monitorId });
          walkMachineChildren(u, path, `${uLoc} › ${u.name}`, fn);
        }
      }
    }
  }
  for (const c of world.clusters) {
    fn({ kind: 'cluster', id: c.id, name: c.name, path: [], location: 'Cluster', monitorId: c.monitorId });
    for (const g of c.guests) {
      fn({ kind: 'guest', id: g.id, name: g.name, path: [], location: `Cluster ${c.name}`, ownerId: c.id, monitorId: g.monitorId });
      for (const sv of g.services) {
        fn({ kind: 'service', id: sv.id, name: sv.name, path: [], location: `Cluster ${c.name} › ${g.name}`, ownerId: c.id, monitorId: sv.monitorId });
      }
    }
    for (const sv of c.services) {
      fn({ kind: 'service', id: sv.id, name: sv.name, path: [], location: `Cluster ${c.name}`, ownerId: c.id, monitorId: sv.monitorId });
    }
  }
}

function walkMachineChildren(m: Machine, path: string[], loc: string, fn: (e: EntityRef) => void) {
  for (const g of m.guests) {
    fn({ kind: 'guest', id: g.id, name: g.name, path, location: loc, ownerId: m.id, monitorId: g.monitorId });
    for (const sv of g.services) {
      fn({ kind: 'service', id: sv.id, name: sv.name, path, location: `${loc} › ${g.name}`, ownerId: m.id, monitorId: sv.monitorId });
    }
  }
  for (const sv of m.services) {
    fn({ kind: 'service', id: sv.id, name: sv.name, path, location: loc, ownerId: m.id, monitorId: sv.monitorId });
  }
}

export function allMachines(world: World): { machine: Machine; path: string[]; location: string }[] {
  const out: { machine: Machine; path: string[]; location: string }[] = [];
  for (const s of world.sites)
    for (const b of s.buildings)
      for (const u of b.units) {
        if (u.kind === 'rack') {
          for (const d of u.devices) out.push({ machine: d, path: [s.id, b.id, u.id, d.id], location: `${s.name} › ${b.name} › ${u.name}` });
        } else out.push({ machine: u, path: [s.id, b.id, u.id], location: `${s.name} › ${b.name}` });
      }
  return out;
}

/** Monitor ids referenced anywhere in the world, mapped to a description of where. */
export function monitorUsage(world: World): Map<number, string[]> {
  const usage = new Map<number, string[]>();
  walkWorld(world, (e) => {
    if (e.monitorId == null) return;
    const where = e.location ? `${e.location} › ${e.name}` : e.name;
    const list = usage.get(e.monitorId) ?? [];
    list.push(where);
    usage.set(e.monitorId, list);
  });
  return usage;
}

export function newId(prefix = ''): string {
  const rand = Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
  return prefix ? `${prefix}_${rand}` : rand;
}

/** Light structural validation. Returns an error message or null. */
export function validateWorld(w: unknown): string | null {
  if (!w || typeof w !== 'object') return 'World must be an object';
  const world = w as World;
  if (!Array.isArray(world.sites)) return 'World.sites must be an array';
  if (!Array.isArray(world.clusters)) return 'World.clusters must be an array';
  const ids = new Set<string>();
  let dup: string | null = null;
  try {
    walkWorld(world, (e) => {
      if (typeof e.id !== 'string' || !e.id) throw new Error(`Entity "${e.name}" has no id`);
      if (ids.has(e.id)) dup = e.id;
      ids.add(e.id);
    });
  } catch (err) {
    return (err as Error).message;
  }
  if (dup) return `Duplicate id "${dup}"`;
  return null;
}

// ---------------------------------------------------------------------------
// Sanitising (used for everything that comes from the network or a file)
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */
const str = (v: unknown, max = 200, def = ''): string => (typeof v === 'string' ? v.slice(0, max) : typeof v === 'number' ? String(v) : def);
const num = (v: unknown, min: number, max: number, def: number): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};
const mon = (v: unknown): number | null => (v == null || v === '' ? null : Number.isInteger(Number(v)) && Number(v) >= 0 ? Number(v) : null);
const oneOf = <T extends string>(v: unknown, allowed: readonly T[], def: T): T => (allowed.includes(v as T) ? (v as T) : def);
const idOf = (v: unknown, prefix: string): string => {
  const s = str(v, 64);
  return /^[A-Za-z0-9_-]+$/.test(s) ? s : newId(prefix);
};
const arr = (v: unknown, max = 5000): any[] => (Array.isArray(v) ? v.slice(0, max) : []);
const vec = (v: any): Vec2 => ({ x: num(v?.x, -100000, 100000, 0), y: num(v?.y, -100000, 100000, 0) });

/** Only http(s) links are kept – anything else (javascript:, data:, …) is dropped. */
export function safeUrl(v: unknown): string | undefined {
  const s = str(v, 2000).trim();
  if (!s) return undefined;
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:' ? s : undefined;
  } catch {
    return undefined;
  }
}

export function safeColor(v: unknown, def = '#8B7CF6'): string {
  const s = str(v, 16);
  return /^#[0-9a-fA-F]{3,8}$/.test(s) ? s : def;
}

const SITE_THEMES = ['grass', 'urban', 'sand', 'snow'] as const;
const BUILDING_KINDS = ['residential', 'commercial', 'industrial'] as const;
const FLOORS = ['raised', 'wood', 'carpet', 'concrete', 'tile'] as const;
const FACINGS = ['left', 'right'] as const;
const GUEST_KINDS = ['vm', 'lxc', 'container'] as const;
const CLUSTER_KINDS = ['proxmox', 'kubernetes', 'swarm', 'generic'] as const;

function cleanInventory(v: any): Inventory {
  const inv: Inventory = {};
  for (const k of ['ip', 'os', 'cpu', 'ram', 'disk', 'serial', 'purchased'] as const) if (v?.[k] != null && v[k] !== '') inv[k] = str(v[k], 200);
  if (v?.notes) inv.notes = str(v.notes, 5000);
  const url = safeUrl(v?.url);
  if (url) inv.url = url;
  return inv;
}

function cleanService(v: any): Service {
  const s: Service = { id: idOf(v?.id, 'svc'), name: str(v?.name, 120, 'Service'), monitorId: mon(v?.monitorId) };
  const url = safeUrl(v?.url);
  if (url) s.url = url;
  return s;
}

function cleanGuest(v: any): Guest {
  return { id: idOf(v?.id, 'guest'), name: str(v?.name, 120, 'guest'), kind: oneOf(v?.kind, GUEST_KINDS, 'vm'), monitorId: mon(v?.monitorId), services: arr(v?.services).map(cleanService), inventory: cleanInventory(v?.inventory) };
}

function cleanMachine(v: any): Machine {
  return {
    id: idOf(v?.id, 'm'),
    name: str(v?.name, 120, 'Device'),
    type: (Object.keys(DEVICE_TYPES) as DeviceType[]).includes(v?.type) ? v.type : 'server',
    monitorId: mon(v?.monitorId),
    services: arr(v?.services).map(cleanService),
    guests: arr(v?.guests).map(cleanGuest),
    inventory: cleanInventory(v?.inventory),
  };
}

function cleanUnit(v: any): Unit {
  if (v?.kind === 'rack') {
    const heightU = Math.round(num(v.heightU, 1, 60, 42));
    return {
      id: idOf(v.id, 'rack'),
      kind: 'rack',
      name: str(v.name, 120, 'Rack'),
      pos: vec(v.pos),
      facing: oneOf(v.facing, FACINGS, 'left'),
      heightU,
      devices: arr(v.devices, 200).map((d: any) => ({ ...cleanMachine(d), u: Math.round(num(d?.u, 1, heightU, 1)), size: Math.round(num(d?.size, 1, heightU, 1)) })),
    };
  }
  return { ...cleanMachine(v), kind: 'machine', pos: vec(v?.pos), facing: oneOf(v?.facing, FACINGS, 'left') };
}

/** Coerce anything into a well-formed world: fills defaults, clamps numbers, drops unsafe values. */
export function normalizeWorld(input: Partial<World> | unknown): World {
  const w = (input ?? {}) as any;
  return {
    schema: WORLD_SCHEMA,
    sites: arr(w.sites, 500).map((s: any) => ({
      id: idOf(s?.id, 'site'),
      name: str(s?.name, 120, 'Site'),
      ...(s?.description ? { description: str(s.description, 500) } : {}),
      theme: oneOf(s?.theme, SITE_THEMES, 'grass'),
      pos: vec(s?.pos),
      w: num(s?.w, 4, 1000, 30),
      d: num(s?.d, 4, 1000, 24),
      buildings: arr(s?.buildings, 500).map((b: any) => ({
        id: idOf(b?.id, 'b'),
        name: str(b?.name, 120, 'Building'),
        kind: oneOf(b?.kind, BUILDING_KINDS, 'residential'),
        pos: vec(b?.pos),
        w: num(b?.w, 2, 1000, 12),
        d: num(b?.d, 2, 1000, 10),
        floors: Math.round(num(b?.floors, 1, 50, 1)),
        floor: oneOf(b?.floor, FLOORS, 'concrete'),
        rooms: arr(b?.rooms, 500).map((r: any) => ({
          id: idOf(r?.id, 'room'),
          name: str(r?.name, 120, 'Room'),
          x: num(r?.x, 0, 1000, 0),
          y: num(r?.y, 0, 1000, 0),
          w: num(r?.w, 1, 1000, 4),
          d: num(r?.d, 1, 1000, 4),
          floor: oneOf(r?.floor, FLOORS, 'concrete'),
        })),
        units: arr(b?.units, 2000).map(cleanUnit),
      })),
    })),
    clusters: arr(w.clusters, 500).map((c: any) => ({
      id: idOf(c?.id, 'cluster'),
      name: str(c?.name, 120, 'cluster'),
      kind: oneOf(c?.kind, CLUSTER_KINDS, 'generic'),
      color: safeColor(c?.color),
      members: arr(c?.members, 1000).map((m: unknown) => str(m, 64)).filter(Boolean),
      quorum: c?.quorum == null || c.quorum === '' ? null : Math.round(num(c.quorum, 1, 1000, 1)),
      monitorId: mon(c?.monitorId),
      guests: arr(c?.guests).map(cleanGuest),
      services: arr(c?.services).map(cleanService),
    })),
  };
}

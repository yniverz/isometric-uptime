import type { Building, BuildingKind, Cluster, DeviceType, Guest, MachineUnit, RackDevice, RackUnit, Room, Service, Site, Unit, World } from '../../../../shared/model';
import { DEVICE_TYPES, newId, unitFootprint } from '../../../../shared/model';
import { indexWorld } from '../../state';
import { commit } from '../../state/store';

type Rect = { x: number; y: number; w: number; d: number };

function overlaps(a: Rect, b: Rect, gap = 0) {
  return a.x < b.x + b.w + gap && a.x + a.w + gap > b.x && a.y < b.y + b.d + gap && a.y + a.d + gap > b.y;
}

/** First free position (scanning rows) for a w×d footprint inside W×D. */
export function findFreeSpot(taken: Rect[], W: number, D: number, w: number, d: number, margin = 0, gap = 0): { x: number; y: number } | null {
  for (let y = margin; y + d <= D - margin; y += 1) {
    for (let x = margin; x + w <= W - margin; x += 1) {
      const r = { x, y, w, d };
      if (!taken.some((t) => overlaps(r, t, gap))) return { x, y };
    }
  }
  return null;
}

export function addSite(w: World, name = 'New site'): Site {
  let pos = { x: 0, y: 0 };
  if (w.sites.length) {
    // Place to the screen-right of the right-most site (x - y is the screen x axis).
    const right = w.sites.reduce((a, s) => (s.pos.x + s.w - s.pos.y > a.pos.x + a.w - a.pos.y ? s : a));
    pos = { x: right.pos.x + right.w + 12, y: right.pos.y - right.w - 12 + Math.round(right.d / 2) };
  }
  const site: Site = { id: newId('site'), name, theme: 'grass', pos, w: 30, d: 24, buildings: [] };
  w.sites.push(site);
  return site;
}

const BUILDING_DEFAULTS: Record<BuildingKind, Pick<Building, 'w' | 'd' | 'floors' | 'floor'> & { name: string }> = {
  residential: { name: 'House', w: 14, d: 10, floors: 2, floor: 'wood' },
  commercial: { name: 'Office', w: 12, d: 12, floors: 4, floor: 'carpet' },
  industrial: { name: 'Hall', w: 22, d: 16, floors: 2, floor: 'raised' },
};

export function addBuilding(site: Site, kind: BuildingKind): Building {
  const def = BUILDING_DEFAULTS[kind];
  const taken = site.buildings.map((b) => ({ x: b.pos.x, y: b.pos.y, w: b.w, d: b.d }));
  let spot = findFreeSpot(taken, site.w, site.d, def.w, def.d, 2, 3);
  if (!spot) {
    // Grow the site to make room.
    spot = { x: site.w + 1, y: 2 };
    site.w += def.w + 4;
    site.d = Math.max(site.d, def.d + 6);
  }
  const b: Building = { id: newId('b'), name: def.name, kind, pos: spot, w: def.w, d: def.d, floors: def.floors, floor: def.floor, rooms: [], units: [] };
  site.buildings.push(b);
  return b;
}

function unitRects(b: Building, except?: string): Rect[] {
  return b.units
    .filter((u) => u.id !== except)
    .map((u) => {
      const [w, d] = unitFootprint(u);
      return { x: u.pos.x, y: u.pos.y, w, d };
    });
}

function placeUnit(b: Building, u: Unit, gap = 0) {
  const [w, d] = unitFootprint(u);
  const spot = findFreeSpot(unitRects(b), b.w, b.d, w, d, 1, gap) ?? findFreeSpot(unitRects(b), b.w, b.d, w, d, 0, 0) ?? { x: 0, y: 0 };
  u.pos = spot;
}

export function addRack(b: Building, heightU = 42): RackUnit {
  const n = b.units.filter((u) => u.kind === 'rack').length + 1;
  const r: RackUnit = { id: newId('rack'), kind: 'rack', name: `Rack ${n}`, pos: { x: 0, y: 0 }, facing: 'left', heightU, devices: [] };
  placeUnit(b, r);
  b.units.push(r);
  return r;
}

export function addMachine(b: Building, type: DeviceType): MachineUnit {
  const m: MachineUnit = { id: newId('m'), kind: 'machine', name: DEVICE_TYPES[type].label, type, pos: { x: 0, y: 0 }, facing: 'left', monitorId: null, services: [], guests: [], inventory: {} };
  placeUnit(b, m, 1);
  b.units.push(m);
  return m;
}

/** Highest free slot range that fits `size` units, or null. */
export function freeSlot(rack: RackUnit, size: number, except?: string): number | null {
  const used = new Array(rack.heightU + 2).fill(false);
  for (const d of rack.devices) if (d.id !== except) for (let u = d.u; u < d.u + d.size; u++) used[u] = true;
  for (let top = rack.heightU; top - size + 1 >= 1; top--) {
    let ok = true;
    for (let u = top - size + 1; u <= top; u++) if (used[u]) ok = false;
    if (ok) return top - size + 1;
  }
  return null;
}

export function slotConflict(rack: RackUnit, u: number, size: number, except?: string): string | null {
  if (u < 1 || u + size - 1 > rack.heightU) return `Must fit within U1–U${rack.heightU}`;
  for (const d of rack.devices) {
    if (d.id === except) continue;
    if (u < d.u + d.size && u + size > d.u) return `Overlaps ${d.name}`;
  }
  return null;
}

export function addDevice(rack: RackUnit, type: DeviceType, size?: number): RackDevice | null {
  const s = size ?? DEVICE_TYPES[type].defaultU;
  const u = freeSlot(rack, s);
  if (u == null) return null;
  const d: RackDevice = { id: newId('m'), name: DEVICE_TYPES[type].label, type, u, size: s, monitorId: null, services: [], guests: [], inventory: {} };
  rack.devices.push(d);
  return d;
}

export function addRoom(b: Building): Room {
  const r: Room = { id: newId('room'), name: `Room ${b.rooms.length + 1}`, x: 0, y: 0, w: Math.min(8, b.w), d: Math.min(6, b.d), floor: b.floor };
  b.rooms.push(r);
  return r;
}

export function newService(name = 'Service', monitorId: number | null = null): Service {
  return { id: newId('svc'), name, monitorId };
}

export function newGuest(name = 'vm', kind: Guest['kind'] = 'vm'): Guest {
  return { id: newId('guest'), name, kind, monitorId: null, services: [], inventory: {} };
}

export function newCluster(w: World): Cluster {
  const palette = ['#8B7CF6', '#38BDF8', '#F472B6', '#34D399', '#FBBF24', '#FB7185', '#A3E635'];
  const c: Cluster = { id: newId('cluster'), name: `cluster-${w.clusters.length + 1}`, kind: 'proxmox', color: palette[w.clusters.length % palette.length], members: [], quorum: null, monitorId: null, guests: [], services: [] };
  w.clusters.push(c);
  return c;
}

/** Remove anything by id. Also cleans up cluster memberships. */
export function removeEntity(w: World, id: string): void {
  const e = indexWorld(w).get(id);
  if (!e) return;
  const dropMembers = (ids: string[]) => {
    for (const c of w.clusters) c.members = c.members.filter((m) => !ids.includes(m));
  };
  switch (e.kind) {
    case 'site':
      dropMembers(e.site.buildings.flatMap((b) => b.units.flatMap((u) => (u.kind === 'rack' ? u.devices.map((d) => d.id) : [u.id]))));
      w.sites = w.sites.filter((s) => s.id !== id);
      break;
    case 'building':
      dropMembers(e.building.units.flatMap((u) => (u.kind === 'rack' ? u.devices.map((d) => d.id) : [u.id])));
      e.site.buildings = e.site.buildings.filter((b) => b.id !== id);
      break;
    case 'room':
      e.building.rooms = e.building.rooms.filter((r) => r.id !== id);
      break;
    case 'rack':
      dropMembers(e.rack.devices.map((d) => d.id));
      e.building.units = e.building.units.filter((u) => u.id !== id);
      break;
    case 'machine':
      dropMembers([id]);
      if (e.rack) e.rack.devices = e.rack.devices.filter((d) => d.id !== id);
      else e.building.units = e.building.units.filter((u) => u.id !== id);
      break;
    case 'guest':
      e.owner.guests = e.owner.guests.filter((g) => g.id !== id);
      break;
    case 'service':
      if (e.guest) e.guest.services = e.guest.services.filter((s) => s.id !== id);
      else e.owner.services = e.owner.services.filter((s) => s.id !== id);
      break;
    case 'cluster':
      w.clusters = w.clusters.filter((c) => c.id !== id);
      break;
  }
}

/** Look up a mutable entity inside a draft world. */
export function find(w: World, id: string) {
  return indexWorld(w).get(id);
}

/** Turn a rack or standalone device to face the other way (keeps it inside the building). */
export function rotateUnit(id: string) {
  commit((w) => {
    const e = find(w, id);
    const unit = e?.kind === 'rack' ? e.rack : e?.kind === 'machine' && !e.rack ? (e.unit as MachineUnit) : null;
    if (!e || !unit || (e.kind !== 'rack' && e.kind !== 'machine')) return;
    unit.facing = unit.facing === 'left' ? 'right' : 'left';
    const [fw, fd] = unitFootprint(unit);
    unit.pos.x = Math.max(0, Math.min(e.building.w - fw, unit.pos.x));
    unit.pos.y = Math.max(0, Math.min(e.building.d - fd, unit.pos.y));
  });
}

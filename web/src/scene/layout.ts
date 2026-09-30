import type { Building, Cluster, DeviceType, Machine, Site, Unit, World } from '../../../shared/model';
import { RACK_BASE, U_HEIGHT, rackHeight, unitFootprint } from '../../../shared/model';
import type { Box } from '../iso/iso';
import { resolvePath } from '../state';
import type { Focus } from '../state/store';

export const FLOOR_H = 4.2;
export const WALL_H = 4.4;
export const ISLAND_T = 2.4;
export const HOLO_GAP = 1.4;
export const HOLO_CELL = 2.2;
export const HOLO_LAYER = 2.8;

/** Height of standalone machines in tiles. */
export const MACHINE_HEIGHT: Partial<Record<DeviceType, number>> = {
  'tower-server': 0.85,
  server: 0.85,
  desktop: 2.45,
  laptop: 1.8,
  'mini-pc': 1.1,
  sbc: 1.0,
  modem: 1.55,
  router: 1.45,
  switch: 1.0,
  firewall: 1.05,
  'smart-hub': 1.1,
  phone: 1.4,
  'access-point': 2.55,
  camera: 2.45,
  printer: 0.8,
  tv: 2.25,
  nas: 0.95,
  ups: 1.1,
  iot: 1.4,
};

export function unitHeight(u: Unit): number {
  if (u.kind === 'rack') return rackHeight(u.heightU);
  return MACHINE_HEIGHT[u.type] ?? 1.2;
}

export function roofHeight(b: Building): number {
  if (b.kind === 'residential') return Math.min(b.w, b.d) * 0.32 + 0.6;
  if (b.kind === 'industrial') return 1.8;
  if (b.kind === 'datacenter') return 1.2;
  return 1.2;
}

export function buildingOrigin(site: Site, b: Building) {
  return { x: site.pos.x + b.pos.x, y: site.pos.y + b.pos.y };
}

export function unitOrigin(site: Site, b: Building, u: Unit) {
  const o = buildingOrigin(site, b);
  return { x: o.x + u.pos.x, y: o.y + u.pos.y };
}

export function siteBox(site: Site): Box {
  return { x: site.pos.x, y: site.pos.y, z: -ISLAND_T, w: site.w, d: site.d, h: ISLAND_T };
}

export function buildingBoxClosed(site: Site, b: Building): Box {
  const o = buildingOrigin(site, b);
  return { x: o.x, y: o.y, z: 0, w: b.w, d: b.d, h: b.floors * FLOOR_H + roofHeight(b) };
}

export function buildingBoxOpen(site: Site, b: Building): Box {
  const o = buildingOrigin(site, b);
  return { x: o.x, y: o.y, z: 0, w: b.w, d: b.d, h: WALL_H };
}

export function unitBox(site: Site, b: Building, u: Unit): Box {
  const o = unitOrigin(site, b, u);
  const [w, d] = unitFootprint(u);
  return { x: o.x, y: o.y, z: 0, w, d, h: unitHeight(u) };
}

// ---------------------------------------------------------------------------
// Hologram (services / guests floating above a focused machine)
// ---------------------------------------------------------------------------

export interface HoloPlate {
  key: string;
  kind: 'machine' | 'cluster';
  cluster?: Cluster;
  box: Box; // plate footprint at its z
  cols: number;
  items: { id: string; kind: 'guest' | 'service'; a: number; b: number }[];
}

export function holoPlates(machine: Machine, clusters: Cluster[], anchor: Box): HoloPlate[] {
  const plates: HoloPlate[] = [];
  const cx = anchor.x + anchor.w / 2;
  const cy = anchor.y + anchor.d / 2;
  let z = anchor.z + anchor.h + HOLO_GAP;
  const make = (key: string, kind: HoloPlate['kind'], ids: { id: string; kind: 'guest' | 'service' }[], cluster?: Cluster) => {
    const n = Math.max(ids.length, 1);
    const cols = Math.max(1, Math.ceil(Math.sqrt(n)));
    const rows = Math.max(1, Math.ceil(n / cols));
    const w = cols * HOLO_CELL + 0.6;
    const d = rows * HOLO_CELL + 0.6;
    const box: Box = { x: cx - w / 2, y: cy - d / 2, z, w, d, h: 0.12 };
    plates.push({
      key,
      kind,
      cluster,
      box,
      cols,
      items: ids.map((it, i) => ({ ...it, a: 0.3 + (i % cols) * HOLO_CELL + HOLO_CELL / 2, b: 0.3 + Math.floor(i / cols) * HOLO_CELL + HOLO_CELL / 2 })),
    });
    z += HOLO_LAYER + 1.2;
  };
  make('machine', 'machine', [...machine.guests.map((g) => ({ id: g.id, kind: 'guest' as const })), ...machine.services.map((s) => ({ id: s.id, kind: 'service' as const }))]);
  for (const c of clusters) {
    const ids = [...c.guests.map((g) => ({ id: g.id, kind: 'guest' as const })), ...c.services.map((s) => ({ id: s.id, kind: 'service' as const }))];
    if (ids.length) make(`cluster-${c.id}`, 'cluster', ids, c);
  }
  return plates;
}

/** Box of the machine that the hologram anchors to (rack or standalone unit). */
export function machineAnchor(world: World, path: string[]): Box | null {
  const r = resolvePath(world, path);
  if (!r.site || !r.building || !r.unit) return null;
  return unitBox(r.site, r.building, r.unit);
}

/** World position of a rack device's front centre (for cluster links). */
export function deviceFrontPoint(world: World, path: string[]): [number, number, number] | null {
  const r = resolvePath(world, path);
  if (!r.site || !r.building || !r.unit) return null;
  const b = unitBox(r.site, r.building, r.unit);
  if (r.device && r.unit.kind === 'rack') {
    const z = RACK_BASE + (r.device.u - 1 + r.device.size / 2) * U_HEIGHT;
    if (r.unit.facing === 'left') return [b.x + b.w / 2, b.y + b.d, z];
    return [b.x + b.w, b.y + b.d / 2, z];
  }
  return [b.x + b.w / 2, b.y + b.d / 2, b.h + 0.4];
}

// ---------------------------------------------------------------------------
// Camera targets
// ---------------------------------------------------------------------------

export function focusBoxes(world: World, focus: Focus, clusterMembers: string[][] = []): Box[] {
  if (focus.cluster && clusterMembers.length) {
    const boxes: Box[] = [];
    for (const path of clusterMembers) {
      const r = resolvePath(world, path);
      if (r.site && r.building && r.unit) {
        const ub = unitBox(r.site, r.building, r.unit);
        boxes.push({ ...ub, x: ub.x - 2, y: ub.y - 2, w: ub.w + 4, d: ub.d + 4 });
      }
    }
    if (boxes.length) return boxes;
  }
  const r = resolvePath(world, focus.path);
  if (!r.site) {
    const boxes = world.sites.flatMap((s) => [siteBox(s), ...s.buildings.map((b) => buildingBoxClosed(s, b))]);
    return boxes.length ? boxes : [{ x: -10, y: -10, z: 0, w: 20, d: 20, h: 1 }];
  }
  if (!r.building) return [siteBox(r.site), ...r.site.buildings.map((b) => buildingBoxClosed(r.site!, b))];
  if (!r.unit) {
    const bb = buildingBoxOpen(r.site, r.building);
    return [{ ...bb, z: -0.5 }];
  }
  const ub = unitBox(r.site, r.building, r.unit);
  const pad = r.unit.kind === 'rack' ? 1.2 : 1.2;
  const base: Box = { x: ub.x - pad, y: ub.y - pad, z: 0, w: ub.w + pad * 2, d: ub.d + pad * 2, h: ub.h + 0.4 };
  if (r.unit.kind === 'rack' && !r.device) {
    // Leave room for the device labels on the left.
    return [base, { ...base, x: base.x - 0, y: base.y + 3.5, w: 0.1, d: 0.1, h: ub.h * 0.6 }];
  }
  if (r.machine) {
    const clusters = world.clusters.filter((c) => c.members.includes(r.machine!.id));
    const plates = holoPlates(r.machine, clusters, ub);
    return [base, ...plates.map((p) => ({ ...p.box, h: HOLO_LAYER }))];
  }
  return [base];
}

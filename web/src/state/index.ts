import type { Building, Cluster, Guest, Machine, RackDevice, RackUnit, Room, Service, Site, Unit, World } from '../../../shared/model';

/** Everything addressable in the world, indexed by id. */
export type Indexed =
  | { kind: 'site'; site: Site; path: string[] }
  | { kind: 'building'; site: Site; building: Building; path: string[] }
  | { kind: 'room'; site: Site; building: Building; room: Room; path: string[] }
  | { kind: 'rack'; site: Site; building: Building; rack: RackUnit; path: string[] }
  | { kind: 'machine'; site: Site; building: Building; unit: Unit; machine: Machine; rack?: RackUnit; path: string[] }
  | { kind: 'guest'; guest: Guest; owner: Machine | Cluster; ownerKind: 'machine' | 'cluster'; path: string[] }
  | { kind: 'service'; service: Service; owner: Machine | Cluster; ownerKind: 'machine' | 'cluster'; guest?: Guest; path: string[] }
  | { kind: 'cluster'; cluster: Cluster; path: string[] };

const cache = new WeakMap<World, Map<string, Indexed>>();

/** Forget a cached index (call after mutating a world object in place). */
export function invalidateIndex(world: World) {
  cache.delete(world);
}

export function indexWorld(world: World): Map<string, Indexed> {
  const hit = cache.get(world);
  if (hit) return hit;
  const m = new Map<string, Indexed>();
  const addMachineChildren = (mach: Machine, path: string[]) => {
    for (const g of mach.guests) {
      m.set(g.id, { kind: 'guest', guest: g, owner: mach, ownerKind: 'machine', path });
      for (const s of g.services) m.set(s.id, { kind: 'service', service: s, owner: mach, ownerKind: 'machine', guest: g, path });
    }
    for (const s of mach.services) m.set(s.id, { kind: 'service', service: s, owner: mach, ownerKind: 'machine', path });
  };
  for (const site of world.sites) {
    m.set(site.id, { kind: 'site', site, path: [site.id] });
    for (const building of site.buildings) {
      m.set(building.id, { kind: 'building', site, building, path: [site.id, building.id] });
      for (const room of building.rooms) m.set(room.id, { kind: 'room', site, building, room, path: [site.id, building.id] });
      for (const unit of building.units) {
        if (unit.kind === 'rack') {
          m.set(unit.id, { kind: 'rack', site, building, rack: unit, path: [site.id, building.id, unit.id] });
          for (const d of unit.devices) {
            const path = [site.id, building.id, unit.id, d.id];
            m.set(d.id, { kind: 'machine', site, building, unit, machine: d, rack: unit, path });
            addMachineChildren(d, path);
          }
        } else {
          const path = [site.id, building.id, unit.id];
          m.set(unit.id, { kind: 'machine', site, building, unit, machine: unit, path });
          addMachineChildren(unit, path);
        }
      }
    }
  }
  for (const cluster of world.clusters) {
    m.set(cluster.id, { kind: 'cluster', cluster, path: [] });
    for (const g of cluster.guests) {
      m.set(g.id, { kind: 'guest', guest: g, owner: cluster, ownerKind: 'cluster', path: [] });
      for (const s of g.services) m.set(s.id, { kind: 'service', service: s, owner: cluster, ownerKind: 'cluster', guest: g, path: [] });
    }
    for (const s of cluster.services) m.set(s.id, { kind: 'service', service: s, owner: cluster, ownerKind: 'cluster', path: [] });
  }
  cache.set(world, m);
  return m;
}

export interface Resolved {
  site?: Site;
  building?: Building;
  unit?: Unit;
  rack?: RackUnit;
  machine?: Machine;
  device?: RackDevice;
}

/** Resolve a navigation path [site, building, unit, device]. Stops at the first missing id. */
export function resolvePath(world: World | null, path: string[]): Resolved {
  const r: Resolved = {};
  if (!world) return r;
  r.site = world.sites.find((s) => s.id === path[0]);
  if (!r.site) return {};
  r.building = r.site.buildings.find((b) => b.id === path[1]);
  if (!r.building) return r;
  r.unit = r.building.units.find((u) => u.id === path[2]);
  if (!r.unit) return r;
  if (r.unit.kind === 'rack') {
    r.rack = r.unit;
    r.device = r.unit.devices.find((d) => d.id === path[3]);
    if (r.device) r.machine = r.device;
  } else r.machine = r.unit;
  return r;
}

/** Clusters a machine belongs to. */
export function clustersOf(world: World, machineId: string): Cluster[] {
  return world.clusters.filter((c) => c.members.includes(machineId));
}

import type { Building, Cluster, Guest, Machine, Site, Unit, World } from '../../../shared/model';
import { DEVICE_TYPES } from '../../../shared/model';
import type { MonitorDTO, RollupStatus, Status } from '../../../shared/status';
import { worst } from '../../../shared/status';

export type Monitors = Record<number, MonitorDTO>;

export function monStatus(monitors: Monitors, id: number | null | undefined): Status {
  if (id == null) return 'unknown';
  return monitors[id]?.status ?? 'unknown';
}

export interface Counts {
  up: number;
  down: number;
  warn: number; // pending / maintenance
  other: number;
}

export interface Health {
  /** The item's own state (host monitor, or derived when it has none). */
  self: RollupStatus;
  /** Including everything inside it. */
  rollup: RollupStatus;
  machines: Counts;
  services: Counts;
}

const zero = (): Counts => ({ up: 0, down: 0, warn: 0, other: 0 });

function count(c: Counts, s: RollupStatus) {
  if (s === 'up') c.up++;
  else if (s === 'down') c.down++;
  else if (s === 'pending' || s === 'maintenance' || s === 'degraded') c.warn++;
  else c.other++;
}

/** Combine child states into a parent state, where a failing child only degrades the parent. */
function childrenRollup(self: RollupStatus, children: RollupStatus[]): RollupStatus {
  let r: RollupStatus = self;
  for (const c of children) {
    if (c === 'down' || c === 'degraded') r = worst(r, self === 'down' ? 'down' : 'degraded');
    else if (c === 'pending') r = worst(r, self === 'up' || self === 'unknown' ? 'degraded' : r);
    else if (c === 'maintenance' || c === 'up') r = self === 'unknown' ? worst(r, c) : r;
  }
  return r;
}

export function guestHealth(g: Guest, m: Monitors): { self: RollupStatus; rollup: RollupStatus } {
  const svc = g.services.map((s) => monStatus(m, s.monitorId));
  let self: RollupStatus = monStatus(m, g.monitorId);
  if (g.monitorId == null && svc.length) self = svc.every((s) => s === 'down') ? 'down' : 'unknown';
  return { self, rollup: childrenRollup(self, svc) };
}

export function machineHealth(mach: Machine, m: Monitors): Health {
  const services = zero();
  const childStates: RollupStatus[] = [];
  for (const s of mach.services) {
    const st = monStatus(m, s.monitorId);
    if (s.monitorId != null) count(services, st);
    childStates.push(st);
  }
  for (const g of mach.guests) {
    const gh = guestHealth(g, m);
    if (g.monitorId != null) count(services, gh.self);
    for (const s of g.services) if (s.monitorId != null) count(services, monStatus(m, s.monitorId));
    childStates.push(gh.rollup);
  }
  let self: RollupStatus = monStatus(m, mach.monitorId);
  if (mach.monitorId == null && childStates.length) {
    const known = childStates.filter((s) => s !== 'unknown' && s !== 'paused');
    self = known.length && known.every((s) => s === 'down') ? 'down' : known.some((s) => s === 'up' || s === 'degraded') ? 'up' : 'unknown';
  }
  const machines = zero();
  const monitored = DEVICE_TYPES[mach.type]?.monitored !== false || mach.monitorId != null;
  if (monitored && (mach.monitorId != null || childStates.length)) count(machines, self);
  return { self, rollup: childrenRollup(self, childStates), machines, services };
}

function merge(list: Health[]): Health {
  const machines = zero();
  const services = zero();
  let rollup: RollupStatus = 'unknown';
  for (const h of list) {
    machines.up += h.machines.up;
    machines.down += h.machines.down;
    machines.warn += h.machines.warn;
    machines.other += h.machines.other;
    services.up += h.services.up;
    services.down += h.services.down;
    services.warn += h.services.warn;
    services.other += h.services.other;
    // Containers show the worst state found inside them.
    rollup = worst(rollup, h.rollup);
  }
  return { self: rollup, rollup, machines, services };
}

export function unitHealth(u: Unit, m: Monitors): Health {
  if (u.kind === 'rack') return merge(u.devices.map((d) => machineHealth(d, m)));
  return machineHealth(u, m);
}

export function buildingHealth(b: Building, m: Monitors): Health {
  return merge(b.units.map((u) => unitHealth(u, m)));
}

export function siteHealth(s: Site, m: Monitors): Health {
  return merge(s.buildings.map((b) => buildingHealth(b, m)));
}

export function worldHealth(w: World, m: Monitors): Health {
  const h = merge(w.sites.map((s) => siteHealth(s, m)));
  return h;
}

export interface ClusterHealth {
  status: RollupStatus;
  membersUp: number;
  members: number;
  quorum: number;
  services: Counts;
}

export function clusterHealth(c: Cluster, world: World, m: Monitors, machineLookup: (id: string) => Machine | undefined): ClusterHealth {
  const members = c.members.map(machineLookup).filter((x): x is Machine => !!x);
  const states = members.map((mm) => monStatus(m, mm.monitorId));
  const membersUp = states.filter((s) => s === 'up').length;
  const quorum = c.quorum ?? Math.floor(members.length / 2) + 1;
  const services = zero();
  const svcStates: RollupStatus[] = [];
  for (const g of c.guests) {
    const gh = guestHealth(g, m);
    if (g.monitorId != null) count(services, gh.self);
    for (const s of g.services) if (s.monitorId != null) count(services, monStatus(m, s.monitorId));
    svcStates.push(gh.rollup);
  }
  for (const s of c.services) {
    const st = monStatus(m, s.monitorId);
    if (s.monitorId != null) count(services, st);
    svcStates.push(st);
  }
  let status: RollupStatus = members.length === 0 ? 'unknown' : membersUp >= quorum ? 'up' : 'down';
  const own = monStatus(m, c.monitorId);
  if (own === 'down') status = 'down';
  if (status === 'up' && (membersUp < members.length || svcStates.some((s) => s === 'down' || s === 'degraded' || s === 'pending'))) status = 'degraded';
  void world;
  return { status, membersUp, members: members.length, quorum, services };
}

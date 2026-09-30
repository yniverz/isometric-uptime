import type { ReactNode } from 'react';
import { Boxes, Building2, ChevronLeft, ChevronRight, Cpu, Factory, Home, Layers, MapPin, Network, Server } from 'lucide-react';
import type { Building, Cluster, Guest, Machine, RackUnit, Service, Site, World } from '../../../shared/model';
import { DEVICE_TYPES, monitorUsage, safeUrl } from '../../../shared/model';
import type { RollupStatus } from '../../../shared/status';
import { clustersOf, indexWorld, resolvePath } from '../state';
import { buildingHealth, clusterHealth, guestHealth, machineHealth, monStatus, siteHealth, unitHealth, worldHealth, type Monitors } from '../state/health';
import { focusCluster, goToEntity, levelOf, monitorOwners, navigate, selectSub, useStore } from '../state/store';
import { CountChips, Dot, EventList, KV, MonitorCard, Section, StatusPill } from './widgets';

export function kindIcon(kind: string, size = 16): ReactNode {
  switch (kind) {
    case 'site':
      return <MapPin size={size} />;
    case 'residential':
      return <Home size={size} />;
    case 'commercial':
      return <Building2 size={size} />;
    case 'industrial':
      return <Factory size={size} />;
    case 'rack':
      return <Server size={size} />;
    case 'cluster':
      return <Network size={size} />;
    case 'guest':
      return <Boxes size={size} />;
    case 'service':
      return <Layers size={size} />;
    default:
      return <Cpu size={size} />;
  }
}

function Row({ status, icon, title, sub, right, onClick, active }: { status?: RollupStatus; icon?: ReactNode; title: ReactNode; sub?: ReactNode; right?: ReactNode; onClick?: () => void; active?: boolean }) {
  return (
    <button className={`row ${active ? 'active' : ''}`} onClick={onClick} disabled={!onClick}>
      {status && <Dot status={status} />}
      {icon && <span className="row-icon">{icon}</span>}
      <span className="row-main">
        <span className="row-title">{title}</span>
        {sub && <span className="row-sub">{sub}</span>}
      </span>
      {right}
      {onClick && <ChevronRight size={14} className="row-chev" />}
    </button>
  );
}

function Header({ icon, kicker, title, status, children }: { icon: ReactNode; kicker: ReactNode; title: ReactNode; status?: RollupStatus; children?: ReactNode }) {
  return (
    <div className="phead">
      <div className="phead-icon">{icon}</div>
      <div className="phead-main">
        <div className="kicker">{kicker}</div>
        <h2>{title}</h2>
        {children}
      </div>
      {status && <StatusPill status={status} />}
    </div>
  );
}

// ---------------------------------------------------------------------------

function Problems({ world, monitors, scope }: { world: World; monitors: Monitors; scope?: string[] }) {
  const owners = monitorOwners(world);
  const list: { mid: number; name: string; path: string[]; sub: string | null; status: RollupStatus; msg?: string | null }[] = [];
  for (const [mid, o] of owners) {
    const m = monitors[mid];
    if (!m || m.status === 'up' || m.status === 'unknown' || m.status === 'paused') continue;
    if (scope && !scope.every((id, i) => o.path[i] === id)) continue;
    list.push({ mid, name: o.name, path: o.path, sub: o.sub, status: m.status, msg: m.msg });
  }
  list.sort((a, b) => (a.status === 'down' ? -1 : 1) - (b.status === 'down' ? -1 : 1));
  if (!list.length)
    return (
      <div className="allgood">
        <Dot status="up" pulse={false} /> All systems operational
      </div>
    );
  return (
    <div className="rows">
      {list.slice(0, 12).map((p) => (
        <Row key={p.mid} status={p.status} title={p.name} sub={p.msg ?? undefined} onClick={() => (p.path.length ? navigate(p.path, { sub: p.sub }) : goToEntity(p.sub ?? ''))} />
      ))}
      {list.length > 12 && <div className="muted small pad">+{list.length - 12} more</div>}
    </div>
  );
}

export function WorldPanel({ world }: { world: World }) {
  const monitors = useStore((s) => s.monitors);
  const source = useStore((s) => s.source);
  const edit = useStore((s) => s.edit);
  const h = worldHealth(world, monitors);
  const usage = monitorUsage(world);
  const unassigned = Object.values(monitors).filter((m) => !usage.has(m.id) && m.type !== 'group');
  return (
    <>
      <Header icon={<GlobeIcon />} kicker="Overview" title="All sites" status={h.rollup}>
        <div className="head-counts">
          <CountChips c={h.machines} label="Devices" />
          <CountChips c={h.services} label="Services" />
        </div>
      </Header>
      <Section title="Needs attention">
        <Problems world={world} monitors={monitors} />
      </Section>
      <Section title={`Sites (${world.sites.length})`}>
        <div className="rows">
          {world.sites.map((s) => {
            const sh = siteHealth(s, monitors);
            return <Row key={s.id} status={sh.rollup} icon={kindIcon('site')} title={s.name} sub={`${s.buildings.length} building${s.buildings.length === 1 ? '' : 's'} · ${sh.machines.up + sh.machines.down + sh.machines.warn} devices`} onClick={() => navigate([s.id])} />;
          })}
          {!world.sites.length && <div className="empty-note">No sites yet. {edit ? 'Use “Add site” in the editor.' : 'Switch to edit mode to build your world.'}</div>}
        </div>
      </Section>
      {world.clusters.length > 0 && (
        <Section title="Clusters">
          <div className="rows">
            {world.clusters.map((c) => (
              <ClusterRow key={c.id} c={c} world={world} monitors={monitors} />
            ))}
          </div>
        </Section>
      )}
      <Section title="Data source">
        <div className="source-line">
          <Dot status={source?.state === 'connected' ? 'up' : source?.state === 'connecting' ? 'pending' : 'down'} />
          <span>{source?.mode === 'demo' ? 'Demo data (no Uptime Kuma configured)' : `Uptime Kuma · ${source?.state ?? 'unknown'}`}</span>
        </div>
        {source?.message && source.mode === 'kuma' && <div className="muted small">{source.message}</div>}
        <div className="muted small">
          {Object.keys(monitors).length} monitors · {unassigned.length} not placed in the world
        </div>
      </Section>
      <Section title="Recent events">
        <EventList ids={[...usage.keys()]} />
      </Section>
    </>
  );
}

function GlobeIcon() {
  return <Layers size={18} />;
}

function ClusterRow({ c, world, monitors }: { c: Cluster; world: World; monitors: Monitors }) {
  const idx = indexWorld(world);
  const ch = clusterHealth(c, world, monitors, (id) => {
    const e = idx.get(id);
    return e?.kind === 'machine' ? e.machine : undefined;
  });
  return (
    <Row
      status={ch.status}
      icon={<span className="swatch" style={{ background: c.color }} />}
      title={c.name}
      sub={`${ch.membersUp}/${ch.members} nodes up · quorum ${ch.quorum} · ${c.guests.length + c.services.length} HA workloads`}
      onClick={() => focusCluster(c.id)}
    />
  );
}

export function SitePanel({ world, site }: { world: World; site: Site }) {
  const monitors = useStore((s) => s.monitors);
  const h = siteHealth(site, monitors);
  return (
    <>
      <Header icon={kindIcon('site', 18)} kicker="Site" title={site.name} status={h.rollup}>
        {site.description && <div className="muted">{site.description}</div>}
        <div className="head-counts">
          <CountChips c={h.machines} label="Devices" />
          <CountChips c={h.services} label="Services" />
        </div>
      </Header>
      <Section title="Needs attention">
        <Problems world={world} monitors={monitors} scope={[site.id]} />
      </Section>
      <Section title={`Buildings (${site.buildings.length})`}>
        <div className="rows">
          {site.buildings.map((b) => {
            const bh = buildingHealth(b, monitors);
            return <Row key={b.id} status={bh.rollup} icon={kindIcon(b.kind)} title={b.name} sub={`${b.kind} · ${bh.machines.up + bh.machines.down + bh.machines.warn} devices${bh.machines.down ? ` · ${bh.machines.down} down` : ''}`} onClick={() => navigate([site.id, b.id])} />;
          })}
          {!site.buildings.length && <div className="empty-note">No buildings on this site yet.</div>}
        </div>
      </Section>
    </>
  );
}

export function BuildingPanel({ world, site, b }: { world: World; site: Site; b: Building }) {
  const monitors = useStore((s) => s.monitors);
  const h = buildingHealth(b, monitors);
  const roomOf = (x: number, y: number) => b.rooms.find((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.d);
  const groups = new Map<string, typeof b.units>();
  for (const u of b.units) {
    const r = roomOf(u.pos.x + 0.5, u.pos.y + 0.5);
    const k = r?.name ?? 'Other';
    groups.set(k, [...(groups.get(k) ?? []), u]);
  }
  return (
    <>
      <Header icon={kindIcon(b.kind, 18)} kicker={`${site.name} · ${b.kind}`} title={b.name} status={h.rollup}>
        <div className="head-counts">
          <CountChips c={h.machines} label="Devices" />
          <CountChips c={h.services} label="Services" />
        </div>
      </Header>
      <Section title="Needs attention">
        <Problems world={world} monitors={monitors} scope={[site.id, b.id]} />
      </Section>
      {[...groups.entries()].map(([room, units]) => (
        <Section key={room} title={room}>
          <div className="rows">
            {units.map((u) => {
              const uh = unitHealth(u, monitors);
              const sub = u.kind === 'rack' ? `${u.heightU}U rack · ${u.devices.filter((d) => d.type !== 'blank').length} devices` : DEVICE_TYPES[u.type]?.label;
              return <Row key={u.id} status={uh.rollup} icon={kindIcon(u.kind === 'rack' ? 'rack' : 'machine')} title={u.name} sub={sub} onClick={() => navigate([site.id, b.id, u.id])} />;
            })}
          </div>
        </Section>
      ))}
      {!b.units.length && <div className="empty-note pad">This building is empty.</div>}
    </>
  );
}

export function RackPanel({ site, b, rack }: { site: Site; b: Building; rack: RackUnit }) {
  const monitors = useStore((s) => s.monitors);
  const h = unitHealth(rack, monitors);
  const slots: ReactNode[] = [];
  const sorted = [...rack.devices].sort((a, c) => c.u - a.u);
  let cursor = rack.heightU;
  const free = (from: number, to: number) => {
    if (from < to) return;
    slots.push(
      <div key={`f${from}`} className="elev-free">
        <span className="u">{from === to ? `U${from}` : `U${to}–${from}`}</span>
        <span className="muted small">{from - to + 1}U free</span>
      </div>,
    );
  };
  for (const d of sorted) {
    const top = d.u + d.size - 1;
    free(cursor, top + 1);
    const mh = machineHealth(d, monitors);
    slots.push(
      <button key={d.id} className={`elev-dev t-${d.type}`} style={{ minHeight: 28 + (d.size - 1) * 10 }} onClick={() => navigate([site.id, b.id, rack.id, d.id])}>
        <span className="u">{d.size > 1 ? `U${d.u}–${top}` : `U${d.u}`}</span>
        {DEVICE_TYPES[d.type].monitored || d.monitorId != null ? <Dot status={mh.rollup} /> : <span className="dot-spacer" />}
        <span className="row-main">
          <span className="row-title">{d.name}</span>
          <span className="row-sub">
            {DEVICE_TYPES[d.type].label}
            {d.services.length + d.guests.length ? ` · ${d.services.length + d.guests.length} workloads` : ''}
          </span>
        </span>
        <ChevronRight size={14} className="row-chev" />
      </button>,
    );
    cursor = d.u - 1;
  }
  free(cursor, 1);
  const used = rack.devices.reduce((a, d) => a + d.size, 0);
  return (
    <>
      <Header icon={kindIcon('rack', 18)} kicker={`${site.name} › ${b.name}`} title={rack.name} status={h.rollup}>
        <div className="head-counts">
          <CountChips c={h.machines} label="Devices" />
          <span className="muted small">
            {used}/{rack.heightU}U used
          </span>
        </div>
      </Header>
      <Section title="Elevation">
        <div className="elev">{slots}</div>
      </Section>
      <Section title="Events">
        <EventList ids={rack.devices.flatMap((d) => [d.monitorId, ...d.services.map((s) => s.monitorId), ...d.guests.map((g) => g.monitorId)]).filter((x): x is number => x != null)} />
      </Section>
    </>
  );
}

function allMonitorIds(m: Machine): number[] {
  return [m.monitorId, ...m.services.map((s) => s.monitorId), ...m.guests.flatMap((g) => [g.monitorId, ...g.services.map((s) => s.monitorId)])].filter((x): x is number => x != null);
}

function ServiceRow({ s, sub, active }: { s: Service; sub?: string; active: boolean }) {
  const m = useStore((st) => (s.monitorId != null ? st.monitors[s.monitorId] : undefined));
  const st = useStore((x) => monStatus(x.monitors, s.monitorId));
  return (
    <Row
      status={st}
      icon={kindIcon('service', 14)}
      title={s.name}
      sub={sub ?? (m ? `${m.type}${m.ping != null ? ` · ${m.ping} ms` : ''}` : 'no monitor')}
      onClick={() => selectSub(active ? null : s.id)}
      active={active}
    />
  );
}

function GuestRows({ g, sub }: { g: Guest; sub: string | null | undefined }) {
  const st = useStore((x) => guestHealth(g, x.monitors).rollup);
  return (
    <div className="guest-group">
      <Row status={st} icon={kindIcon('guest', 14)} title={g.name} sub={`${g.kind.toUpperCase()}${g.inventory?.ip ? ` · ${g.inventory.ip}` : ''}`} onClick={() => selectSub(sub === g.id ? null : g.id)} active={sub === g.id} />
      {g.services.length > 0 && (
        <div className="nested">
          {g.services.map((s) => (
            <ServiceRow key={s.id} s={s} active={sub === s.id} />
          ))}
        </div>
      )}
    </div>
  );
}

export function MachinePanel({ world, path, sub }: { world: World; path: string[]; sub: string | null | undefined }) {
  const monitors = useStore((s) => s.monitors);
  const r = resolvePath(world, path);
  const m = r.machine!;
  const h = machineHealth(m, monitors);
  const clusters = clustersOf(world, m.id);
  const idx = indexWorld(world);
  const subEnt = sub ? idx.get(sub) : undefined;
  const info = DEVICE_TYPES[m.type];
  const loc = [r.site?.name, r.building?.name, r.rack?.name].filter(Boolean).join(' › ');
  const names = new Map<number, string>();
  if (m.monitorId != null) names.set(m.monitorId, m.name);
  for (const s of m.services) if (s.monitorId != null) names.set(s.monitorId, s.name);
  for (const g of m.guests) {
    if (g.monitorId != null) names.set(g.monitorId, g.name);
    for (const s of g.services) if (s.monitorId != null) names.set(s.monitorId, `${s.name} (${g.name})`);
  }

  if (subEnt && (subEnt.kind === 'service' || subEnt.kind === 'guest')) {
    const title = subEnt.kind === 'service' ? subEnt.service.name : subEnt.guest.name;
    const mid = subEnt.kind === 'service' ? subEnt.service.monitorId : subEnt.guest.monitorId;
    const status: RollupStatus = subEnt.kind === 'service' ? monStatus(monitors, mid) : guestHealth(subEnt.guest, monitors).rollup;
    const onCluster = subEnt.ownerKind === 'cluster';
    return (
      <>
        <button className="backlink" onClick={() => selectSub(null)}>
          <ChevronLeft size={14} /> {m.name}
        </button>
        <Header icon={kindIcon(subEnt.kind, 18)} kicker={subEnt.kind === 'guest' ? `${subEnt.guest.kind.toUpperCase()} on ${onCluster ? `cluster ${subEnt.owner.name}` : m.name}` : `Service on ${subEnt.guest?.name ?? (onCluster ? `cluster ${subEnt.owner.name}` : m.name)}`} title={title} status={status} />
        {onCluster && <div className="note">Runs with high availability on any member of <b>{subEnt.owner.name}</b>. Its actual node is not tracked.</div>}
        <Section title="Monitor">
          <MonitorCard id={mid} />
        </Section>
        {subEnt.kind === 'guest' && subEnt.guest.services.length > 0 && (
          <Section title="Services">
            <div className="rows">
              {subEnt.guest.services.map((s) => (
                <ServiceRow key={s.id} s={s} active={false} />
              ))}
            </div>
          </Section>
        )}
        {subEnt.kind === 'service' && safeUrl(subEnt.service.url) && (
          <a className="btn block" href={safeUrl(subEnt.service.url)} target="_blank" rel="noreferrer noopener">
            Open {subEnt.service.name}
          </a>
        )}
        {subEnt.kind === 'guest' && <Inventory inv={subEnt.guest.inventory ?? {}} />}
        <Section title="Events">
          <EventList ids={[mid, ...(subEnt.kind === 'guest' ? subEnt.guest.services.map((s) => s.monitorId) : [])].filter((x): x is number => x != null)} />
        </Section>
      </>
    );
  }

  return (
    <>
      <Header icon={kindIcon(m.type, 18)} kicker={`${info?.label ?? m.type} · ${loc}`} title={m.name} status={h.rollup}>
        <div className="head-counts">{(h.services.up + h.services.down + h.services.warn + h.services.other > 0) && <CountChips c={h.services} label="Workloads" />}</div>
      </Header>
      <Section title="Host">
        <MonitorCard id={m.monitorId} />
      </Section>
      {(m.guests.length > 0 || m.services.length > 0) && (
        <Section title={`Workloads (${m.guests.length + m.services.length})`}>
          <div className="rows">
            {m.guests.map((g) => (
              <GuestRows key={g.id} g={g} sub={sub} />
            ))}
            {m.services.map((s) => (
              <ServiceRow key={s.id} s={s} active={sub === s.id} />
            ))}
          </div>
        </Section>
      )}
      {clusters.map((c) => (
        <Section key={c.id} title={<><span className="swatch" style={{ background: c.color }} /> Cluster {c.name}</>} right={<button className="link small" onClick={() => focusCluster(c.id)}>Show members</button>}>
          <div className="rows">
            {c.guests.map((g) => (
              <GuestRows key={g.id} g={g} sub={sub} />
            ))}
            {c.services.map((s) => (
              <ServiceRow key={s.id} s={s} active={sub === s.id} />
            ))}
            {!c.guests.length && !c.services.length && <div className="empty-note">No HA workloads defined.</div>}
          </div>
        </Section>
      ))}
      <Inventory inv={m.inventory} />
      <Section title="Events">
        <EventList ids={allMonitorIds(m)} names={names} />
      </Section>
    </>
  );
}

function Inventory({ inv }: { inv: Machine['inventory'] }) {
  const items: [string, ReactNode][] = [
    ['IP', inv.ip && <code>{inv.ip}</code>],
    ['OS', inv.os],
    ['CPU', inv.cpu],
    ['Memory', inv.ram],
    ['Storage', inv.disk],
    ['Serial', inv.serial && <code>{inv.serial}</code>],
    ['Purchased', inv.purchased],
    [
      'Web UI',
      safeUrl(inv.url) && (
        <a className="link" href={safeUrl(inv.url)} target="_blank" rel="noreferrer noopener">
          {inv.url}
        </a>
      ),
    ],
  ];
  if (!items.some(([, v]) => v) && !inv.notes) return null;
  return (
    <Section title="Inventory">
      <KV items={items} />
      {inv.notes && <p className="notes">{inv.notes}</p>}
    </Section>
  );
}

export function ClusterPanel({ world, cluster }: { world: World; cluster: Cluster }) {
  const monitors = useStore((s) => s.monitors);
  const idx = indexWorld(world);
  const ch = clusterHealth(cluster, world, monitors, (id) => {
    const e = idx.get(id);
    return e?.kind === 'machine' ? e.machine : undefined;
  });
  const members = cluster.members.map((id) => idx.get(id)).filter((e): e is Extract<ReturnType<typeof idx.get>, { kind: 'machine' }> => e?.kind === 'machine');
  return (
    <>
      <button className="backlink" onClick={() => focusCluster(null)}>
        <ChevronLeft size={14} /> Back
      </button>
      <Header icon={<span className="swatch lg" style={{ background: cluster.color }} />} kicker={`${cluster.kind} cluster`} title={cluster.name} status={ch.status}>
        <div className="quorum">
          <div className="quorum-bar">
            {members.map((e) => (
              <span key={e.machine.id} className={`q st-${monStatus(monitors, e.machine.monitorId)}`} />
            ))}
          </div>
          <span className="muted small">
            {ch.membersUp}/{ch.members} nodes up · quorum {ch.quorum}
          </span>
        </div>
      </Header>
      <Section title="Members">
        <div className="rows">
          {members.map((e) => (
            <Row key={e.machine.id} status={machineHealth(e.machine, monitors).rollup} icon={kindIcon('machine', 14)} title={e.machine.name} sub={[e.site.name, e.building.name, e.rack?.name].filter(Boolean).join(' › ')} onClick={() => navigate(e.path)} />
          ))}
          {!members.length && <div className="empty-note">No members yet.</div>}
        </div>
      </Section>
      {cluster.monitorId != null && (
        <Section title="Cluster endpoint">
          <MonitorCard id={cluster.monitorId} compact />
        </Section>
      )}
      <Section title={`HA workloads (${cluster.guests.length + cluster.services.length})`}>
        <div className="rows">
          {cluster.guests.map((g) => (
            <Row key={g.id} status={guestHealth(g, monitors).rollup} icon={kindIcon('guest', 14)} title={g.name} sub={`${g.kind.toUpperCase()} · ${g.services.map((s) => s.name).join(', ') || 'no services'}`} />
          ))}
          {cluster.services.map((s) => (
            <Row key={s.id} status={monStatus(monitors, s.monitorId)} icon={kindIcon('service', 14)} title={s.name} sub={monitors[s.monitorId ?? -1]?.type} />
          ))}
        </div>
      </Section>
      <Section title="Events">
        <EventList ids={[cluster.monitorId, ...cluster.members.map((id) => (idx.get(id) as { machine?: Machine })?.machine?.monitorId), ...cluster.guests.flatMap((g) => [g.monitorId, ...g.services.map((s) => s.monitorId)]), ...cluster.services.map((s) => s.monitorId)].filter((x): x is number => x != null)} />
      </Section>
    </>
  );
}

/** Picks the right panel for the current focus. */
export function ViewPanel() {
  const world = useStore((s) => s.world);
  const focus = useStore((s) => s.focus);
  if (!world) return null;
  if (focus.cluster) {
    const c = world.clusters.find((x) => x.id === focus.cluster);
    if (c) return <ClusterPanel world={world} cluster={c} />;
  }
  const r = resolvePath(world, focus.path);
  const lvl = levelOf(world, focus.path);
  if (lvl === 'machine' && r.machine) return <MachinePanel world={world} path={focus.path} sub={focus.sub} />;
  if (lvl === 'rack' && r.rack && r.site && r.building) return <RackPanel site={r.site} b={r.building} rack={r.rack} />;
  if (r.building && r.site) return <BuildingPanel world={world} site={r.site} b={r.building} />;
  if (r.site) return <SitePanel world={world} site={r.site} />;
  return <WorldPanel world={world} />;
}


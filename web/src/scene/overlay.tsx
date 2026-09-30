import type { Cluster, Guest, Service, World } from '../../../shared/model';
import { p, pts, type Box } from '../iso/iso';
import { shade } from '../iso/palette';
import { clustersOf, indexWorld, resolvePath } from '../state';
import { guestHealth } from '../state/health';
import { selectSub, useStore } from '../state/store';
import { useHover } from '../state/ephemeral';
import { HOLO_CELL, deviceFrontPoint, holoPlates, machineAnchor, type HoloPlate } from './layout';
import { Billboard, useLabelScale, useMonStatus, usePal } from './primitives';
import { claimHover, pointer } from './interact';

function top(b: Box) {
  const z = b.z;
  return pts([p(b.x, b.y, z), p(b.x + b.w, b.y, z), p(b.x + b.w, b.y + b.d, z), p(b.x, b.y + b.d, z)]);
}

/** Hologram floating above the focused machine: its guests and services, plus HA cluster workloads. */
export function Holo({ world, path, sub }: { world: World; path: string[]; sub: string | null | undefined }) {
  const r = resolvePath(world, path);
  const anchor = machineAnchor(world, path);
  if (!r.machine || !anchor) return null;
  const clusters = clustersOf(world, r.machine.id);
  const plates = holoPlates(r.machine, clusters, anchor);
  const cx = anchor.x + anchor.w / 2;
  const cy = anchor.y + anchor.d / 2;
  const topZ = plates[plates.length - 1].box.z;
  const [bx0, by0] = p(cx, cy, anchor.z + anchor.h);
  const [bx1, by1] = p(cx, cy, topZ);
  return (
    <g className="holo" key={r.machine.id}>
      <line className="holo-beam" x1={bx0} y1={by0} x2={bx1} y2={by1} />
      {plates.map((pl, i) => (
        <Plate key={pl.key} plate={pl} world={world} sub={sub ?? null} index={i} machineName={r.machine!.name} />
      ))}
    </g>
  );
}

function Plate({ plate, world, sub, index, machineName }: { plate: HoloPlate; world: World; sub: string | null; index: number; machineName: string }) {
  const pal = usePal();
  const idx = indexWorld(world);
  const b = plate.box;
  const color = plate.cluster?.color ?? pal.holo;
  const items = [...plate.items].sort((a, c) => a.a + a.b - (c.a + c.b));
  const cols = plate.cols;
  const rows = Math.ceil(Math.max(1, plate.items.length) / cols);
  const title = plate.kind === 'cluster' ? `${plate.cluster!.name} · ${clusterKindLabel(plate.cluster!)}` : machineName;
  return (
    <g className="plate" style={{ animationDelay: `${index * 0.4}s` }}>
      <polygon className="plate-fill" points={top(b)} style={{ fill: plate.kind === 'cluster' ? hexA(color, 0.12) : pal.holoFill, stroke: color }} />
      {Array.from({ length: cols - 1 }, (_, i) => {
        const x = b.x + 0.3 + (i + 1) * HOLO_CELL;
        const a = p(x, b.y + 0.3, b.z);
        const c = p(x, b.y + b.d - 0.3, b.z);
        return <line key={`c${i}`} className="plate-grid" x1={a[0]} y1={a[1]} x2={c[0]} y2={c[1]} style={{ stroke: color }} />;
      })}
      {Array.from({ length: rows - 1 }, (_, i) => {
        const y = b.y + 0.3 + (i + 1) * HOLO_CELL;
        const a = p(b.x + 0.3, y, b.z);
        const c = p(b.x + b.w - 0.3, y, b.z);
        return <line key={`r${i}`} className="plate-grid" x1={a[0]} y1={a[1]} x2={c[0]} y2={c[1]} style={{ stroke: color }} />;
      })}
      <Billboard x={b.x} y={b.y + b.d / 2} z={b.z} text={title} sub={plate.kind === 'cluster' ? 'runs on any member' : `${plate.items.length} workload${plate.items.length === 1 ? '' : 's'}`} anchor="end" size={11} dy={-4} />
      {plate.items.length === 0 && <Billboard x={b.x + b.w / 2} y={b.y + b.d / 2} z={b.z + 0.2} text="No services yet" size={10} />}
      {items.map((it) => {
        const e = idx.get(it.id);
        const x = b.x + it.a;
        const y = b.y + it.b;
        if (e?.kind === 'guest') return <GuestItem key={it.id} g={e.guest} x={x} y={y} z={b.z} selected={sub === it.id} tint={color} />;
        if (e?.kind === 'service') return <ServiceChip key={it.id} s={e.service} x={x} y={y} z={b.z} selected={sub === it.id} />;
        return null;
      })}
    </g>
  );
}

function clusterKindLabel(c: Cluster) {
  return c.kind === 'proxmox' ? 'Proxmox HA' : c.kind === 'kubernetes' ? 'Kubernetes' : c.kind === 'swarm' ? 'Swarm' : 'Cluster';
}

function hexA(hex: string, a: number) {
  const n = parseInt(hex.replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function clickSub(id: string) {
  return (e: React.MouseEvent) => {
    e.stopPropagation();
    if (pointer.moved) return;
    selectSub(useStore.getState().focus.sub === id ? null : id);
  };
}

function hoverProps(id: string) {
  return {
    onPointerEnter: (e: React.PointerEvent) => useHover.setState({ hover: { id, x: e.clientX, y: e.clientY } }),
    onPointerMove: (e: React.PointerEvent) => {
      if (claimHover(e)) return;
      useHover.setState({ hover: { id, x: e.clientX, y: e.clientY } });
    },
    onPointerLeave: () => useHover.setState({ hover: null }),
  };
}

function Cube({ x, y, z, s, h, className }: { x: number; y: number; z: number; s: number; h: number; className: string }) {
  const b = { x: x - s / 2, y: y - s / 2, z, w: s, d: s, h };
  const T = pts([p(b.x, b.y, z + h), p(b.x + s, b.y, z + h), p(b.x + s, b.y + s, z + h), p(b.x, b.y + s, z + h)]);
  const L = pts([p(b.x, b.y + s, z), p(b.x + s, b.y + s, z), p(b.x + s, b.y + s, z + h), p(b.x, b.y + s, z + h)]);
  const R = pts([p(b.x + s, b.y + s, z), p(b.x + s, b.y, z), p(b.x + s, b.y, z + h), p(b.x + s, b.y + s, z + h)]);
  return (
    <g className={className}>
      <polygon className="c-l" points={L} />
      <polygon className="c-r" points={R} />
      <polygon className="c-t" points={T} />
    </g>
  );
}

function ServiceChip({ s, x, y, z, selected }: { s: Service; x: number; y: number; z: number; selected: boolean }) {
  const st = useMonStatus(s.monitorId);
  const ls = useLabelScale();
  const [sx, sy] = p(x, y, z);
  return (
    <g className={`chip st-${st} ${selected ? 'selected' : ''}`} onClick={clickSub(s.id)} {...hoverProps(s.id)}>
      <ellipse className="chip-shadow" cx={sx} cy={sy} rx={16} ry={9} />
      <g className="chip-lift">
        <Cube x={x} y={y} z={z + 0.15} s={0.95} h={0.32} className="chip-body" />
        <Cube x={x} y={y} z={z + 0.47} s={0.55} h={0.06} className="chip-led" />
        {(st === 'down' || selected) && <circle className="chip-ring" cx={sx} cy={sy - 0.5 * 16} r={20} />}
      </g>
      <text className="chip-label" x={sx} y={sy + 12 * ls + 6} style={{ fontSize: 10 * ls }} textAnchor="middle">
        {s.name}
      </text>
    </g>
  );
}

function GuestItem({ g, x, y, z, selected, tint }: { g: Guest; x: number; y: number; z: number; selected: boolean; tint: string }) {
  const pal = usePal();
  const hs = useStore((s) => {
    const r = guestHealth(g, s.monitors);
    return `${r.self}|${r.rollup}`;
  });
  const [self, rollup] = hs.split('|');
  const h = { self, rollup };
  const svc = useStore((s) => g.services.map((sv) => (sv.monitorId == null ? 'unknown' : (s.monitors[sv.monitorId]?.status ?? 'unknown'))).join(','));
  const ls = useLabelScale();
  const size = 1.35;
  const hgt = 1.0;
  const bx = x - size / 2;
  const by = y - size / 2;
  const [sx, sy] = p(x, y, z);
  const states = svc ? svc.split(',') : [];
  const per = Math.max(1, Math.ceil(Math.sqrt(states.length)));
  const cell = size / (per + 0.5);
  return (
    <g className={`guest st-${h.rollup} ${selected ? 'selected' : ''}`} onClick={clickSub(g.id)} {...hoverProps(g.id)}>
      <ellipse className="chip-shadow" cx={sx} cy={sy} rx={22} ry={12} />
      <g className="chip-lift">
        <g className="guest-box" style={{ stroke: tint }}>
          <polygon points={pts([p(bx, by + size, z + 0.15), p(bx + size, by + size, z + 0.15), p(bx + size, by + size, z + 0.15 + hgt), p(bx, by + size, z + 0.15 + hgt)])} style={{ fill: hexA(shade(tint, 0.2), 0.22) }} />
          <polygon points={pts([p(bx + size, by + size, z + 0.15), p(bx + size, by, z + 0.15), p(bx + size, by, z + 0.15 + hgt), p(bx + size, by + size, z + 0.15 + hgt)])} style={{ fill: hexA(shade(tint, -0.2), 0.22) }} />
          <polygon points={pts([p(bx, by, z + 0.15 + hgt), p(bx + size, by, z + 0.15 + hgt), p(bx + size, by + size, z + 0.15 + hgt), p(bx, by + size, z + 0.15 + hgt)])} style={{ fill: hexA(shade(tint, 0.45), 0.3) }} />
        </g>
        {/* host LED on the front */}
        <polygon className={`led-core st-${h.self}`} points={pts([p(bx + 0.15, by + size, z + 0.35), p(bx + 0.4, by + size, z + 0.35), p(bx + 0.4, by + size, z + 0.5), p(bx + 0.15, by + size, z + 0.5)])} />
        <text className="guest-kind" x={p(bx + 0.55, by + size, z + 0.4)[0]} y={p(bx + 0.55, by + size, z + 0.4)[1]} style={{ fontSize: 4.2, fill: pal.text }}>
          {g.kind.toUpperCase()}
        </text>
        {states.map((st, i) => {
          const cx = bx + cell * 0.75 + (i % per) * cell;
          const cy = by + cell * 0.75 + Math.floor(i / per) * cell;
          return <Cube key={i} x={cx} y={cy} z={z + 0.15 + hgt} s={cell * 0.6} h={0.14} className={`mini st-${st}`} />;
        })}
        {(h.rollup === 'down' || selected) && <circle className="chip-ring" cx={sx} cy={sy - 0.9 * 16} r={28} />}
      </g>
      <text className="chip-label" x={sx} y={sy + 14 * ls + 8} style={{ fontSize: 10 * ls }} textAnchor="middle">
        {g.name}
      </text>
    </g>
  );
}

/** Animated links between the members of a highlighted cluster. */
export function ClusterLinks({ world, clusterId }: { world: World; clusterId: string }) {
  const cluster = world.clusters.find((c) => c.id === clusterId);
  const ls = useLabelScale();
  if (!cluster) return null;
  const idx = indexWorld(world);
  const anchors = cluster.members
    .map((id) => {
      const e = idx.get(id);
      if (!e || e.kind !== 'machine') return null;
      const pt = deviceFrontPoint(world, e.path);
      return pt ? { id, name: e.machine.name, pt: p(pt[0], pt[1], pt[2]), mid: e.machine.monitorId } : null;
    })
    .filter((a): a is NonNullable<typeof a> => !!a);
  const links: [number, number][] = [];
  if (anchors.length <= 4) for (let i = 0; i < anchors.length; i++) for (let j = i + 1; j < anchors.length; j++) links.push([i, j]);
  else for (let i = 0; i < anchors.length; i++) links.push([i, (i + 1) % anchors.length]);
  return (
    <g className="cluster-links" style={{ color: cluster.color }}>
      {links.map(([a, b]) => {
        const A = anchors[a].pt;
        const B = anchors[b].pt;
        const mx = (A[0] + B[0]) / 2;
        const my = Math.min(A[1], B[1]) - Math.hypot(B[0] - A[0], B[1] - A[1]) * 0.35 - 20;
        return <path key={`${a}-${b}`} className="link" d={`M ${A[0]} ${A[1]} Q ${mx} ${my} ${B[0]} ${B[1]}`} style={{ strokeWidth: 3.5 }} />;
      })}
      {anchors.map((a) => (
        <MemberMarker key={a.id} x={a.pt[0]} y={a.pt[1]} monitorId={a.mid} ls={ls} />
      ))}
    </g>
  );
}

function MemberMarker({ x, y, monitorId, ls }: { x: number; y: number; monitorId: number | null | undefined; ls: number }) {
  const st = useMonStatus(monitorId);
  return (
    <g className={`member st-${st}`} transform={`translate(${x},${y})`}>
      <circle className="member-pulse" r={12 * ls} />
      <circle className="member-halo" r={9 * ls} />
      <circle className="member-dot" r={6 * ls} />
    </g>
  );
}

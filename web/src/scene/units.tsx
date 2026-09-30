import { useEffect, useRef, useState } from 'react';
import type { MachineUnit, RackDevice, RackUnit } from '../../../shared/model';
import { DEVICE_TYPES, RACK_BASE, RACK_DEPTH, RACK_TOP, RACK_WIDTH, U_HEIGHT, rackHeight } from '../../../shared/model';
import { Frame, T, faceMap, p, pts, quad, type Box } from '../iso/iso';
import { useStore } from '../state/store';
import { unitHealth } from '../state/health';
import { MachineArt, RackDeviceArt, rackDeviceColor } from './devices';
import { entityHandlers } from './interact';
import { MACHINE_HEIGHT } from './layout';
import { Billboard, FaceRect, HitBox, Pin, Prism, useLabelScale, useMachineStatus, usePal } from './primitives';

export interface UnitCtx {
  /** [siteId, buildingId] */
  base: string[];
  /** Units are clickable (the building is focused or a unit inside it is). */
  open: boolean;
  focusUnit: string | null;
  focusDevice: string | null;
  selected: string | null;
  edit: boolean;
}

function useTween(target: number, ms = 260): number {
  const [v, setV] = useState(target);
  const cur = useRef(target);
  useEffect(() => {
    const from = cur.current;
    if (from === target) return;
    const t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / ms);
      const e = 1 - Math.pow(1 - t, 3);
      cur.current = from + (target - from) * e;
      setV(cur.current);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

function Outline({ b, className }: { b: Box; className: string }) {
  const q = [p(b.x - 0.12, b.y - 0.12, 0.02), p(b.x + b.w + 0.12, b.y - 0.12, 0.02), p(b.x + b.w + 0.12, b.y + b.d + 0.12, 0.02), p(b.x - 0.12, b.y + b.d + 0.12, 0.02)];
  return <polygon className={className} points={pts(q)} />;
}

// ---------------------------------------------------------------------------
// Rack
// ---------------------------------------------------------------------------

export function RackView({ rack, ox, oy, ctx }: { rack: RackUnit; ox: number; oy: number; ctx: UnitCtx }) {
  const pal = usePal();
  const fr = new Frame(ox, oy, RACK_WIDTH, RACK_DEPTH, rack.facing);
  const H = rackHeight(rack.heightU);
  const body = fr.box(0, 0, 0, RACK_WIDTH, RACK_DEPTH, H);
  const rollup = useStore((s) => unitHealth(rack, s.monitors).rollup);
  const [hovered, setHovered] = useState<string | null>(null);
  const isFocus = ctx.focusUnit === rack.id;
  const dim = !!ctx.focusUnit && !isFocus;
  const path = [...ctx.base, rack.id];
  const handlers = entityHandlers({ id: rack.id, path, active: ctx.open && !isFocus, drag: 'unit' });
  const front = fr.front;
  const side = fr.side;
  const colors = front === 'left' ? { left: pal.rackFrame, right: pal.rackSide } : { right: pal.rackFrame, left: pal.rackSide };

  // Bottom to top: each device's thin top edge is then covered by the one above.
  const devices = [...rack.devices].sort((a, b) => a.u - b.u);

  const fb = faceMap(body, front);
  const cavity = { u0: 0.07, u1: RACK_WIDTH - 0.07, v0: RACK_BASE, v1: H - RACK_TOP };

  return (
    <g className={`ent unit rack ${handlers.onClick ? 'active' : ''} ${dim ? 'dim' : ''} ${isFocus ? 'focus' : ''}`} {...handlers}>
      {ctx.edit && ctx.selected === rack.id && <Outline b={body} className="sel-outline" />}
      {handlers.onClick && <HitBox b={body} />}
      <g className="lift">
        <Prism b={body} c={pal.rackFrame} top={pal.rackTop} left={colors.left} right={colors.right} />
        <polygon points={quad(fb, cavity.u0, cavity.v0, cavity.u1, cavity.v1)} style={{ fill: pal.rackInner, stroke: pal.rackInner }} />
        {/* feet */}
        <polygon points={quad(fb, 0, 0, RACK_WIDTH, RACK_BASE * 0.6)} style={{ fill: pal.rackDark, stroke: pal.rackDark }} />
        {/* side vents */}
        {[0, 1, 2, 3, 4].map((i) => (
          <FaceRect key={i} b={body} face={side} u0={0.35} v0={H - 0.35 - i * 0.1} u1={1.65} v1={H - 0.31 - i * 0.1} c={pal.rackDark} />
        ))}
        {/* rails with U holes when focused */}
        {isFocus &&
          Array.from({ length: rack.heightU }, (_, i) => {
            const v = RACK_BASE + i * U_HEIGHT + U_HEIGHT * 0.4;
            return (
              <g key={`h${i}`}>
                <polygon points={quad(fb, 0.085, v, 0.11, v + 0.018)} style={{ fill: pal.devVent }} />
                <polygon points={quad(fb, RACK_WIDTH - 0.11, v, RACK_WIDTH - 0.085, v + 0.018)} style={{ fill: pal.devVent }} />
              </g>
            );
          })}
        {(['plate', 'drawer'] as const).map((layer) =>
          layer === 'drawer' && !isFocus
            ? null
            : devices.map((d) => (
                <RackDeviceView
                  key={`${layer}-${d.id}`}
                  layer={layer}
                  d={d}
                  fr={fr}
                  path={[...path, d.id]}
                  active={isFocus && ctx.focusDevice !== d.id}
                  focused={ctx.focusDevice === d.id}
                  hovered={hovered === d.id}
                  setHovered={setHovered}
                  edit={ctx.edit}
                  selected={ctx.selected === d.id}
                />
              )),
        )}
        <g className={`strip st-${rollup}`}>
          <polygon className="strip-glow" points={quad(fb, 0.12, H - RACK_TOP * 0.8, RACK_WIDTH - 0.12, H - RACK_TOP * 0.25)} />
          <polygon className="strip-core" points={quad(fb, 0.18, H - RACK_TOP * 0.66, RACK_WIDTH - 0.18, H - RACK_TOP * 0.4)} />
        </g>
      </g>
      <Pin x={body.x + body.w / 2} y={body.y + body.d / 2} z={H + 0.35} r={0.3} status={rollup} className="pin-unit" />
      {isFocus && !ctx.focusDevice && <DeviceLabels devices={devices} body={body} front={front} />}
    </g>
  );
}

/** Labels to the left of a focused rack, spread apart so neighbours don't overlap. */
function DeviceLabels({ devices, body, front }: { devices: RackDevice[]; body: Box; front: 'left' | 'right' }) {
  const ls = useLabelScale();
  const minDz = (10 * ls * 2.05) / T;
  const list = devices
    .filter((d) => d.type !== 'blank' && d.type !== 'patch-panel')
    .map((d) => ({ d, zc: RACK_BASE + (d.u - 1 + d.size / 2) * U_HEIGHT }))
    .sort((a, b) => b.zc - a.zc);
  let last = Infinity;
  const placed = list.map((it) => {
    const z = Math.min(it.zc, last - minDz);
    last = z;
    return { ...it, z };
  });
  const [x, y] = front === 'left' ? [body.x - 0.35, body.y + body.d] : [body.x + body.w, body.y + body.d + 0.35];
  const [ax, ay] = front === 'left' ? [body.x + 0.05, body.y + body.d] : [body.x + body.w, body.y + body.d - 0.05];
  return (
    <g className="dev-labels">
      {placed.map((it) => {
        const a = p(x, y, it.z);
        const b = p(ax, ay, it.zc);
        return <line key={`l${it.d.id}`} className="leader" x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} />;
      })}
      {placed.map((it) => (
        <DeviceLabel key={it.d.id} d={it.d} x={x} y={y} z={it.z} />
      ))}
    </g>
  );
}

function DeviceLabel({ d, x, y, z }: { d: RackDevice; x: number; y: number; z: number }) {
  const { rollup } = useMachineStatus(d);
  const ls = useLabelScale();
  return <Billboard x={x} y={y} z={z - (10 * ls * 0.9) / T} text={d.name} status={DEVICE_TYPES[d.type].monitored || d.monitorId != null ? rollup : undefined} anchor="end" size={10} className="lbl-dev" />;
}

/**
 * A rack device is drawn in two layers:
 *  - "plate": the device flush in the rack, always drawn in bottom-to-top order so
 *    its thin top/side edges sit correctly behind the device above;
 *  - "drawer": only while sliding out – the part in front of the rack, drawn after
 *    all plates. It starts exactly at the plate's front, so the two join seamlessly
 *    and the drawer never covers the device above.
 */
function RackDeviceView({
  layer,
  d,
  fr,
  path,
  active,
  focused,
  hovered,
  setHovered,
  edit,
  selected,
}: {
  layer: 'plate' | 'drawer';
  d: RackDevice;
  fr: Frame;
  path: string[];
  active: boolean;
  focused: boolean;
  hovered: boolean;
  setHovered: (id: string | null) => void;
  edit: boolean;
  selected: boolean;
}) {
  const pal = usePal();
  const { self } = useMachineStatus(d);
  const slide = useTween(layer === 'drawer' && (focused || (hovered && active)) ? (focused ? 1.4 : 0.35) : 0);
  const zb = RACK_BASE + (d.u - 1) * U_HEIGHT + 0.003;
  const hh = d.size * U_HEIGHT - 0.006;
  const W = RACK_WIDTH - 0.14;
  const FRONT = RACK_DEPTH + 0.03;
  const plate = fr.box(0.07, RACK_DEPTH - 0.01, zb, W, 0.04, hh);
  const out = slide > 0.002;
  if (layer === 'drawer' && !out) return null;
  const box = layer === 'drawer' ? fr.box(0.07, FRONT, zb, W, slide, hh) : plate;
  // Front decorations live on whichever part is currently the front.
  const showFront = layer === 'drawer' || !(hovered && active);
  const c = rackDeviceColor(d.type, pal);
  const h = entityHandlers({ id: d.id, path, active });
  return (
    <g
      className={`ent dev ${active ? 'active' : ''} ${focused ? 'focus' : ''} st-${self}`}
      {...h}
      onPointerEnter={(e) => {
        if (active) setHovered(d.id);
        h.onPointerEnter?.(e);
      }}
      onPointerLeave={() => {
        setHovered(null);
        h.onPointerLeave?.();
      }}
    >
      {layer === 'plate' && <polygon className="hit" points={quad(faceMap(plate, fr.front), 0, 0, W, hh)} />}
      <Prism b={box} c={c} top={d.type === 'blank' ? pal.rackTop : pal.devTop} />
      {showFront && <RackDeviceArt m={d} b={box} face={fr.front} self={self} />}
      {self === 'down' && <polygon className="dev-alarm" points={quad(faceMap(box, fr.front), 0, 0, W, hh)} />}
      {(focused || (edit && selected)) && (layer === 'drawer' || !focused) && <polygon className="dev-focus" points={quad(faceMap(box, fr.front), -0.01, -0.004, W + 0.01, hh + 0.004)} />}
    </g>
  );
}

// ---------------------------------------------------------------------------
// Standalone machine
// ---------------------------------------------------------------------------

export function MachineView({ m, ox, oy, ctx }: { m: MachineUnit; ox: number; oy: number; ctx: UnitCtx }) {
  const [W, D] = DEVICE_TYPES[m.type]?.footprint ?? [1, 1];
  const fr = new Frame(ox, oy, W, D, m.facing);
  const { self, rollup } = useMachineStatus(m);
  const isFocus = ctx.focusUnit === m.id;
  const dim = !!ctx.focusUnit && !isFocus;
  const path = [...ctx.base, m.id];
  const handlers = entityHandlers({ id: m.id, path, active: ctx.open && !isFocus, drag: 'unit' });
  const height = MACHINE_HEIGHT[m.type] ?? 1.2;
  const foot = fr.box(0, 0, 0, W, D, 0);
  const monitored = DEVICE_TYPES[m.type]?.monitored || m.monitorId != null;
  return (
    <g className={`ent unit machine ${handlers.onClick ? 'active' : ''} ${dim ? 'dim' : ''} ${isFocus ? 'focus' : ''}`} {...handlers}>
      {ctx.edit && ctx.selected === m.id && <Outline b={foot} className="sel-outline" />}
      {(self === 'down' || rollup === 'down') && <Outline b={foot} className="alarm-glow" />}
      {handlers.onClick && <HitBox b={{ ...foot, h: height }} />}
      <g className="lift">
        <MachineArt m={m} fr={fr} self={self} />
      </g>
      {monitored && <Pin x={foot.x + foot.w / 2} y={foot.y + foot.d / 2} z={height + 0.45} r={0.3} status={rollup} className="pin-unit" />}
    </g>
  );
}

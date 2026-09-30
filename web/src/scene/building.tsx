import { useEffect, useState, type ReactNode } from 'react';
import type { Building, FloorMaterial, Room, Site, Unit } from '../../../shared/model';
import { unitFootprint } from '../../../shared/model';
import { depthSort, faceMap, p, pts, quad, seeded, type Box, type FaceName } from '../iso/iso';
import { shade, type Palette } from '../iso/palette';
import { useStore } from '../state/store';
import { buildingHealth } from '../state/health';
import { entityHandlers } from './interact';
import { FLOOR_H, WALL_H, buildingOrigin } from './layout';
import { Billboard, HitBox, Pin, Prism, fill, usePal } from './primitives';
import { MachineView, RackView, type UnitCtx } from './units';

export interface BuildingCtx {
  siteFocused: boolean;
  open: boolean;
  focusUnit: string | null;
  focusDevice: string | null;
  selected: string | null;
  edit: boolean;
  dim: boolean;
  /** Another building of this site is open: this one fades. */
  fade: boolean;
}

function useLinger(on: boolean, ms: number) {
  const [v, setV] = useState(on);
  useEffect(() => {
    if (on) {
      setV(true);
      return;
    }
    const t = setTimeout(() => setV(false), ms);
    return () => clearTimeout(t);
  }, [on, ms]);
  return on || v;
}

export function BuildingView({ site, b, ctx }: { site: Site; b: Building; ctx: BuildingCtx }) {
  const pal = usePal();
  const { x, y } = buildingOrigin(site, b);
  const rollup = useStore((s) => buildingHealth(b, s.monitors).rollup);
  const counts = useStore((s) => {
    const h = buildingHealth(b, s.monitors);
    return `${h.machines.up + h.machines.down + h.machines.warn}|${h.machines.down}`;
  });
  const [total, down] = counts.split('|').map(Number);
  const showInterior = useLinger(ctx.open, 800);
  const handlers = entityHandlers({ id: b.id, path: [site.id, b.id], active: ctx.siteFocused && !ctx.open, drag: 'building' });
  const H = b.floors * FLOOR_H;

  let ext: { body: ReactNode; roof: ReactNode; top: number };
  if (b.kind === 'residential') ext = house(b, x, y, H, pal);
  else if (b.kind === 'commercial') ext = office(b, x, y, H, pal);
  else ext = factory(b, x, y, H, pal);

  return (
    <g className={`ent building ${handlers.onClick ? 'active' : ''} ${ctx.open ? 'open' : ''} ${ctx.fade ? 'fade' : ''} ${ctx.dim ? 'dim' : ''}`} data-id={b.id}>
      {showInterior && <Interior site={site} b={b} x={x} y={y} ctx={ctx} pal={pal} />}
      <g className="ext" {...handlers}>
        {handlers.onClick && <HitBox b={{ x, y, z: 0, w: b.w, d: b.d, h: ext.top }} />}
        <g className="lift">
          {ctx.edit && ctx.selected === b.id && (
            <polygon className="sel-outline" points={pts([p(x - 0.4, y - 0.4, 0.02), p(x + b.w + 0.4, y - 0.4, 0.02), p(x + b.w + 0.4, y + b.d + 0.4, 0.02), p(x - 0.4, y + b.d + 0.4, 0.02)])} />
          )}
          <polygon className="bshadow" points={pts([p(x, y, 0), p(x + b.w + 1.2, y, 0), p(x + b.w + 1.2, y + b.d + 1.2, 0), p(x, y + b.d + 1.2, 0)])} style={{ fill: pal.shadow }} />
          <g className="ext-body">{ext.body}</g>
          <g className="ext-roof">
            {ext.roof}
            <Pin x={x + b.w / 2} y={y + b.d / 2} z={ext.top + 0.8} r={0.55} status={total ? rollup : 'unknown'} className="pin-bld" />
          </g>
        </g>
      </g>
      {!ctx.open && (
        <Billboard x={x + b.w / 2} y={y + b.d / 2} z={ext.top + 3.2} text={b.name} sub={total ? `${total} devices${down ? ` · ${down} down` : ''}` : 'empty'} status={total ? rollup : undefined} className="lbl-bld" />
      )}
    </g>
  );
}

// ---------------------------------------------------------------------------
// Exteriors
// ---------------------------------------------------------------------------

function Win({ b, face, u, v, w, h, pal }: { b: Box; face: FaceName; u: number; v: number; w: number; h: number; pal: Palette }) {
  const f = faceMap(b, face);
  const glass = face === 'right' ? shade(pal.window, -0.12) : pal.window;
  return (
    <g>
      <polygon points={quad(f, u - 0.12, v - 0.12, u + w + 0.12, v + h + 0.12)} style={fill(pal.windowFrame)} />
      <polygon points={quad(f, u, v, u + w, v + h)} style={fill(glass)} />
      <polygon points={quad(f, u + w * 0.1, v + h * 0.55, u + w * 0.35, v + h * 0.9)} style={fill(shade(glass, 0.25))} />
      <polygon points={quad(f, u + w / 2 - 0.04, v, u + w / 2 + 0.04, v + h)} style={fill(pal.windowFrame)} />
      <polygon points={quad(f, u - 0.2, v - 0.2, u + w + 0.2, v - 0.08)} style={fill(shade(pal.windowFrame, -0.1))} />
    </g>
  );
}

function house(b: Building, x: number, y: number, H: number, pal: Palette) {
  const walls: Box = { x, y, z: 0, w: b.w, d: b.d, h: H };
  const body: ReactNode[] = [];
  body.push(<Prism key="plinth" b={{ ...walls, h: 0.4 }} c={shade(pal.houseWall, -0.28)} hide={{ top: true }} />);
  body.push(<Prism key="walls" b={{ ...walls, z: 0.4, h: H - 0.4 }} c={pal.houseWall} hide={{ top: true }} />);
  const doorIdx = Math.floor(Math.max(1, Math.floor((b.w - 1) / 3.2)) / 2);
  for (const face of ['left', 'right'] as const) {
    const len = face === 'left' ? b.w : b.d;
    const n = Math.max(1, Math.floor((len - 1) / 3.2));
    const sp = len / n;
    for (let f = 0; f < b.floors; f++) {
      for (let i = 0; i < n; i++) {
        const u = sp * (i + 0.5);
        if (face === 'left' && f === 0 && i === doorIdx) {
          const fm = faceMap(walls, 'left');
          body.push(
            <g key={`door`}>
              <polygon points={quad(fm, u - 0.9, 0.35, u + 0.9, 3.3)} style={fill(pal.houseTrim)} />
              <polygon points={quad(fm, u - 0.72, 0.35, u + 0.72, 3.15)} style={fill(pal.door)} />
              <polygon points={quad(fm, u + 0.35, 1.6, u + 0.5, 1.75)} style={fill(pal.cableYellow)} />
              <polygon points={pts([p(x + u - 1.1, y + b.d, 3.55), p(x + u + 1.1, y + b.d, 3.55), p(x + u + 1.1, y + b.d + 0.8, 3.3), p(x + u - 1.1, y + b.d + 0.8, 3.3)])} style={fill(shade(pal.houseRoof, -0.1))} />
            </g>,
          );
          continue;
        }
        body.push(<Win key={`${face}-${f}-${i}`} b={walls} face={face} u={u - 0.7} v={f * FLOOR_H + 1.5} w={1.4} h={1.8} pal={pal} />);
      }
    }
  }

  const o = 0.5;
  const rh = Math.min(b.w, b.d) * 0.32;
  const roof: ReactNode[] = [];
  const R = pal.houseRoof;
  const line = shade(R, -0.12);
  if (b.w >= b.d) {
    const yc = y + b.d / 2;
    roof.push(<polygon key="back" points={pts([p(x - o, y - o, H), p(x + b.w + o, y - o, H), p(x + b.w + o, yc, H + rh), p(x - o, yc, H + rh)])} style={fill(shade(R, -0.22))} />);
    roof.push(<Prism key="chim" b={{ x: x + b.w * 0.72, y: y + b.d * 0.22, z: H + rh * 0.3, w: 0.9, d: 0.9, h: rh * 1.05 }} c={shade(pal.houseWall, -0.2)} top={shade(pal.houseWall, -0.4)} />);
    roof.push(<polygon key="gable" points={pts([p(x + b.w, y, H), p(x + b.w, y + b.d, H), p(x + b.w, yc, H + rh)])} style={fill(shade(pal.houseWall, -0.26))} />);
    roof.push(<Win key="gwin" b={{ x, y, z: H, w: b.w, d: b.d, h: rh }} face="right" u={b.d / 2 - 0.5} v={rh * 0.25} w={1} h={1} pal={pal} />);
    roof.push(<polygon key="rakeb" points={pts([p(x + b.w + o, yc, H + rh), p(x + b.w + o, y - o, H), p(x + b.w + o, y - o, H - 0.25), p(x + b.w + o, yc, H + rh - 0.25)])} style={fill(shade(R, -0.45))} />);
    roof.push(<polygon key="front" points={pts([p(x - o, y + b.d + o, H), p(x + b.w + o, y + b.d + o, H), p(x + b.w + o, yc, H + rh), p(x - o, yc, H + rh)])} style={fill(R)} />);
    for (let t = 0.2; t < 1; t += 0.2) {
      const a = [x - o, y + b.d + o + (yc - (y + b.d + o)) * t, H + rh * t] as const;
      roof.push(<line key={`l${t}`} x1={p(a[0], a[1], a[2])[0]} y1={p(a[0], a[1], a[2])[1]} x2={p(x + b.w + o, a[1], a[2])[0]} y2={p(x + b.w + o, a[1], a[2])[1]} style={{ stroke: line, strokeWidth: 1 }} />);
    }
    roof.push(<polygon key="rakef" points={pts([p(x + b.w + o, y + b.d + o, H), p(x + b.w + o, yc, H + rh), p(x + b.w + o, yc, H + rh - 0.25), p(x + b.w + o, y + b.d + o, H - 0.25)])} style={fill(shade(R, -0.4))} />);
    roof.push(<polygon key="fascia" points={pts([p(x - o, y + b.d + o, H), p(x + b.w + o, y + b.d + o, H), p(x + b.w + o, y + b.d + o, H - 0.25), p(x - o, y + b.d + o, H - 0.25)])} style={fill(shade(R, -0.3))} />);
  } else {
    const xc = x + b.w / 2;
    roof.push(<polygon key="back" points={pts([p(x - o, y - o, H), p(x - o, y + b.d + o, H), p(xc, y + b.d + o, H + rh), p(xc, y - o, H + rh)])} style={fill(shade(R, -0.18))} />);
    roof.push(<Prism key="chim" b={{ x: x + b.w * 0.22, y: y + b.d * 0.2, z: H + rh * 0.3, w: 0.9, d: 0.9, h: rh * 1.05 }} c={shade(pal.houseWall, -0.2)} top={shade(pal.houseWall, -0.4)} />);
    roof.push(<polygon key="gable" points={pts([p(x, y + b.d, H), p(x + b.w, y + b.d, H), p(xc, y + b.d, H + rh)])} style={fill(pal.houseWall)} />);
    roof.push(<Win key="gwin" b={{ x, y, z: H, w: b.w, d: b.d, h: rh }} face="left" u={b.w / 2 - 0.5} v={rh * 0.25} w={1} h={1} pal={pal} />);
    roof.push(<polygon key="rakel" points={pts([p(x - o, y + b.d + o, H), p(xc, y + b.d + o, H + rh), p(xc, y + b.d + o, H + rh - 0.25), p(x - o, y + b.d + o, H - 0.25)])} style={fill(shade(R, -0.3))} />);
    roof.push(<polygon key="front" points={pts([p(x + b.w + o, y - o, H), p(x + b.w + o, y + b.d + o, H), p(xc, y + b.d + o, H + rh), p(xc, y - o, H + rh)])} style={fill(shade(R, -0.08))} />);
    for (let t = 0.2; t < 1; t += 0.2) {
      const xx = x + b.w + o + (xc - (x + b.w + o)) * t;
      roof.push(<line key={`l${t}`} x1={p(xx, y - o, H + rh * t)[0]} y1={p(xx, y - o, H + rh * t)[1]} x2={p(xx, y + b.d + o, H + rh * t)[0]} y2={p(xx, y + b.d + o, H + rh * t)[1]} style={{ stroke: line, strokeWidth: 1 }} />);
    }
    roof.push(<polygon key="raker" points={pts([p(x + b.w + o, y + b.d + o, H), p(xc, y + b.d + o, H + rh), p(xc, y + b.d + o, H + rh - 0.25), p(x + b.w + o, y + b.d + o, H - 0.25)])} style={fill(shade(R, -0.4))} />);
    roof.push(<polygon key="fascia" points={pts([p(x + b.w + o, y - o, H), p(x + b.w + o, y + b.d + o, H), p(x + b.w + o, y + b.d + o, H - 0.25), p(x + b.w + o, y - o, H - 0.25)])} style={fill(shade(R, -0.45))} />);
  }
  return { body, roof, top: H + rh };
}

function office(b: Building, x: number, y: number, H: number, pal: Palette) {
  const walls: Box = { x, y, z: 0, w: b.w, d: b.d, h: H };
  const body: ReactNode[] = [<Prism key="w" b={walls} c={pal.officeWall} hide={{ top: true }} />];
  for (const face of ['left', 'right'] as const) {
    const f = faceMap(walls, face);
    const len = face === 'left' ? b.w : b.d;
    const glass = face === 'right' ? shade(pal.officeGlass, -0.15) : pal.officeGlass;
    for (let fl = 0; fl < b.floors; fl++) {
      const v0 = fl * FLOOR_H + (fl === 0 ? 0.6 : 0.9);
      const v1 = fl * FLOOR_H + FLOOR_H - 0.6;
      body.push(<polygon key={`${face}${fl}`} points={quad(f, 0.35, v0, len - 0.35, v1)} style={fill(glass)} />);
      body.push(<polygon key={`${face}${fl}r`} points={quad(f, 0.35, v1 - (v1 - v0) * 0.35, len * 0.45, v1 - (v1 - v0) * 0.2)} style={{ ...fill(shade(glass, 0.22)), opacity: 0.6 }} />);
      for (let u = 1.6; u < len - 0.4; u += 1.6) body.push(<polygon key={`${face}${fl}m${u}`} points={quad(f, u - 0.05, v0, u + 0.05, v1)} style={fill(pal.officeMullion)} />);
    }
  }
  // entrance
  const fm = faceMap(walls, 'left');
  const c = b.w / 2;
  body.push(<polygon key="door" points={quad(fm, c - 1.1, 0, c + 1.1, 2.9)} style={fill(shade(pal.officeGlass, -0.35))} />);
  body.push(<polygon key="door2" points={quad(fm, c - 0.04, 0, c + 0.04, 2.9)} style={fill(pal.officeMullion)} />);
  body.push(<Prism key="canopy" b={{ x: x + c - 1.8, y: y + b.d, z: 3.1, w: 3.6, d: 1.2, h: 0.18 }} c={pal.officeMullion} />);
  const roof: ReactNode[] = [];
  roof.push(<polygon key="top" points={pts([p(x, y, H), p(x + b.w, y, H), p(x + b.w, y + b.d, H), p(x, y + b.d, H)])} style={fill(shade(pal.officeWall, 0.15))} />);
  roof.push(<polygon key="inset" points={pts([p(x + 0.35, y + 0.35, H), p(x + b.w - 0.35, y + 0.35, H), p(x + b.w - 0.35, y + b.d - 0.35, H), p(x + 0.35, y + b.d - 0.35, H)])} style={fill(shade(pal.officeWall, -0.08))} />);
  roof.push(<Prism key="hvac1" b={{ x: x + 1.2, y: y + 1.2, z: H, w: 2.2, d: 1.6, h: 0.9 }} c={pal.devSilver} />);
  roof.push(<Prism key="hvac2" b={{ x: x + 4, y: y + 1.2, z: H, w: 1.6, d: 1.6, h: 0.7 }} c={pal.devSilver} />);
  roof.push(<Prism key="ant" b={{ x: x + b.w - 1.6, y: y + 1, z: H, w: 0.12, d: 0.12, h: 3 }} c={pal.devSide} />);
  roof.push(<circle key="antl" className="blink-slow" cx={p(x + b.w - 1.54, y + 1.06, H + 3.05)[0]} cy={p(x + b.w - 1.54, y + 1.06, H + 3.05)[1]} r={1.6} style={{ fill: pal.cableRed }} />);
  return { body, roof, top: H + 0.9 };
}

function factory(b: Building, x: number, y: number, H: number, pal: Palette) {
  const walls: Box = { x, y, z: 0, w: b.w, d: b.d, h: H };
  const body: ReactNode[] = [<Prism key="w" b={walls} c={pal.factoryWall} hide={{ top: true }} />];
  for (const face of ['left', 'right'] as const) {
    const f = faceMap(walls, face);
    const len = face === 'left' ? b.w : b.d;
    const rib = face === 'right' ? shade(pal.factoryRib, -0.2) : pal.factoryRib;
    for (let u = 0.5; u < len; u += 0.7) body.push(<polygon key={`${face}r${u}`} points={quad(f, u, 0.3, u + 0.12, H - 0.25)} style={fill(rib)} />);
    for (let u = 0.8; u < len - 1; u += 1.8) body.push(<polygon key={`${face}w${u}`} points={quad(f, u, H - 1.5, u + 1.2, H - 0.7)} style={fill(face === 'right' ? shade(pal.window, -0.15) : pal.window)} />);
    body.push(<polygon key={`${face}base`} points={quad(f, 0, 0, len, 0.3)} style={fill(shade(pal.factoryWall, -0.3))} />);
  }
  const fm = faceMap(walls, 'left');
  const doors = Math.max(1, Math.floor(b.w / 8));
  for (let i = 0; i < doors; i++) {
    const u = ((i + 0.5) * b.w) / doors - 1.6;
    const dh = Math.min(3.8, H - 2);
    body.push(<polygon key={`d${i}`} points={quad(fm, u - 0.15, 0.3, u + 3.35, dh + 0.15)} style={fill(shade(pal.factoryWall, -0.35))} />);
    body.push(<polygon key={`dd${i}`} points={quad(fm, u, 0.3, u + 3.2, dh)} style={fill(pal.factoryDoor)} />);
    for (let v = 0.6; v < dh; v += 0.35) body.push(<polygon key={`ds${i}${v}`} points={quad(fm, u, v, u + 3.2, v + 0.06)} style={fill(shade(pal.factoryDoor, -0.15))} />);
    body.push(<polygon key={`dy${i}`} points={quad(fm, u - 0.15, 0.3, u + 3.35, 0.5)} style={fill(pal.cableYellow)} />);
  }
  const roof: ReactNode[] = [];
  const n = Math.max(2, Math.round(b.w / 5));
  const tw = b.w / n;
  const th = 1.6;
  roof.push(<polygon key="base" points={pts([p(x, y, H), p(x + b.w, y, H), p(x + b.w, y + b.d, H), p(x, y + b.d, H)])} style={fill(pal.factoryRoof)} />);
  for (let i = 0; i < n; i++) {
    const a = x + i * tw;
    const e = a + tw;
    roof.push(
      <g key={`t${i}`}>
        <polygon points={pts([p(a, y, H), p(e, y, H + th), p(e, y + b.d, H + th), p(a, y + b.d, H)])} style={fill(shade(pal.factoryRoof, 0.12))} />
        <polygon points={pts([p(e, y + b.d, H), p(e, y, H), p(e, y, H + th), p(e, y + b.d, H + th)])} style={fill(shade(pal.window, -0.2))} />
        <polygon points={pts([p(a, y + b.d, H), p(e, y + b.d, H), p(e, y + b.d, H + th)])} style={fill(shade(pal.factoryWall, -0.05))} />
      </g>,
    );
  }
  const sx = x + b.w - 2.4;
  const sy = y + 0.8;
  const stackH = 4.5;
  roof.push(<Prism key="stack" b={{ x: sx, y: sy, z: H + th * 0.8, w: 1.2, d: 1.2, h: stackH }} c={pal.factoryWall} />);
  roof.push(<Prism key="stripe" b={{ x: sx - 0.01, y: sy - 0.01, z: H + th * 0.8 + stackH - 1.1, w: 1.22, d: 1.22, h: 0.5 }} c={pal.stripe} hide={{ top: true }} />);
  const [cx, cy] = p(sx + 0.6, sy + 0.6, H + th * 0.8 + stackH + 0.3);
  roof.push(
    <g key="smoke" className="smoke" transform={`translate(${cx},${cy})`}>
      <circle r={9} style={{ animationDelay: '0s' }} />
      <circle r={9} style={{ animationDelay: '1.3s' }} />
      <circle r={9} style={{ animationDelay: '2.6s' }} />
    </g>,
  );
  return { body, roof, top: H + th };
}

// ---------------------------------------------------------------------------
// Interior
// ---------------------------------------------------------------------------

function floorColors(m: FloorMaterial, pal: Palette): { base: string; line: string } {
  switch (m) {
    case 'raised':
      return { base: pal.floorRaised, line: pal.floorLine };
    case 'wood':
      return { base: pal.wood, line: pal.woodLine };
    case 'carpet':
      return { base: pal.carpet, line: pal.carpetLine };
    case 'tile':
      return { base: pal.tile, line: pal.tileLine };
    default:
      return { base: pal.concrete, line: pal.concreteLine };
  }
}

function FloorArea({ x, y, w, d, material, seed, pal }: { x: number; y: number; w: number; d: number; material: FloorMaterial; seed: string; pal: Palette }) {
  const { base, line } = floorColors(material, pal);
  const els: ReactNode[] = [<polygon key="base" points={pts([p(x, y), p(x + w, y), p(x + w, y + d), p(x, y + d)])} style={fill(base)} />];
  const L = (x1: number, y1: number, x2: number, y2: number, k: string) => {
    const a = p(x1, y1);
    const b = p(x2, y2);
    els.push(<line key={k} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} className="floor-line" style={{ stroke: line }} />);
  };
  if (material === 'raised' || material === 'tile') {
    for (let i = 1; i < w; i++) L(x + i, y, x + i, y + d, `x${i}`);
    for (let j = 1; j < d; j++) L(x, y + j, x + w, y + j, `y${j}`);
    if (material === 'raised') {
      const rnd = seeded(seed);
      for (let i = 0; i < w; i++)
        for (let j = 0; j < d; j++) {
          if ((i + j * 2) % 4 !== 0 || rnd() > 0.4) continue;
          const tx = x + i;
          const ty = y + j;
          els.push(<polygon key={`v${i}-${j}`} points={pts([p(tx + 0.15, ty + 0.15), p(tx + 0.85, ty + 0.15), p(tx + 0.85, ty + 0.85), p(tx + 0.15, ty + 0.85)])} style={fill(pal.vent)} />);
          for (let a = 0; a < 3; a++)
            for (let c = 0; c < 3; c++) {
              const cx = tx + 0.3 + a * 0.2;
              const cy = ty + 0.3 + c * 0.2;
              els.push(<polygon key={`vd${i}-${j}-${a}${c}`} points={pts([p(cx - 0.06, cy - 0.06), p(cx + 0.06, cy - 0.06), p(cx + 0.06, cy + 0.06), p(cx - 0.06, cy + 0.06)])} style={fill(pal.ventDot)} />);
            }
        }
    }
  } else if (material === 'wood') {
    const rnd = seeded(seed);
    for (let j = 0.5; j < d; j += 0.5) L(x, y + j, x + w, y + j, `p${j}`);
    for (let j = 0; j < d; j += 0.5) {
      let xx = x + rnd() * 2;
      while (xx < x + w) {
        L(xx, y + j, xx, y + j + 0.5, `j${j}-${xx}`);
        xx += 2 + rnd() * 1.5;
      }
    }
  } else if (material === 'concrete') {
    for (let i = 4; i < w; i += 4) L(x + i, y, x + i, y + d, `x${i}`);
    for (let j = 4; j < d; j += 4) L(x, y + j, x + w, y + j, `y${j}`);
  } else if (material === 'carpet') {
    els.push(<polygon key="inset" points={pts([p(x + 0.3, y + 0.3), p(x + w - 0.3, y + 0.3), p(x + w - 0.3, y + d - 0.3), p(x + 0.3, y + d - 0.3)])} style={{ fill: 'none', stroke: line, strokeWidth: 1.5 }} />);
  }
  return <g>{els}</g>;
}

/** Text painted onto the floor plane. */
function FloorText({ x, y, text, size, color }: { x: number; y: number; text: string; size: number; color: string }) {
  const [ox, oy] = p(x, y);
  const C = Math.cos(Math.PI / 6);
  return (
    <text transform={`matrix(${C},0.5,${-C},0.5,${ox},${oy})`} style={{ fontSize: size * 16, fill: color, fontWeight: 700, letterSpacing: 0.5 }} className="floor-text">
      {text.toUpperCase()}
    </text>
  );
}

interface Seg {
  kind: 'wall';
  key: string;
  box: Box;
}

function partitionWalls(b: Building, x: number, y: number): Seg[] {
  const segs = new Map<string, Seg>();
  const add = (x1: number, y1: number, x2: number, y2: number) => {
    const horizontal = y1 === y2;
    const key = `${x1},${y1},${x2},${y2}`;
    if (segs.has(key)) return;
    const t = 0.14;
    const box: Box = horizontal ? { x: x + x1, y: y + y1 - t / 2, z: 0, w: x2 - x1, d: t, h: 1.1 } : { x: x + x1 - t / 2, y: y + y1, z: 0, w: t, d: y2 - y1, h: 1.1 };
    segs.set(key, { kind: 'wall', key, box });
  };
  for (const r of b.rooms) {
    if (r.y > 0) add(r.x, r.y, r.x + r.w, r.y);
    if (r.x > 0) add(r.x, r.y, r.x, r.y + r.d);
    if (r.y + r.d < b.d) add(r.x, r.y + r.d, r.x + r.w, r.y + r.d);
    if (r.x + r.w < b.w) add(r.x + r.w, r.y, r.x + r.w, r.y + r.d);
  }
  return [...segs.values()];
}

function Interior({ site, b, x, y, ctx, pal }: { site: Site; b: Building; x: number; y: number; ctx: BuildingCtx; pal: Palette }) {
  const t = 0.3;
  const unitCtx: UnitCtx = {
    base: [site.id, b.id],
    open: ctx.open,
    focusUnit: ctx.focusUnit,
    focusDevice: ctx.focusDevice,
    selected: ctx.selected,
    edit: ctx.edit,
  };
  const walls = partitionWalls(b, x, y);
  type Item = { kind: 'unit'; unit: Unit } | Seg;
  const items: Item[] = [...b.units.map((u) => ({ kind: 'unit' as const, unit: u })), ...walls];
  const sorted = depthSort(items, (it) => {
    if (it.kind === 'wall') return { x: it.box.x, y: it.box.y, w: it.box.w, d: it.box.d };
    const [w, d] = unitFootprint(it.unit);
    return { x: x + it.unit.pos.x, y: y + it.unit.pos.y, w, d };
  });
  // The focused unit is drawn last so faded neighbours never cover it.
  const fi = sorted.findIndex((it) => it.kind === 'unit' && it.unit.id === ctx.focusUnit);
  if (fi >= 0) sorted.push(sorted.splice(fi, 1)[0]);
  const backY: Box = { x, y: y - t, z: 0, w: b.w, d: t, h: WALL_H };
  const backX: Box = { x: x - t, y: y - t, z: 0, w: t, d: b.d + t, h: WALL_H };
  const wallC = pal.wallInner;
  return (
    <g className="interior">
      <Prism b={{ x: x - t, y: y - t, z: -0.35, w: b.w + t * 2, d: b.d + t * 2, h: 0.35 }} c={pal.slabSide} hide={{ top: true }} />
      <FloorArea x={x} y={y} w={b.w} d={b.d} material={b.floor} seed={b.id} pal={pal} />
      {b.rooms.map((r) => (
        <RoomFloor key={r.id} r={r} x={x} y={y} pal={pal} site={site} b={b} ctx={ctx} />
      ))}
      <Prism b={backX} c={shade(wallC, -0.05)} right={shade(wallC, -0.12)} top={pal.wallCut} />
      <Prism b={backY} c={wallC} top={pal.wallCut} />
      {Array.from({ length: Math.max(1, Math.floor(b.w / 5)) }, (_, i) => {
        const u = ((i + 0.5) * b.w) / Math.max(1, Math.floor(b.w / 5)) - 0.9;
        return <Win key={`wy${i}`} b={{ ...backY, d: t }} face="left" u={u} v={1.4} w={1.8} h={1.9} pal={pal} />;
      })}
      {Array.from({ length: Math.max(1, Math.floor(b.d / 5)) }, (_, i) => {
        const u = ((i + 0.5) * (b.d + t)) / Math.max(1, Math.floor(b.d / 5)) - 0.9;
        return <Win key={`wx${i}`} b={backX} face="right" u={u} v={1.4} w={1.8} h={1.9} pal={pal} />;
      })}
      {sorted.map((it) => {
        if (it.kind === 'wall') return <Prism key={it.key} b={it.box} c={wallC} top={pal.wallCut} />;
        const u = it.unit;
        const ox = x + u.pos.x;
        const oy = y + u.pos.y;
        return u.kind === 'rack' ? <RackView key={u.id} rack={u} ox={ox} oy={oy} ctx={unitCtx} /> : <MachineView key={u.id} m={u} ox={ox} oy={oy} ctx={unitCtx} />;
      })}
      <Prism b={{ x: x - t, y: y + b.d, z: 0, w: b.w + t, d: t, h: 0.55 }} c={wallC} top={pal.wallCut} />
      <Prism b={{ x: x + b.w, y: y - t, z: 0, w: t, d: b.d + t * 2, h: 0.55 }} c={wallC} top={pal.wallCut} />
    </g>
  );
}

function RoomFloor({ r, x, y, pal, site, b, ctx }: { r: Room; x: number; y: number; pal: Palette; site: Site; b: Building; ctx: BuildingCtx }) {
  const handlers = entityHandlers({ id: r.id, path: [site.id, b.id], active: ctx.open && ctx.edit && !ctx.focusUnit, onActivate: () => {} });
  const selected = ctx.edit && ctx.selected === r.id;
  return (
    <g className={`room ${selected ? 'selected' : ''}`} {...handlers}>
      <FloorArea x={x + r.x} y={y + r.y} w={r.w} d={r.d} material={r.floor} seed={r.id} pal={pal} />
      {selected && <polygon className="sel-outline" points={pts([p(x + r.x, y + r.y), p(x + r.x + r.w, y + r.y), p(x + r.x + r.w, y + r.y + r.d), p(x + r.x, y + r.y + r.d)])} />}
      <FloorText x={x + r.x + 0.5} y={y + r.y + 1.1} text={r.name} size={1.0} color={shade(floorColors(r.floor, pal).line, pal.dark ? 0.25 : -0.25)} />
    </g>
  );
}

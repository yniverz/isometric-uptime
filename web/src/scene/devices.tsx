import type { ReactNode } from 'react';
import type { DeviceType, Machine } from '../../../shared/model';
import type { RollupStatus } from '../../../shared/status';
import { faceMap, faceWidth, Frame, quad, seeded, type Box, type FaceName } from '../iso/iso';
import { shade, type Palette } from '../iso/palette';
import { FaceRect, Led, Prism, fill, useMonStatus, usePal } from './primitives';

/** Monitor ids of a machine's services and guests, in display order. */
export function childMonitorIds(m: Machine): (number | null | undefined)[] {
  return [...m.guests.map((g) => g.monitorId), ...m.services.map((s) => s.monitorId)].filter((x) => x != null);
}

function MonLed(props: { b: Box; face: FaceName; u: number; v: number; w?: number; h?: number; monitorId: number | null | undefined; halo?: boolean }) {
  const st = useMonStatus(props.monitorId);
  return <Led {...props} status={st} />;
}

/** Main status LED + a row of small service LEDs (right-aligned, growing left). */
function StatusLeds({ b, face, m, self, uRight, v, h, max = 6 }: { b: Box; face: FaceName; m: Machine; self: RollupStatus; uRight: number; v: number; h: number; max?: number }) {
  const ids = childMonitorIds(m).slice(0, max);
  const lw = Math.min(0.05, h * 0.9);
  const lh = Math.min(0.032, h * 0.45);
  const sw = lw * 0.55;
  return (
    <g>
      <Led b={b} face={face} u={uRight - lw} v={v} w={lw} h={lh} status={self} />
      {ids.map((id, i) => (
        <MonLed key={i} b={b} face={face} u={uRight - lw - 0.02 - (i + 1) * (sw + 0.012)} v={v + (lh - lh * 0.8) / 2} w={sw} h={lh * 0.8} monitorId={id} halo={false} />
      ))}
    </g>
  );
}

// ---------------------------------------------------------------------------
// Rack-mounted device faces
// ---------------------------------------------------------------------------

export function rackDeviceColor(type: DeviceType, pal: Palette): string {
  switch (type) {
    case 'switch':
      return pal.devSide;
    case 'firewall':
    case 'ups':
    case 'kvm':
      return pal.devDark;
    case 'patch-panel':
    case 'pdu':
      return pal.rackDark;
    case 'blank':
      return pal.rackFrame;
    case 'nas':
      return shade(pal.dev, -0.1);
    default:
      return pal.dev;
  }
}

export function RackDeviceArt({ m, b, face, self }: { m: Machine; b: Box; face: FaceName; self: RollupStatus }) {
  const pal = usePal();
  const f = faceMap(b, face);
  const W = faceWidth(b, face);
  const H = b.h;
  const q = (u0: number, v0: number, u1: number, v1: number) => quad(f, u0, v0, u1, v1);
  const rnd = seeded(m.id);
  const parts: ReactNode[] = [];
  const up = self === 'up';
  const ledV = H / 2 - Math.min(0.016, H * 0.22);
  const leds = (maxSvc = 6) => <StatusLeds key="leds" b={b} face={face} m={m} self={self} uRight={W - 0.05} v={ledV} h={H} max={maxSvc} />;

  switch (m.type) {
    case 'switch':
    case 'patch-panel': {
      const cols = m.type === 'patch-panel' ? 16 : 12;
      const rows = H > 0.1 ? 2 : m.type === 'switch' ? 2 : 1;
      const u0 = 0.06;
      const span = m.type === 'patch-panel' ? W - 0.12 : W * 0.62;
      const pw = (span / cols) * 0.72;
      const ph = Math.min(0.022, (H - 0.02) / rows / 2);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const u = u0 + (c * span) / cols;
          const v = H - 0.012 - (r + 1) * (H - 0.012) / (rows + 0.2);
          parts.push(<polygon key={`p${r}-${c}`} points={q(u, v, u + pw, v + ph)} style={fill(m.type === 'patch-panel' ? pal.devVent : pal.rackInner)} />);
          if (m.type === 'switch' && rnd() < 0.8)
            parts.push(
              <polygon
                key={`a${r}-${c}`}
                className={`blink ${up ? 'act' : 'idle'}`}
                style={{ animationDelay: `${(rnd() * 2).toFixed(2)}s`, animationDuration: `${(0.6 + rnd() * 1.6).toFixed(2)}s` }}
                points={q(u + pw * 0.1, v + ph * 1.12, u + pw * 0.5, v + ph * 1.4)}
              />,
            );
        }
      }
      if (m.type === 'switch') {
        parts.push(<polygon key="sfp" points={q(W * 0.7, H * 0.25, W * 0.76, H * 0.7)} style={fill(pal.rackInner)} />);
        parts.push(leds(3));
      } else {
        parts.push(<polygon key="strip" points={q(0.06, H - 0.012, W - 0.06, H - 0.006)} style={fill(pal.devLight)} />);
      }
      break;
    }
    case 'router':
    case 'firewall': {
      if (m.type === 'firewall') parts.push(<polygon key="red" points={q(0.03, 0.008, 0.055, H - 0.008)} style={fill(pal.cableRed)} />);
      for (let c = 0; c < 6; c++) {
        const u = 0.1 + c * 0.065;
        parts.push(<polygon key={c} points={q(u, H * 0.28, u + 0.045, H * 0.72)} style={fill(pal.rackInner)} />);
      }
      parts.push(<polygon key="disp" points={q(0.52, H * 0.3, 0.62, H * 0.7)} style={fill(pal.screenDark)} />);
      parts.push(leds(4));
      break;
    }
    case 'ups': {
      parts.push(<polygon key="scr" points={q(0.08, H * 0.28, 0.3, H * 0.78)} style={fill(pal.screen)} />);
      parts.push(<polygon key="scr2" points={q(0.1, H * 0.5, 0.2, H * 0.56)} style={fill(pal.screenDark)} />);
      for (let i = 0; i < 5; i++) {
        const u = 0.36 + i * 0.045;
        parts.push(<polygon key={`bat${i}`} className={up ? 'bat on' : 'bat'} points={q(u, H * 0.35, u + 0.03, H * 0.7)} />);
      }
      for (let i = 0; i < 6; i++) parts.push(<polygon key={`v${i}`} points={q(0.62 + i * 0.03, H * 0.15, 0.635 + i * 0.03, H * 0.85)} style={fill(pal.devVent)} />);
      parts.push(leds(0));
      break;
    }
    case 'nas': {
      const n = Math.max(4, Math.round(m.name.length % 2 ? 6 : 8));
      const span = W * 0.72;
      for (let i = 0; i < n; i++) {
        const u = 0.05 + (i * span) / n;
        const w = (span / n) * 0.84;
        parts.push(<polygon key={`s${i}`} points={q(u, H * 0.1, u + w, H * 0.9)} style={fill(pal.dev)} />);
        parts.push(<polygon key={`h${i}`} points={q(u + w * 0.15, H * 0.2, u + w * 0.85, H * 0.3)} style={fill(pal.devVent)} />);
        parts.push(
          <polygon
            key={`l${i}`}
            className={`blink ${up ? 'act' : 'idle'}`}
            style={{ animationDelay: `${(rnd() * 3).toFixed(2)}s`, animationDuration: `${(1.2 + rnd() * 2).toFixed(2)}s` }}
            points={q(u + w * 0.35, H * 0.72, u + w * 0.65, H * 0.8)}
          />,
        );
      }
      parts.push(leds(3));
      break;
    }
    case 'pdu': {
      for (let i = 0; i < 8; i++) {
        const u = 0.08 + i * 0.07;
        parts.push(<polygon key={i} points={q(u, H * 0.25, u + 0.045, H * 0.75)} style={fill(pal.devVent)} />);
      }
      parts.push(<polygon key="disp" points={q(0.66, H * 0.28, 0.74, H * 0.72)} style={fill('#40161B')} />);
      parts.push(<polygon key="num" points={q(0.675, H * 0.42, 0.725, H * 0.58)} style={fill(pal.cableRed)} />);
      parts.push(leds(0));
      break;
    }
    case 'kvm':
      parts.push(<polygon key="handle" points={q(0.3, H * 0.4, W - 0.3, H * 0.6)} style={fill(pal.devVent)} />);
      parts.push(<polygon key="ear" points={q(0.04, H * 0.2, 0.1, H * 0.8)} style={fill(pal.devSide)} />);
      break;
    case 'blank':
      parts.push(<polygon key="s1" points={q(0.03, H / 2 - 0.006, 0.045, H / 2 + 0.006)} style={fill(pal.devVent)} />);
      parts.push(<polygon key="s2" points={q(W - 0.045, H / 2 - 0.006, W - 0.03, H / 2 + 0.006)} style={fill(pal.devVent)} />);
      break;
    case 'mini-pc':
    case 'sbc': {
      parts.push(<polygon key="tray" points={q(0.02, 0, W - 0.02, H * 0.25)} style={fill(pal.rackDark)} />);
      const c = m.type === 'sbc' ? pal.pcb : pal.devSilver;
      parts.push(<polygon key="box" points={q(0.12, H * 0.25, 0.42, H * 0.85)} style={fill(c)} />);
      parts.push(<polygon key="box2" points={q(0.48, H * 0.25, 0.78, H * 0.85)} style={fill(c)} />);
      parts.push(leds(3));
      break;
    }
    default: {
      // Servers (and anything else that ends up in a rack)
      const size = Math.max(1, Math.round(H / 0.074));
      if (size <= 1) {
        for (let i = 0; i < 7; i++) {
          const u = 0.06 + i * 0.06;
          parts.push(<polygon key={i} points={q(u, H * 0.22, u + 0.04, H * 0.78)} style={fill(pal.devVent)} />);
        }
        parts.push(<polygon key="tag" points={q(0.5, H * 0.35, 0.6, H * 0.65)} style={fill(pal.devLight)} />);
      } else {
        const bays = size >= 4 ? 12 : 8;
        const rows = size >= 4 ? 2 : 1;
        const span = W * 0.55;
        for (let r = 0; r < rows; r++) {
          const v0 = H * (0.1 + (r * 0.8) / rows);
          const v1 = H * (0.1 + ((r + 1) * 0.8) / rows) - H * 0.04;
          for (let i = 0; i < bays; i++) {
            const u = 0.05 + (i * span) / bays;
            const w = (span / bays) * 0.72;
            parts.push(<polygon key={`b${r}-${i}`} points={q(u, v0, u + w, v1)} style={fill(pal.devVent)} />);
            parts.push(
              <polygon
                key={`bl${r}-${i}`}
                className={`blink ${up ? 'act soft' : 'idle'}`}
                style={{ animationDelay: `${(rnd() * 3).toFixed(2)}s`, animationDuration: `${(1.5 + rnd() * 2.5).toFixed(2)}s` }}
                points={q(u + w * 0.2, v1 - (v1 - v0) * 0.22, u + w * 0.8, v1 - (v1 - v0) * 0.08)}
              />,
            );
          }
        }
        for (let i = 0; i < 5; i++) {
          const v = H * (0.22 + i * 0.13);
          parts.push(<polygon key={`g${i}`} points={q(W * 0.64, v, W * 0.76, v + H * 0.06)} style={fill(pal.devVent)} />);
        }
      }
      parts.push(leds(6));
    }
  }
  return <g className="dev-art">{parts}</g>;
}

// ---------------------------------------------------------------------------
// Standalone machines
// ---------------------------------------------------------------------------

interface ArtProps {
  m: Machine;
  fr: Frame;
  self: RollupStatus;
}

function Screen({ b, face, u0, v0, u1, v1, self }: { b: Box; face: FaceName; u0: number; v0: number; u1: number; v1: number; self: RollupStatus }) {
  const f = faceMap(b, face);
  const w = u1 - u0;
  const h = v1 - v0;
  return (
    <g className={`screen st-${self}`}>
      <polygon className="scr" points={quad(f, u0, v0, u1, v1)} />
      <polygon className="scr-line" points={quad(f, u0 + w * 0.08, v1 - h * 0.18, u0 + w * 0.6, v1 - h * 0.1)} />
      <polygon className="scr-line" points={quad(f, u0 + w * 0.08, v1 - h * 0.34, u0 + w * 0.45, v1 - h * 0.27)} />
      <polygon className="scr-block" points={quad(f, u0 + w * 0.08, v0 + h * 0.12, u0 + w * 0.48, v0 + h * 0.55)} />
      <polygon className="scr-block b2" points={quad(f, u0 + w * 0.55, v0 + h * 0.12, u0 + w * 0.92, v0 + h * 0.55)} />
      <polygon className="scr-alert" points={quad(f, u0 + w * 0.42, v0 + h * 0.3, u0 + w * 0.58, v0 + h * 0.7)} />
    </g>
  );
}

/** A small table the device sits on. */
function Table({ fr, a, b, wa, db, h, pal }: { fr: Frame; a: number; b: number; wa: number; db: number; h: number; pal: Palette }) {
  const leg = 0.08;
  const t = 0.08;
  return (
    <g>
      <Prism b={fr.box(a + 0.04, b + 0.04, 0, leg, leg, h - t)} c={pal.furnitureDark} />
      <Prism b={fr.box(a + wa - leg - 0.04, b + 0.04, 0, leg, leg, h - t)} c={pal.furnitureDark} />
      <Prism b={fr.box(a + 0.04, b + db - leg - 0.04, 0, leg, leg, h - t)} c={pal.furnitureDark} />
      <Prism b={fr.box(a + wa - leg - 0.04, b + db - leg - 0.04, 0, leg, leg, h - t)} c={pal.furnitureDark} />
      <Prism b={fr.box(a, b, h - t, wa, db, t)} c={pal.furniture} />
    </g>
  );
}

function ledOn(b: Box, face: FaceName, uFromRight: number, v: number, self: RollupStatus, m: Machine, h = 0.08) {
  const W = faceWidth(b, face);
  return <StatusLeds b={b} face={face} m={m} self={self} uRight={W - uFromRight} v={v} h={h} max={4} />;
}

export function MachineArt({ m, fr, self }: ArtProps) {
  const pal = usePal();
  const F = fr.front;
  const kind = standaloneKind(m.type);
  switch (kind) {
    case 'desktop': {
      const top = 1.2;
      const tower = fr.box(2.15, 0.35, 0, 0.5, 1.1, 1.0);
      const monitor = fr.box(0.7, 0.42, top + 0.3, 1.6, 0.1, 0.95);
      return (
        <g>
          <Prism b={fr.box(0.15, 0.25, 0, 0.1, 0.1, top - 0.1)} c={pal.furnitureDark} />
          <Prism b={fr.box(2.75, 0.25, 0, 0.1, 0.1, top - 0.1)} c={pal.furnitureDark} />
          <Prism b={tower} c={pal.devDark} />
          <FaceRect b={tower} face={F} u0={0.08} v0={0.55} u1={0.42} v1={0.9} c={pal.devVent} />
          <Led b={tower} face={F} u={0.2} v={0.35} w={0.1} h={0.06} status={self} />
          <Prism b={fr.box(0.15, 1.55, 0, 0.1, 0.1, top - 0.1)} c={pal.furnitureDark} />
          <Prism b={fr.box(2.75, 1.55, 0, 0.1, 0.1, top - 0.1)} c={pal.furnitureDark} />
          <Prism b={fr.box(0.1, 0.2, top - 0.1, 2.8, 1.5, 0.1)} c={pal.furniture} />
          <Prism b={fr.box(1.35, 0.4, top, 0.3, 0.3, 0.04)} c={pal.devDark} />
          <Prism b={fr.box(1.45, 0.48, top, 0.1, 0.06, 0.35)} c={pal.devDark} />
          <Prism b={monitor} c={pal.rackDark} />
          <Screen b={monitor} face={F} u0={0.06} v0={0.06} u1={1.54} v1={0.89} self={self} />
          <Prism b={fr.box(0.95, 0.95, top, 1.05, 0.32, 0.04)} c={pal.plastic} />
          <Prism b={fr.box(2.2, 1.0, top, 0.14, 0.2, 0.05)} c={pal.plastic} />
          <Prism b={fr.box(1.2, 1.75, 0.75, 0.6, 0.5, 0.1)} c={pal.devSide} />
          <Prism b={fr.box(1.2, 2.15, 0.85, 0.6, 0.1, 0.7)} c={pal.devSide} />
        </g>
      );
    }
    case 'laptop': {
      const top = 1.1;
      const screen = fr.box(0.55, 0.72, top + 0.05, 0.9, 0.05, 0.6);
      return (
        <g>
          <Table fr={fr} a={0.2} b={0.3} wa={1.6} db={1.4} h={top} pal={pal} />
          <Prism b={screen} c={pal.devSilver} />
          <Screen b={screen} face={F} u0={0.05} v0={0.05} u1={0.85} v1={0.55} self={self} />
          <Prism b={fr.box(0.55, 0.77, top, 0.9, 0.6, 0.05)} c={pal.devSilver} />
          <FaceRect b={fr.box(0.55, 0.77, top, 0.9, 0.6, 0.05)} face="top" u0={0.1} v0={0.1} u1={0.5} v1={0.3} c={shade(pal.devSilver, -0.15)} />
          <Led b={fr.box(0.55, 0.77, top, 0.9, 0.6, 0.05)} face={F} u={0.75} v={0.01} w={0.08} h={0.03} status={self} />
        </g>
      );
    }
    case 'tabletop': {
      const top = 0.9;
      const parts: ReactNode[] = [<Table key="t" fr={fr} a={0.15} b={0.15} wa={1.7} db={0.7} h={top} pal={pal} />];
      if (m.type === 'modem') {
        const box = fr.box(0.8, 0.3, top, 0.4, 0.3, 0.65);
        parts.push(<Prism key="b" b={box} c={pal.plastic} />);
        parts.push(<g key="l">{ledOn(box, F, 0.12, 0.45, self, m, 0.1)}</g>);
      } else if (m.type === 'router' || m.type === 'firewall' || m.type === 'switch') {
        const wide = m.type === 'switch';
        const box = fr.box(wide ? 0.3 : 0.5, 0.3, top, wide ? 1.4 : 1.0, 0.4, 0.12);
        if (m.type === 'router') {
          parts.push(<Prism key="a1" b={fr.box(0.6, 0.32, top + 0.1, 0.04, 0.04, 0.5)} c={pal.devDark} />);
          parts.push(<Prism key="a2" b={fr.box(1.35, 0.32, top + 0.1, 0.04, 0.04, 0.5)} c={pal.devDark} />);
        }
        parts.push(<Prism key="b" b={box} c={m.type === 'router' ? pal.plastic : pal.devDark} />);
        const W = wide ? 1.4 : 1.0;
        for (let i = 0; i < (wide ? 8 : 4); i++) parts.push(<FaceRect key={`p${i}`} b={box} face={F} u0={0.08 + i * 0.1} v0={0.03} u1={0.15 + i * 0.1} v1={0.08} c={pal.rackInner} />);
        if (m.type === 'firewall') parts.push(<FaceRect key="r" b={box} face={F} u0={0.01} v0={0.01} u1={0.04} v1={0.11} c={pal.cableRed} />);
        parts.push(<Led key="l" b={box} face={F} u={W - 0.14} v={0.035} w={0.08} h={0.045} status={self} />);
      } else if (m.type === 'sbc') {
        const board = fr.box(0.6, 0.3, top, 0.8, 0.4, 0.04);
        parts.push(<Prism key="b" b={board} c={pal.pcb} />);
        parts.push(<Prism key="c1" b={fr.box(0.7, 0.35, top + 0.04, 0.2, 0.2, 0.05)} c={pal.devDark} />);
        parts.push(<Prism key="c2" b={fr.box(1.05, 0.35, top + 0.04, 0.3, 0.25, 0.1)} c={pal.devSilver} />);
        parts.push(<Led key="l" b={board} face={F} u={0.1} v={0.0} w={0.08} h={0.04} status={self} />);
      } else if (m.type === 'smart-hub') {
        const box = fr.box(0.75, 0.3, top, 0.5, 0.4, 0.14);
        parts.push(<Prism key="b" b={box} c={pal.plastic} />);
        parts.push(<g key="ring" className={`led st-${self}`}><polygon className="led-core" points={quad(faceMap(box, 'top'), 0.12, 0.1, 0.38, 0.3)} /></g>);
      } else if (m.type === 'phone') {
        const tab = fr.box(0.7, 0.45, top + 0.05, 0.6, 0.05, 0.42);
        parts.push(<Prism key="st" b={fr.box(0.85, 0.35, top, 0.3, 0.25, 0.05)} c={pal.devDark} />);
        parts.push(<Prism key="b" b={tab} c={pal.rackDark} />);
        parts.push(<Screen key="s" b={tab} face={F} u0={0.04} v0={0.04} u1={0.56} v1={0.38} self={self} />);
      } else {
        // mini-pc & generic
        const box = fr.box(0.6, 0.25, top, 0.8, 0.5, 0.16);
        parts.push(<Prism key="b" b={box} c={m.type === 'mini-pc' ? pal.devSilver : pal.dev} />);
        parts.push(<FaceRect key="v" b={box} face={F} u0={0.08} v0={0.05} u1={0.4} v1={0.1} c={shade(pal.devSilver, -0.25)} />);
        parts.push(<Led key="l" b={box} face={F} u={0.62} v={0.05} w={0.08} h={0.05} status={self} />);
      }
      return <g>{parts}</g>;
    }
    case 'access-point': {
      const disc = fr.box(0.2, 0.2, 2.4, 0.6, 0.6, 0.1);
      return (
        <g>
          <Prism b={fr.box(0.3, 0.3, 0, 0.4, 0.4, 0.06)} c={pal.devDark} />
          <Prism b={fr.box(0.46, 0.46, 0.06, 0.08, 0.08, 2.34)} c={pal.devSilver} />
          <Prism b={disc} c={pal.plastic} />
          <g className={`led st-${self}`}>
            <polygon className="led-halo" points={quad(faceMap(disc, 'top'), 0.05, 0.05, 0.55, 0.55)} />
            <polygon className="led-core" points={quad(faceMap(disc, 'top'), 0.2, 0.2, 0.4, 0.4)} />
          </g>
          <g className={`wifi st-${self}`}>
            {[0.5, 0.85, 1.2].map((r, i) => {
              const c = disc;
              const [cx, cy] = fr.pt(0.5, 0.5, c.z + 0.35);
              return <path key={i} className="wifi-arc" style={{ animationDelay: `${i * 0.3}s` }} d={`M ${cx - r * 9} ${cy - r * 2} Q ${cx} ${cy - r * 9} ${cx + r * 9} ${cy - r * 2}`} />;
            })}
          </g>
        </g>
      );
    }
    case 'camera': {
      const body = fr.box(0.35, 0.35, 2.15, 0.3, 0.6, 0.25);
      return (
        <g>
          <Prism b={fr.box(0.35, 0.35, 0, 0.3, 0.3, 0.05)} c={pal.devDark} />
          <Prism b={fr.box(0.46, 0.46, 0.05, 0.08, 0.08, 2.1)} c={pal.devSilver} />
          <Prism b={body} c={pal.plastic} />
          <FaceRect b={body} face={F} u0={0.08} v0={0.05} u1={0.22} v1={0.2} c={pal.rackInner} />
          <Led b={body} face={F} u={0.23} v={0.16} w={0.05} h={0.05} status={self} />
        </g>
      );
    }
    case 'printer': {
      const box = fr.box(0.15, 0.1, 0, 1.7, 0.8, 0.72);
      return (
        <g>
          <Prism b={box} c={pal.plastic} />
          <FaceRect b={box} face="top" u0={fr.facing === 'left' ? 0.3 : 0.2} v0={fr.facing === 'left' ? 0.15 : 0.3} u1={fr.facing === 'left' ? 1.4 : 0.6} v1={fr.facing === 'left' ? 0.55 : 1.4} c={shade(pal.plastic, -0.18)} />
          <FaceRect b={box} face={F} u0={0.2} v0={0.12} u1={1.5} v1={0.28} c={shade(pal.plastic, -0.12)} />
          <FaceRect b={box} face={F} u0={1.15} v0={0.45} u1={1.45} v1={0.62} c={pal.screen} />
          <Led b={box} face={F} u={1.52} v={0.5} w={0.07} h={0.06} status={self} />
        </g>
      );
    }
    case 'tv': {
      const tv = fr.box(0.2, 0.45, 0.72, 2.6, 0.08, 1.5);
      return (
        <g>
          <Prism b={fr.box(0.1, 0.2, 0, 2.8, 0.65, 0.55)} c={pal.furniture} />
          <FaceRect b={fr.box(0.1, 0.2, 0, 2.8, 0.65, 0.55)} face={F} u0={1.42} v0={0.05} u1={1.44} v1={0.5} c={pal.furnitureDark} />
          <Prism b={fr.box(1.3, 0.35, 0.55, 0.4, 0.3, 0.05)} c={pal.devDark} />
          <Prism b={fr.box(1.45, 0.47, 0.6, 0.1, 0.05, 0.2)} c={pal.devDark} />
          <Prism b={tv} c={pal.rackInner} />
          <Screen b={tv} face={F} u0={0.05} v0={0.06} u1={2.55} v1={1.45} self={self} />
          <Led b={tv} face={F} u={1.27} v={0.01} w={0.06} h={0.03} status={self} />
        </g>
      );
    }
    case 'nas': {
      const box = fr.box(0.2, 0.15, 0, 0.6, 0.7, 0.9);
      return (
        <g>
          <Prism b={box} c={pal.devDark} />
          {[0, 1, 2, 3].map((i) => (
            <FaceRect key={i} b={box} face={F} u0={0.07 + (i % 2) * 0.24} v0={0.12 + Math.floor(i / 2) * 0.33} u1={0.28 + (i % 2) * 0.24} v1={0.4 + Math.floor(i / 2) * 0.33} c={pal.devVent} />
          ))}
          <Led b={box} face={F} u={0.1} v={0.8} w={0.08} h={0.04} status={self} />
        </g>
      );
    }
    case 'ups': {
      const box = fr.box(0.25, 0.1, 0, 0.5, 0.8, 1.05);
      return (
        <g>
          <Prism b={box} c={pal.rackDark} />
          <FaceRect b={box} face={F} u0={0.1} v0={0.72} u1={0.4} v1={0.92} c={pal.screen} />
          {[0, 1, 2, 3].map((i) => (
            <FaceRect key={i} b={box} face={F} u0={0.1 + i * 0.075} v0={0.55} u1={0.15 + i * 0.075} v1={0.64} className={self === 'up' ? 'bat on' : 'bat'} />
          ))}
          <Led b={box} face={F} u={0.2} v={0.38} w={0.1} h={0.06} status={self} />
        </g>
      );
    }
    case 'iot': {
      const box = fr.box(0.25, 0.3, 0.9, 0.5, 0.4, 0.5);
      return (
        <g>
          <Prism b={fr.box(0.35, 0.35, 0, 0.3, 0.3, 0.05)} c={pal.devDark} />
          <Prism b={fr.box(0.46, 0.46, 0.05, 0.08, 0.08, 0.85)} c={pal.devSilver} />
          <Prism b={box} c={pal.plastic} />
          <FaceRect b={box} face={F} u0={0.08} v0={0.22} u1={0.32} v1={0.42} c={pal.screenDark} />
          <Led b={box} face={F} u={0.36} v={0.3} w={0.07} h={0.06} status={self} />
        </g>
      );
    }
    default: {
      // tower server: roughly 22 × 55 × 45 cm, the size of a large desktop tower
      const box = fr.box(0.3, 0.05, 0.04, 0.4, 0.9, 0.78);
      return (
        <g>
          {/* feet */}
          <Prism b={fr.box(0.32, 0.1, 0, 0.36, 0.08, 0.04)} c={pal.rackDark} />
          <Prism b={fr.box(0.32, 0.82, 0, 0.36, 0.08, 0.04)} c={pal.rackDark} />
          <Prism b={box} c={pal.rackFrame} />
          {/* two drive bays at the top */}
          <FaceRect b={box} face={F} u0={0.05} v0={0.64} u1={0.35} v1={0.7} c={pal.devVent} />
          <FaceRect b={box} face={F} u0={0.05} v0={0.56} u1={0.35} v1={0.62} c={pal.devVent} />
          {/* front grille */}
          {[0, 1, 2, 3, 4].map((i) => (
            <FaceRect key={`g${i}`} b={box} face={F} u0={0.07} v0={0.08 + i * 0.07} u1={0.33} v1={0.11 + i * 0.07} c={pal.rackDark} />
          ))}
          {ledOn(box, F, 0.04, 0.47, self, m, 0.05)}
        </g>
      );
    }
  }
}

type StandaloneKind = 'desktop' | 'laptop' | 'tabletop' | 'access-point' | 'camera' | 'printer' | 'tv' | 'nas' | 'ups' | 'iot' | 'tower';

export function standaloneKind(t: DeviceType): StandaloneKind {
  switch (t) {
    case 'desktop':
    case 'laptop':
    case 'access-point':
    case 'camera':
    case 'printer':
    case 'tv':
    case 'nas':
    case 'ups':
    case 'iot':
      return t;
    case 'mini-pc':
    case 'sbc':
    case 'modem':
    case 'router':
    case 'firewall':
    case 'switch':
    case 'smart-hub':
    case 'phone':
      return 'tabletop';
    case 'pdu':
    case 'kvm':
    case 'blank':
    case 'patch-panel':
      return 'iot';
    default:
      return 'tower';
  }
}

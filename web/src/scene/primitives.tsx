import { createContext, useContext, type CSSProperties, type ReactNode } from 'react';
import type { Machine } from '../../../shared/model';
import type { RollupStatus, Status } from '../../../shared/status';
import { faceMap, leftFace, p, pts, quad, rightFace, topFace, type Box, type FaceName, type P2 } from '../iso/iso';
import { LIGHT, shade, type Palette } from '../iso/palette';
import { useStore } from '../state/store';
import { machineHealth, monStatus } from '../state/health';

export const PalCtx = createContext<Palette>(LIGHT);
export const usePal = () => useContext(PalCtx);

/** 1 / camera scale at the current focus; used to keep labels a constant screen size. */
export const LabelScaleCtx = createContext(1);
export const useLabelScale = () => useContext(LabelScaleCtx);

export function fill(c: string): CSSProperties {
  return { fill: c, stroke: c };
}

export function Poly({ points, c, className, style, ...rest }: { points: P2[] | string; c?: string; className?: string; style?: CSSProperties } & React.SVGProps<SVGPolygonElement>) {
  return <polygon points={typeof points === 'string' ? points : pts(points)} className={className} style={c ? { ...fill(c), ...style } : style} {...rest} />;
}

interface PrismProps {
  b: Box;
  c: string;
  top?: string;
  left?: string;
  right?: string;
  /** Skip faces (e.g. when covered anyway). */
  hide?: Partial<Record<FaceName, boolean>>;
  className?: string;
  children?: ReactNode;
}

/** A shaded axis-aligned box. Left (+y) face uses the base colour, right (+x) is darker, top is lighter. */
export function Prism({ b, c, top, left, right, hide, className, children }: PrismProps) {
  const t = top ?? shade(c, 0.2);
  const l = left ?? c;
  const r = right ?? shade(c, -0.26);
  return (
    <g className={className}>
      {!hide?.left && <polygon points={pts(leftFace(b))} style={fill(l)} />}
      {!hide?.right && <polygon points={pts(rightFace(b))} style={fill(r)} />}
      {!hide?.top && <polygon points={pts(topFace(b))} style={fill(t)} />}
      {children}
    </g>
  );
}

/** Face-local rectangle. */
export function FaceRect({ b, face, u0, v0, u1, v1, c, className, style }: { b: Box; face: FaceName; u0: number; v0: number; u1: number; v1: number; c?: string; className?: string; style?: CSSProperties }) {
  return <polygon points={quad(faceMap(b, face), u0, v0, u1, v1)} className={className} style={c ? { ...fill(c), ...style } : style} />;
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export function useMonStatus(id: number | null | undefined): Status {
  return useStore((s) => monStatus(s.monitors, id));
}

export function useMachineStatus(m: Machine): { self: RollupStatus; rollup: RollupStatus } {
  const self = useStore((s) => machineHealth(m, s.monitors).self);
  const rollup = useStore((s) => machineHealth(m, s.monitors).rollup);
  return { self, rollup };
}

/** A face-mounted LED with a soft halo. */
export function Led({ b, face, u, v, w = 0.045, h = 0.03, status, halo = true }: { b: Box; face: FaceName; u: number; v: number; w?: number; h?: number; status: RollupStatus; halo?: boolean }) {
  const f = faceMap(b, face);
  return (
    <g className={`led st-${status}`}>
      {halo && <polygon className="led-halo" points={quad(f, u - w * 0.9, v - h * 0.9, u + w * 1.9, v + h * 1.9)} />}
      <polygon className="led-core" points={quad(f, u, v, u + w, v + h)} />
    </g>
  );
}

/** Floating status pin (billboard) above something. */
export function Pin({ x, y, z, status, r = 0.35, className }: { x: number; y: number; z: number; status: RollupStatus; r?: number; className?: string }) {
  const [sx, sy] = p(x, y, z);
  const R = r * 16;
  const alarm = status === 'down' || status === 'degraded';
  return (
    <g className={`pin st-${status} ${className ?? ''}`} transform={`translate(${sx.toFixed(1)},${sy.toFixed(1)})`}>
      <line className="pin-stem" x1={0} y1={0} x2={0} y2={R * 2.4} />
      {alarm && <circle className="pin-ring" r={R * 1.2} />}
      <circle className="pin-dot" r={R} />
      <circle className="pin-shine" r={R * 0.38} cx={-R * 0.3} cy={-R * 0.3} />
    </g>
  );
}

let ctx2d: CanvasRenderingContext2D | null = null;
const widthCache = new Map<string, number>();
/** Width of `text` at font-size 1 (multiply by the size you render at). */
export function textWidth(text: string, weight = 600): number {
  const key = `${weight}|${text}`;
  const hit = widthCache.get(key);
  if (hit != null) return hit;
  if (!ctx2d) ctx2d = document.createElement('canvas').getContext('2d');
  let w = text.length * 0.56;
  if (ctx2d) {
    ctx2d.font = `${weight} 100px Inter, ui-sans-serif, system-ui, sans-serif`;
    w = ctx2d.measureText(text).width / 100;
  }
  if (document.fonts?.status === 'loaded') widthCache.set(key, w);
  return w;
}

/** Screen-aligned label that keeps a constant on-screen size for the current focus. */
export function Billboard({
  x,
  y,
  z,
  text,
  sub,
  status,
  size = 12,
  anchor = 'middle',
  className,
  dy = 0,
}: {
  x: number;
  y: number;
  z: number;
  text: string;
  sub?: string;
  status?: RollupStatus;
  size?: number;
  anchor?: 'start' | 'middle' | 'end';
  className?: string;
  dy?: number;
}) {
  const pal = usePal();
  const ls = useLabelScale();
  const fs = size * ls;
  const [sx, sy] = p(x, y, z);
  const padX = fs * 0.7;
  const dot = status ? fs * 0.9 : 0;
  const tw = Math.max(textWidth(text, 600), sub ? textWidth(sub, 400) * 0.82 : 0) * fs;
  const w = tw + padX * 2 + dot;
  const h = sub ? fs * 2.6 : fs * 1.75;
  const x0 = anchor === 'middle' ? -w / 2 : anchor === 'end' ? -w : 0;
  return (
    <g className={`billboard ${className ?? ''}`} transform={`translate(${sx.toFixed(1)},${(sy + dy * ls).toFixed(1)})`}>
      <rect x={x0} y={-h} width={w} height={h} rx={h / 2.4} style={{ fill: pal.labelBg, stroke: pal.labelStroke, strokeWidth: ls }} />
      {status && <circle className={`bb-dot st-${status}`} cx={x0 + padX + fs * 0.25} cy={sub ? -h + fs * 1.05 : -h / 2} r={fs * 0.3} />}
      <text x={x0 + padX + dot} y={sub ? -h + fs * 1.35 : -h / 2 + fs * 0.36} style={{ fontSize: fs, fill: pal.text, fontWeight: 600 }}>
        {text}
      </text>
      {sub && (
        <text x={x0 + padX + dot} y={-fs * 0.55} style={{ fontSize: fs * 0.82, fill: pal.textMuted }}>
          {sub}
        </text>
      )}
    </g>
  );
}

/** Invisible, non-moving hit area so hover animations don't cause jitter. */
export function HitBox({ b }: { b: Box }) {
  return (
    <g className="hit">
      <polygon points={pts(leftFace(b))} />
      <polygon points={pts(rightFace(b))} />
      <polygon points={pts(topFace(b))} />
    </g>
  );
}

/** Soft elliptical shadow on the ground under a box. */
export function GroundShadow({ b, spread = 0.25, opacity = 0.18 }: { b: Box; spread?: number; opacity?: number }) {
  const pal = usePal();
  const pts4 = [p(b.x - spread, b.y - spread, b.z), p(b.x + b.w + spread, b.y - spread, b.z), p(b.x + b.w + spread, b.y + b.d + spread, b.z), p(b.x - spread, b.y + b.d + spread, b.z)];
  return <polygon className="gshadow" points={pts(pts4)} style={{ fill: pal.shadow, opacity: opacity * 0.75 }} />;
}

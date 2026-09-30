/**
 * Isometric projection helpers.
 *
 * World axes: x runs to the screen's lower right, y to the lower left, z up.
 * Units are tiles (see shared/model.ts). True isometric: every axis projects
 * to the same length, so the camera looks along (-1,-1,-1).
 *
 * Visible faces of an axis-aligned box are the top, the +y face ("left",
 * facing down-left) and the +x face ("right", facing down-right).
 */

export const T = 16; // pixels per tile at camera scale 1
const C = Math.cos(Math.PI / 6);
const S = 0.5;

export type P2 = [number, number];

export function p(x: number, y: number, z = 0): P2 {
  return [(x - y) * C * T, (x + y) * S * T - z * T];
}

export function pts(list: P2[]): string {
  let s = '';
  for (let i = 0; i < list.length; i++) {
    const q = list[i];
    s += (i ? ' ' : '') + q[0].toFixed(2) + ',' + q[1].toFixed(2);
  }
  return s;
}

/** Screen -> world on the plane z. */
export function unproject(sx: number, sy: number, z = 0): { x: number; y: number } {
  const a = sx / (C * T);
  const b = (sy + z * T) / (S * T);
  return { x: (a + b) / 2, y: (b - a) / 2 };
}

export interface Box {
  x: number;
  y: number;
  z: number;
  w: number; // along x
  d: number; // along y
  h: number; // along z
}

export function topFace(b: Box): P2[] {
  const z = b.z + b.h;
  return [p(b.x, b.y, z), p(b.x + b.w, b.y, z), p(b.x + b.w, b.y + b.d, z), p(b.x, b.y + b.d, z)];
}

/** +y face */
export function leftFace(b: Box): P2[] {
  const y = b.y + b.d;
  return [p(b.x, y, b.z), p(b.x + b.w, y, b.z), p(b.x + b.w, y, b.z + b.h), p(b.x, y, b.z + b.h)];
}

/** +x face */
export function rightFace(b: Box): P2[] {
  const x = b.x + b.w;
  return [p(x, b.y + b.d, b.z), p(x, b.y, b.z), p(x, b.y, b.z + b.h), p(x, b.y + b.d, b.z + b.h)];
}

export type FaceName = 'left' | 'right' | 'top';

/**
 * Returns a mapper from face-local coordinates (u to the screen-right, v up)
 * to screen points. For the top face, u runs along x and v along y.
 */
export function faceMap(b: Box, face: FaceName): (u: number, v: number) => P2 {
  if (face === 'left') return (u, v) => p(b.x + u, b.y + b.d, b.z + v);
  if (face === 'right') return (u, v) => p(b.x + b.w, b.y + b.d - u, b.z + v);
  return (u, v) => p(b.x + u, b.y + v, b.z + b.h);
}

export function faceWidth(b: Box, face: FaceName): number {
  return face === 'right' ? b.d : b.w;
}

export function quad(f: (u: number, v: number) => P2, u0: number, v0: number, u1: number, v1: number): string {
  return pts([f(u0, v0), f(u1, v0), f(u1, v1), f(u0, v1)]);
}

/** Screen-space bounding box of a set of world boxes. */
export function screenBounds(boxes: Box[]): { x: number; y: number; w: number; h: number } {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const b of boxes) {
    for (const [cx, cy, cz] of [
      [b.x, b.y, b.z],
      [b.x + b.w, b.y, b.z],
      [b.x, b.y + b.d, b.z],
      [b.x + b.w, b.y + b.d, b.z],
      [b.x, b.y, b.z + b.h],
      [b.x + b.w, b.y, b.z + b.h],
      [b.x, b.y + b.d, b.z + b.h],
      [b.x + b.w, b.y + b.d, b.z + b.h],
    ]) {
      const [sx, sy] = p(cx, cy, cz);
      if (sx < minX) minX = sx;
      if (sy < minY) minY = sy;
      if (sx > maxX) maxX = sx;
      if (sy > maxY) maxY = sy;
    }
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/**
 * A local frame for drawing objects that can face either way.
 * Local a runs across the front (left->right as seen by the viewer),
 * local b runs from the back (0) to the front (D).
 */
export class Frame {
  constructor(
    public x0: number,
    public y0: number,
    public W: number,
    public D: number,
    public facing: 'left' | 'right',
  ) {}

  box(a: number, b: number, z: number, wa: number, db: number, h: number): Box {
    if (this.facing === 'left') return { x: this.x0 + a, y: this.y0 + b, z, w: wa, d: db, h };
    return { x: this.x0 + b, y: this.y0 + this.W - a - wa, z, w: db, d: wa, h };
  }

  /** The world face that is the local front. */
  get front(): 'left' | 'right' {
    return this.facing;
  }

  /** The visible local side face. */
  get side(): 'left' | 'right' {
    return this.facing === 'left' ? 'right' : 'left';
  }

  /** World point for local coords. */
  pt(a: number, b: number, z: number): P2 {
    if (this.facing === 'left') return p(this.x0 + a, this.y0 + b, z);
    return p(this.x0 + b, this.y0 + this.W - a, z);
  }

  /** Unit vector (screen) of the local "out of the front" direction for 1 tile. */
  outward(): P2 {
    const o = p(0, 0, 0);
    const q = this.facing === 'left' ? p(0, 1, 0) : p(1, 0, 0);
    return [q[0] - o[0], q[1] - o[1]];
  }
}

/** Deterministic PRNG from a string seed. */
export function seeded(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Painter's sort for non-overlapping axis-aligned footprints (back to front). */
export function depthSort<T>(items: T[], fp: (t: T) => { x: number; y: number; w: number; d: number }): T[] {
  const n = items.length;
  const f = items.map(fp);
  const behind = (a: number, b: number) => {
    const A = f[a],
      B = f[b];
    const e = 1e-6;
    const ax2 = A.x + A.w,
      ay2 = A.y + A.d,
      bx2 = B.x + B.w,
      by2 = B.y + B.d;
    if (ax2 <= B.x + e && !(by2 <= A.y + e)) return true;
    if (ay2 <= B.y + e && !(bx2 <= A.x + e)) return true;
    return false;
  };
  const order: number[] = [];
  const state = new Uint8Array(n); // 0 new, 1 visiting, 2 done
  // Stable fallback: pre-sort by footprint centre depth so cycles degrade gracefully.
  const idx = [...Array(n).keys()].sort((a, b) => f[a].x + f[a].w / 2 + f[a].y + f[a].d / 2 - (f[b].x + f[b].w / 2 + f[b].y + f[b].d / 2));
  const visit = (i: number) => {
    if (state[i]) return;
    state[i] = 1;
    for (const j of idx) if (j !== i && state[j] !== 2 && state[j] !== 1 && behind(j, i)) visit(j);
    state[i] = 2;
    order.push(i);
  };
  for (const i of idx) visit(i);
  return order.map((i) => items[i]);
}

/**
 * The camera is a plain object (not React state) that writes the transform of
 * the world <g> directly, so flying around never re-renders the scene.
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

type Listener = (s: number) => void;

const MIN_S = 0.04;
const MAX_S = 14;

function easeInOut(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

class Camera {
  x = 0;
  y = 0;
  s = 1;
  private g: SVGGElement | null = null;
  private svg: SVGSVGElement | null = null;
  private anim = 0;
  private settleTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<Listener>();
  /** Screen insets that are covered by UI (top bar, side panel, bottom sheet). */
  insets = { top: 64, right: 0, bottom: 0, left: 0 };

  attach(svg: SVGSVGElement, g: SVGGElement) {
    this.svg = svg;
    this.g = g;
    this.apply();
  }

  onSettle(fn: Listener) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private apply() {
    this.g?.setAttribute('transform', `translate(${this.x.toFixed(2)},${this.y.toFixed(2)}) scale(${this.s.toFixed(5)})`);
  }

  private moving = false;

  /** While the camera moves, decorative animations are paused (see .world.moving). */
  private startMoving() {
    if (this.settleTimer) clearTimeout(this.settleTimer);
    if (!this.moving) {
      this.moving = true;
      this.svg?.classList.add('moving');
    }
  }

  private settled() {
    if (this.settleTimer) clearTimeout(this.settleTimer);
    this.settleTimer = setTimeout(() => {
      this.moving = false;
      this.svg?.classList.remove('moving');
      this.listeners.forEach((l) => l(this.s));
    }, 150);
  }

  viewport(): Rect {
    const r = this.svg?.getBoundingClientRect();
    const W = r?.width ?? window.innerWidth;
    const H = r?.height ?? window.innerHeight;
    return {
      x: this.insets.left,
      y: this.insets.top,
      w: Math.max(100, W - this.insets.left - this.insets.right),
      h: Math.max(100, H - this.insets.top - this.insets.bottom),
    };
  }

  /** Scale and translation that fit a world-space rect into the viewport. */
  fit(rect: Rect, pad = 48, maxScale = 6): { x: number; y: number; s: number } {
    const vp = this.viewport();
    const s = Math.min(maxScale, Math.max(MIN_S, Math.min((vp.w - pad * 2) / Math.max(rect.w, 1), (vp.h - pad * 2) / Math.max(rect.h, 1))));
    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2;
    return { s, x: vp.x + vp.w / 2 - cx * s, y: vp.y + vp.h / 2 - cy * s };
  }

  /** Smoothly fly so that `rect` fills the viewport. Returns the target scale. */
  flyTo(rect: Rect, opts: { duration?: number; pad?: number; maxScale?: number; instant?: boolean } = {}): number {
    const target = this.fit(rect, opts.pad, opts.maxScale);
    cancelAnimationFrame(this.anim);
    if (opts.instant) {
      Object.assign(this, target);
      this.apply();
      this.settled();
      return target.s;
    }
    const vp = this.viewport();
    const from = { s: this.s, cx: (vp.x + vp.w / 2 - this.x) / this.s, cy: (vp.y + vp.h / 2 - this.y) / this.s };
    const to = { s: target.s, cx: (vp.x + vp.w / 2 - target.x) / target.s, cy: (vp.y + vp.h / 2 - target.y) / target.s };
    const dist = Math.hypot(to.cx - from.cx, to.cy - from.cy) * Math.min(from.s, to.s);
    const duration = opts.duration ?? Math.min(1300, 650 + dist * 0.25 + Math.abs(Math.log(to.s / from.s)) * 120);
    this.startMoving();
    const t0 = performance.now();
    const ls0 = Math.log(from.s);
    const ls1 = Math.log(to.s);
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / duration);
      const e = easeInOut(t);
      // Slight zoom-out bump when travelling far, for a sense of flight.
      const bump = Math.sin(Math.PI * e) * Math.min(0.5, dist / 3000);
      const s = Math.exp(ls0 + (ls1 - ls0) * e - bump);
      const cx = from.cx + (to.cx - from.cx) * e;
      const cy = from.cy + (to.cy - from.cy) * e;
      this.s = s;
      this.x = vp.x + vp.w / 2 - cx * s;
      this.y = vp.y + vp.h / 2 - cy * s;
      this.apply();
      if (t < 1) this.anim = requestAnimationFrame(step);
      else this.settled();
    };
    this.anim = requestAnimationFrame(step);
    return target.s;
  }

  stop() {
    cancelAnimationFrame(this.anim);
  }

  panBy(dx: number, dy: number) {
    this.stop();
    this.startMoving();
    this.x += dx;
    this.y += dy;
    this.apply();
    this.settled();
  }

  zoomAt(clientX: number, clientY: number, factor: number) {
    this.stop();
    this.startMoving();
    const r = this.svg?.getBoundingClientRect();
    const px = clientX - (r?.left ?? 0);
    const py = clientY - (r?.top ?? 0);
    const ns = Math.min(MAX_S, Math.max(MIN_S, this.s * factor));
    const k = ns / this.s;
    this.x = px - (px - this.x) * k;
    this.y = py - (py - this.y) * k;
    this.s = ns;
    this.apply();
    this.settled();
  }

  /** Client coordinates -> world screen-space (pre-projection) coordinates. */
  toWorld(clientX: number, clientY: number): [number, number] {
    const r = this.svg?.getBoundingClientRect();
    return [(clientX - (r?.left ?? 0) - this.x) / this.s, (clientY - (r?.top ?? 0) - this.y) / this.s];
  }
}

export const camera = new Camera();

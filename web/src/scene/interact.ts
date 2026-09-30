import type { PointerEvent as RPointerEvent, MouseEvent as RMouseEvent } from 'react';
import { unitFootprint, type World } from '../../../shared/model';
import { unproject } from '../iso/iso';
import { indexWorld } from '../state';
import { checkpoint, commitLive, navigate, select, useStore } from '../state/store';
import { useHover } from '../state/ephemeral';
import { camera } from './camera';

/** Shared between the background pan handler and entity handlers. */
export const pointer = { moved: false, downX: 0, downY: 0, dragging: false };

export function pointerDown(e: { clientX: number; clientY: number }) {
  pointer.moved = false;
  pointer.downX = e.clientX;
  pointer.downY = e.clientY;
}

export function pointerMoved(e: { clientX: number; clientY: number }) {
  if (!pointer.moved && Math.hypot(e.clientX - pointer.downX, e.clientY - pointer.downY) > 5) pointer.moved = true;
}

type DragKind = 'site' | 'building' | 'unit';

type Rect = { x: number; y: number; w: number; d: number };

function overlaps(a: Rect, b: Rect) {
  const e = 1e-6;
  return a.x < b.x + b.w - e && a.x + a.w > b.x + e && a.y < b.y + b.d - e && a.y + a.d > b.y + e;
}

/** What can be dragged, its container bounds and the siblings it must not overlap. */
function dragTarget(world: World, id: string, kind: DragKind) {
  const e = indexWorld(world).get(id);
  if (!e) return null;
  if (kind === 'site' && e.kind === 'site') {
    const others = world.sites.filter((s) => s.id !== id).map((s) => ({ x: s.pos.x - 2, y: s.pos.y - 2, w: s.w + 4, d: s.d + 4 }));
    return { pos: e.site.pos, size: { w: e.site.w, d: e.site.d }, max: null, others, siteIndex: world.sites.indexOf(e.site) };
  }
  if (kind === 'building' && e.kind === 'building') {
    const others = e.site.buildings.filter((b) => b.id !== id).map((b) => ({ x: b.pos.x, y: b.pos.y, w: b.w, d: b.d }));
    return { pos: e.building.pos, size: { w: e.building.w, d: e.building.d }, max: { x: e.site.w - e.building.w, y: e.site.d - e.building.d }, others, siteIndex: world.sites.indexOf(e.site) };
  }
  if (kind === 'unit' && (e.kind === 'rack' || e.kind === 'machine')) {
    const unit = e.kind === 'rack' ? e.rack : e.unit;
    const [fw, fd] = unitFootprint(unit);
    const others = e.building.units
      .filter((u) => u.id !== unit.id)
      .map((u) => {
        const [w, d] = unitFootprint(u);
        return { x: u.pos.x, y: u.pos.y, w, d };
      });
    return { pos: unit.pos, size: { w: fw, d: fd }, max: { x: e.building.w - fw, y: e.building.d - fd }, others, siteIndex: world.sites.indexOf(e.site) };
  }
  return null;
}

function startDrag(e: RPointerEvent, id: string, kind: DragKind) {
  const world = useStore.getState().world;
  if (!world) return;
  const draft = structuredClone(world);
  const target = dragTarget(draft, id, kind);
  if (!target) return;
  e.stopPropagation();
  (e.target as Element).setPointerCapture?.(e.pointerId);
  pointerDown(e);
  checkpoint();
  select(id);
  pointer.dragging = true;
  const [sx0, sy0] = camera.toWorld(e.clientX, e.clientY);
  const w0 = unproject(sx0, sy0);
  const start = { ...target.pos };
  const move = (ev: PointerEvent) => {
    pointerMoved(ev);
    if (!pointer.moved) return;
    const [sx, sy] = camera.toWorld(ev.clientX, ev.clientY);
    const w1 = unproject(sx, sy);
    const snap = ev.altKey ? 0.25 : 1;
    let nx = Math.round((start.x + w1.x - w0.x) / snap) * snap;
    let ny = Math.round((start.y + w1.y - w0.y) / snap) * snap;
    if (target.max) {
      nx = Math.max(0, Math.min(target.max.x, nx));
      ny = Math.max(0, Math.min(target.max.y, ny));
    }
    if (nx === target.pos.x && ny === target.pos.y) return;
    // Don't walk into other things: keep the last free position.
    if (target.others.some((o) => overlaps({ x: nx, y: ny, ...target.size }, o))) return;
    target.pos.x = nx;
    target.pos.y = ny;
    // Sites are memoised by object identity: give the containing site a new
    // identity so the scene redraws while dragging.
    const sites = [...draft.sites];
    sites[target.siteIndex] = { ...sites[target.siteIndex] };
    draft.sites = sites;
    commitLive({ ...draft });
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
    pointer.dragging = false;
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
}

export interface EntityOpts {
  id: string;
  path: string[];
  /** Whether this entity currently reacts (it is a child of the focused thing). */
  active: boolean;
  drag?: DragKind;
  onActivate?: () => void;
}

/** Event handlers for a clickable world entity. */
export function entityHandlers(o: EntityOpts) {
  if (!o.active) return {};
  return {
    onClick: (e: RMouseEvent) => {
      e.stopPropagation();
      if (pointer.moved) return;
      const { edit } = useStore.getState();
      if (edit) select(o.id);
      else if (o.onActivate) o.onActivate();
      else navigate(o.path);
    },
    onDoubleClick: (e: RMouseEvent) => {
      e.stopPropagation();
      if (useStore.getState().edit) {
        if (o.onActivate) o.onActivate();
        else navigate(o.path);
      }
    },
    onPointerDown: (e: RPointerEvent) => {
      if (e.button !== 0) return;
      const st = useStore.getState();
      // Touch: first tap selects, then the selected item can be dragged (otherwise touch pans).
      if (o.drag && st.edit && (e.pointerType === 'mouse' || st.selected === o.id)) startDrag(e, o.id, o.drag);
    },
    onPointerEnter: (e: RPointerEvent) => {
      if (e.pointerType === 'mouse') useHover.setState({ hover: { id: o.id, x: e.clientX, y: e.clientY } });
    },
    onPointerMove: (e: RPointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      e.stopPropagation();
      const h = useHover.getState().hover;
      if (!h || h.id !== o.id || Math.abs(h.x - e.clientX) + Math.abs(h.y - e.clientY) > 2) useHover.setState({ hover: { id: o.id, x: e.clientX, y: e.clientY } });
    },
    onPointerLeave: () => {
      if (useHover.getState().hover?.id === o.id) useHover.setState({ hover: null });
    },
  };
}

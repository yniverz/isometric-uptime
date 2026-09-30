import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { depthSort, screenBounds } from '../iso/iso';
import { DARK, LIGHT } from '../iso/palette';
import { indexWorld } from '../state';
import { isDark, levelOf, navigateUp, useStore } from '../state/store';
import { useView } from '../state/ephemeral';
import { camera } from './camera';
import { pointer, pointerDown, pointerMoved } from './interact';
import { focusBoxes } from './layout';
import { ClusterLinks, Holo } from './overlay';
import { LabelScaleCtx, PalCtx } from './primitives';
import { IslandShadow, SiteView } from './site';
import { ShadowLayer } from './primitives';

export function Scene({ insets }: { insets: { top: number; right: number; bottom: number; left: number } }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const gRef = useRef<SVGGElement>(null);
  const world = useStore((s) => s.world);
  const focus = useStore((s) => s.focus);
  const edit = useStore((s) => s.edit);
  const selected = useStore((s) => s.selected);
  const dark = useStore(isDark);
  const pal = dark ? DARK : LIGHT;
  const level = levelOf(world, focus.path);

  useEffect(() => {
    if (svgRef.current && gRef.current) camera.attach(svgRef.current, gRef.current);
    // Zoom-dependent CSS variables are written straight to the DOM (no React render).
    const applyVars = (ls: number) => {
      const el = svgRef.current;
      if (!el) return;
      el.style.setProperty('--lift', `${-7 * ls}px`);
      el.style.setProperty('--sw', `${0.6 * ls}px`);
      el.style.setProperty('--ls', String(ls));
    };
    applyVars(useView.getState().labelScale);
    const unsubView = useView.subscribe((v) => applyVars(v.labelScale));
    const unsubCam = camera.onSettle((s) => {
      const ls = Math.min(20, Math.max(0.12, 1 / s));
      if (Math.abs(ls - useView.getState().labelScale) / ls > 0.15) useView.setState({ labelScale: ls });
    });
    return () => {
      unsubView();
      unsubCam();
    };
  }, []);

  // Cluster members (for camera + open buildings)
  const clusterPaths = useMemo(() => {
    if (!world || !focus.cluster) return [];
    const c = world.clusters.find((x) => x.id === focus.cluster);
    if (!c) return [];
    const idx = indexWorld(world);
    return c.members.map((id) => idx.get(id)?.path).filter((p): p is string[] => !!p);
  }, [world, focus.cluster]);

  const openBuildings = useMemo(() => {
    const s = new Set<string>();
    if (focus.path[1]) s.add(focus.path[1]);
    for (const p of clusterPaths) s.add(p[1]);
    return s;
  }, [focus.path, clusterPaths]);

  // Fly the camera whenever the focus changes (or the viewport does).
  const childCount = useStore((s) => {
    const w = s.world;
    if (!w) return 0;
    const site = w.sites.find((x) => x.id === s.focus.path[0]);
    if (!site) return w.sites.length;
    const b = site.buildings.find((x) => x.id === s.focus.path[1]);
    if (!b) return site.buildings.length * 1000 + site.w * 10 + site.d;
    return b.w * 1000 + b.d;
  });
  const focusKey = `${focus.path.join('/')}|${focus.cluster ?? ''}|${!!world}|${childCount}`;
  const insetKey = `${insets.top},${insets.right},${insets.bottom},${insets.left}`;
  const first = useRef(true);
  useEffect(() => {
    if (!world) return;
    camera.insets = insets;
    const boxes = focusBoxes(world, focus, clusterPaths);
    const rect = screenBounds(boxes);
    const lvl = levelOf(world, focus.path);
    const maxScale = lvl === 'world' ? 1.6 : lvl === 'site' ? 2.2 : lvl === 'building' ? 3.2 : 11;
    const s = camera.flyTo(rect, { instant: first.current, pad: lvl === 'world' ? 60 : 40, maxScale });
    first.current = false;
    useView.setState({ labelScale: Math.min(20, Math.max(0.12, 1 / s)) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey, insetKey]);

  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const onResize = () => {
      clearTimeout(t);
      t = setTimeout(() => {
        const w = useStore.getState().world;
        if (!w) return;
        const f = useStore.getState().focus;
        camera.flyTo(screenBounds(focusBoxes(w, f, clusterPaths)), { duration: 300, maxScale: 11 });
      }, 200);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [clusterPaths]);

  // Pan / pinch / wheel
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
      camera.zoomAt(e.clientX, e.clientY, factor);
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, []);

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const onPointerDown = (e: React.PointerEvent) => {
    if (pointer.dragging) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) pointerDown(e);
    let lastDist = 0;
    const move = (ev: PointerEvent) => {
      if (pointer.dragging) return;
      const prev = pointers.current.get(ev.pointerId);
      if (!prev) return;
      const pts = [...pointers.current.values()];
      if (pointers.current.size >= 2) {
        const other = [...pointers.current.entries()].find(([id]) => id !== ev.pointerId)?.[1];
        if (other) {
          const d = Math.hypot(ev.clientX - other.x, ev.clientY - other.y);
          if (lastDist) camera.zoomAt((ev.clientX + other.x) / 2, (ev.clientY + other.y) / 2, d / lastDist);
          lastDist = d;
        }
        pointer.moved = true;
      } else {
        pointerMoved(ev);
        if (pointer.moved) camera.panBy(ev.clientX - prev.x, ev.clientY - prev.y);
      }
      void pts;
      pointers.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    };
    const up = (ev: PointerEvent) => {
      pointers.current.delete(ev.pointerId);
      lastDist = 0;
      if (pointers.current.size === 0) {
        window.removeEventListener('pointermove', move, true);
        window.removeEventListener('pointerup', up, true);
        window.removeEventListener('pointercancel', up, true);
        svgRef.current?.classList.remove('panning');
      }
    };
    if (pointers.current.size === 1) {
      // Capture phase, so moves over entities are never swallowed.
      window.addEventListener('pointermove', move, true);
      window.addEventListener('pointerup', up, true);
      window.addEventListener('pointercancel', up, true);
      svgRef.current?.classList.add('panning');
    }
  };

  const sites = useMemo(() => (world ? depthSort(world.sites, (s) => ({ x: s.pos.x, y: s.pos.y, w: s.w, d: s.d })) : []), [world]);

  const ctx = useMemo(
    () => ({ focusPath: focus.cluster ? [] : focus.path, openBuildings, edit, selected, clusterMode: !!focus.cluster }),
    [focus.cluster, focus.path, openBuildings, edit, selected],
  );

  return (
    <PalCtx.Provider value={pal}>
      <LabelScaleProvider>
        <svg
          ref={svgRef}
          className={`world lvl-${focus.cluster ? 'cluster' : level} ${edit ? 'editing' : ''} ${dark ? 'dark' : 'light'}`}
          onPointerDown={onPointerDown}
          onClick={(e) => {
            if (pointer.moved) return;
            if (e.target === svgRef.current || (e.target as Element).classList?.contains('bg')) {
              if (useStore.getState().edit) useStore.setState({ selected: null });
              else navigateUp();
            }
          }}
        >
          <defs>
            <radialGradient id="bgGrad" cx="50%" cy="35%" r="75%">
              <stop offset="0%" stopColor={dark ? '#1A2438' : '#EEF3F8'} />
              <stop offset="100%" stopColor={dark ? '#0B111D' : '#D3DDE8'} />
            </radialGradient>
            <linearGradient id="beamGrad" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor={pal.holo} stopOpacity="0.55" />
              <stop offset="100%" stopColor={pal.holo} stopOpacity="0.05" />
            </linearGradient>
          </defs>
          <rect className="bg" x="0" y="0" width="100%" height="100%" fill="url(#bgGrad)" />
          <g ref={gRef}>
            <ShadowLayer kind="far">
              {sites.map((s) => (
                <IslandShadow key={s.id} site={s} />
              ))}
            </ShadowLayer>
            {sites.map((s) => (
              <SiteView key={s.id} site={s} ctx={ctx} />
            ))}
            {world && level === 'machine' && !focus.cluster && <Holo world={world} path={focus.path} sub={focus.sub} />}
            {world && focus.cluster && <ClusterLinks world={world} clusterId={focus.cluster} />}
          </g>
        </svg>
      </LabelScaleProvider>
    </PalCtx.Provider>
  );
}

/** Only label consumers re-render when the zoom level settles. */
function LabelScaleProvider({ children }: { children: ReactNode }) {
  const ls = useView((v) => v.labelScale);
  return <LabelScaleCtx.Provider value={ls}>{children}</LabelScaleCtx.Provider>;
}

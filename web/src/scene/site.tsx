import { memo, useMemo, type ReactNode } from 'react';
import type { Building, Site } from '../../../shared/model';
import { depthSort, p, pts, seeded } from '../iso/iso';
import { groundColors, shade, type Palette } from '../iso/palette';
import { useStore } from '../state/store';
import { siteHealth } from '../state/health';
import { BuildingView } from './building';
import { entityHandlers } from './interact';
import { FLOOR_H, ISLAND_T, roofHeight } from './layout';
import { Billboard, HitBox, Prism, fill, usePal } from './primitives';

export interface SiteCtx {
  focusPath: string[];
  openBuildings: Set<string>;
  edit: boolean;
  selected: string | null;
  clusterMode: boolean;
}

type Deco = { kind: 'tree' | 'pine' | 'lamp' | 'bush'; x: number; y: number; s: number; key: string };

function decorations(site: Site): { decos: Deco[]; paths: { x: number; y: number; w: number; d: number }[] } {
  const rnd = seeded(site.id);
  const paths = site.buildings.map((b) => {
    const cx = b.pos.x + b.w / 2;
    return { x: site.pos.x + cx - 0.9, y: site.pos.y + b.pos.y + b.d, w: 1.8, d: site.d - (b.pos.y + b.d) };
  });
  const blocked = (x: number, y: number, r: number) => {
    if (x < r + 0.3 || y < r + 0.3 || x > site.w - r - 0.3 || y > site.d - r - 0.3) return true;
    for (const b of site.buildings) if (x > b.pos.x - r - 0.8 && x < b.pos.x + b.w + r + 0.8 && y > b.pos.y - r - 0.8 && y < b.pos.y + b.d + r + 0.8) return true;
    for (const pa of paths) if (x + site.pos.x > pa.x - r - 0.2 && x + site.pos.x < pa.x + pa.w + r + 0.2 && y + site.pos.y > pa.y - r - 0.2) return true;
    return false;
  };
  const decos: Deco[] = [];
  const urban = site.theme === 'urban';
  const step = urban ? 5 : 3.2;
  for (let gx = 1; gx < site.w - 1; gx += step) {
    for (let gy = 1; gy < site.d - 1; gy += step) {
      const x = gx + rnd() * step * 0.7;
      const y = gy + rnd() * step * 0.7;
      const roll = rnd();
      if (roll > (urban ? 0.45 : 0.55)) continue;
      if (blocked(x, y, 0.6)) continue;
      const kind: Deco['kind'] = urban ? (roll < 0.2 ? 'lamp' : 'bush') : site.theme === 'snow' ? 'pine' : roll < 0.18 ? 'pine' : roll < 0.4 ? 'bush' : 'tree';
      decos.push({ kind, x: site.pos.x + x, y: site.pos.y + y, s: 0.8 + rnd() * 0.5, key: `${kind}${gx}-${gy}` });
    }
  }
  return { decos, paths };
}

function DecoView({ d, pal, snow }: { d: Deco; pal: Palette; snow: boolean }) {
  const [bx, by] = p(d.x, d.y, 0);
  const s = d.s;
  if (d.kind === 'lamp') {
    const [tx, ty] = p(d.x, d.y, 3.2);
    return (
      <g>
        <Prism b={{ x: d.x - 0.08, y: d.y - 0.08, z: 0, w: 0.16, d: 0.16, h: 3.1 }} c={pal.lamp} />
        <circle className="lamp-glow" cx={tx} cy={ty} r={7} style={{ fill: pal.lampGlow }} />
        <circle cx={tx} cy={ty} r={2.6} style={{ fill: pal.lampGlow }} />
      </g>
    );
  }
  if (d.kind === 'bush') {
    return (
      <g>
        <ellipse cx={bx} cy={by} rx={10 * s} ry={5 * s} style={{ fill: pal.shadow, opacity: 0.12 }} />
        <circle cx={bx - 3 * s} cy={by - 5 * s} r={6 * s} style={{ fill: pal.leafAlt }} />
        <circle cx={bx + 4 * s} cy={by - 6 * s} r={7 * s} style={{ fill: pal.leaf }} />
        <circle cx={bx + 1 * s} cy={by - 10 * s} r={5.5 * s} style={{ fill: shade(pal.leaf, 0.12) }} />
      </g>
    );
  }
  if (d.kind === 'pine') {
    const h = 58 * s;
    const w = 17 * s;
    return (
      <g>
        <ellipse cx={bx + 4} cy={by} rx={14 * s} ry={7 * s} style={{ fill: pal.shadow, opacity: 0.14 }} />
        <polygon points={pts([[bx - 2, by], [bx + 2, by + 1], [bx + 2, by - 10], [bx - 2, by - 10]])} style={fill(pal.trunk)} />
        <polygon points={pts([[bx, by - h], [bx - w, by - 9], [bx, by - 5]])} style={fill(pal.pine)} />
        <polygon points={pts([[bx, by - h], [bx + w, by - 9], [bx, by - 5]])} style={fill(shade(pal.pine, -0.22))} />
        {snow && <polygon points={pts([[bx, by - h], [bx - w * 0.35, by - h * 0.62], [bx, by - h * 0.66], [bx + w * 0.35, by - h * 0.62]])} style={fill('#F4F8FC')} />}
      </g>
    );
  }
  const r = 13 * s;
  return (
    <g>
      <ellipse cx={bx + 5} cy={by} rx={16 * s} ry={8 * s} style={{ fill: pal.shadow, opacity: 0.14 }} />
      <polygon points={pts([[bx - 2.2, by], [bx + 2.2, by + 1.2], [bx + 2.2, by - 22 * s], [bx - 2.2, by - 22 * s]])} style={fill(pal.trunk)} />
      <circle cx={bx} cy={by - 26 * s} r={r} style={{ fill: pal.leaf }} />
      <path d={`M ${bx} ${by - 26 * s - r} A ${r} ${r} 0 0 1 ${bx} ${by - 26 * s + r} A ${r * 0.55} ${r} 0 0 0 ${bx} ${by - 26 * s - r}`} style={{ fill: pal.leafAlt }} />
      <circle cx={bx - r * 0.35} cy={by - 26 * s - r * 0.35} r={r * 0.28} style={{ fill: shade(pal.leaf, 0.25) }} />
    </g>
  );
}

function IslandShadow({ site, pal }: { site: Site; pal: Palette }) {
  const { x, y } = site.pos;
  const { w, d } = site;
  const z = -ISLAND_T - 7;
  return <polygon className="island-shadow" points={pts([p(x + 2, y + 2, z), p(x + w + 2, y + 2, z), p(x + w + 2, y + d + 2, z), p(x + 2, y + d + 2, z)])} style={{ fill: pal.shadow }} />;
}

function Island({ site, pal }: { site: Site; pal: Palette }) {
  const { x, y } = site.pos;
  const { w, d } = site;
  const g = groundColors(pal, site.theme);
  const urban = site.theme === 'urban';
  const lip = 0.35;
  const sideTop = urban ? shade(g.top, -0.18) : shade(g.top, -0.12);
  const soil = urban ? pal.slabSide : site.theme === 'snow' ? pal.rock : pal.soil;
  const els: ReactNode[] = [];
  // sides
  els.push(<polygon key="sl" points={pts([p(x, y + d, -ISLAND_T), p(x + w, y + d, -ISLAND_T), p(x + w, y + d, -lip), p(x, y + d, -lip)])} style={fill(soil)} />);
  els.push(<polygon key="sr" points={pts([p(x + w, y + d, -ISLAND_T), p(x + w, y, -ISLAND_T), p(x + w, y, -lip), p(x + w, y + d, -lip)])} style={fill(shade(soil, -0.22))} />);
  // strata
  const rnd = seeded(site.id + 'strata');
  for (let i = 0; i < w; i += 2 + rnd() * 3) {
    const v = -lip - 0.5 - rnd() * (ISLAND_T - 1.2);
    const len = 1 + rnd() * 2.5;
    els.push(<polygon key={`st${i}`} points={pts([p(x + i, y + d, v), p(Math.min(x + w, x + i + len), y + d, v), p(Math.min(x + w, x + i + len), y + d, v - 0.18), p(x + i, y + d, v - 0.18)])} style={fill(shade(soil, -0.1))} />);
  }
  els.push(<polygon key="ll" points={pts([p(x, y + d, -lip), p(x + w, y + d, -lip), p(x + w, y + d, 0), p(x, y + d, 0)])} style={fill(sideTop)} />);
  els.push(<polygon key="lr" points={pts([p(x + w, y + d, -lip), p(x + w, y, -lip), p(x + w, y, 0), p(x + w, y + d, 0)])} style={fill(shade(sideTop, -0.2))} />);
  // top
  els.push(<polygon key="top" points={pts([p(x, y), p(x + w, y), p(x + w, y + d), p(x, y + d)])} style={fill(g.top)} />);
  if (urban) {
    for (let i = 2; i < w; i += 2) {
      const a = p(x + i, y);
      const b = p(x + i, y + d);
      els.push(<line key={`gx${i}`} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} className="floor-line" style={{ stroke: g.alt }} />);
    }
    for (let j = 2; j < d; j += 2) {
      const a = p(x, y + j);
      const b = p(x + w, y + j);
      els.push(<line key={`gy${j}`} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} className="floor-line" style={{ stroke: g.alt }} />);
    }
  } else {
    const r2 = seeded(site.id + 'grass');
    for (let i = 0; i < 40; i++) {
      const cx = x + 1 + r2() * (w - 2);
      const cy = y + 1 + r2() * (d - 2);
      const s = 0.8 + r2() * 1.8;
      els.push(<polygon key={`gp${i}`} points={pts([p(cx - s, cy - s * 0.5), p(cx + s, cy - s * 0.5), p(cx + s, cy + s * 0.5), p(cx - s, cy + s * 0.5)])} style={{ fill: g.alt, opacity: 0.7 }} />);
    }
  }
  return <g className="island">{els}</g>;
}

export const SiteView = memo(function SiteView({ site, ctx }: { site: Site; ctx: SiteCtx }) {
  const pal = usePal();
  const { decos, paths } = useMemo(() => decorations(site), [site]);
  const focused = ctx.focusPath[0] === site.id;
  const inOther = !!ctx.focusPath.length && !focused;
  const handlers = entityHandlers({ id: site.id, path: [site.id], active: !focused || ctx.clusterMode, drag: 'site' });
  const health = useStore((s) => {
    const h = siteHealth(site, s.monitors);
    return `${h.rollup}|${h.machines.up + h.machines.down + h.machines.warn}|${h.machines.down}|${h.services.down}`;
  });
  const [rollup, total, down, svcDown] = health.split('|');
  const openB = site.buildings.find((b) => ctx.focusPath[1] === b.id);

  type Obj = { kind: 'b'; b: Building } | { kind: 'd'; d: Deco };
  const objs: Obj[] = [...site.buildings.map((b) => ({ kind: 'b' as const, b })), ...decos.map((d) => ({ kind: 'd' as const, d }))];
  const sorted = depthSort(objs, (o) => (o.kind === 'b' ? { x: site.pos.x + o.b.pos.x, y: site.pos.y + o.b.pos.y, w: o.b.w, d: o.b.d } : { x: o.d.x - 0.4, y: o.d.y - 0.4, w: 0.8, d: 0.8 }));
  const maxH = Math.max(0, ...site.buildings.map((b) => b.floors * FLOOR_H + roofHeight(b)));

  return (
    <g className={`ent site ${handlers.onClick ? 'active' : ''} ${focused ? 'focus' : ''} ${inOther ? 'dim' : ''}`} data-id={site.id}>
      <g {...handlers} className="site-body">
        <IslandShadow site={site} pal={pal} />
        {handlers.onClick && <HitBox b={{ x: site.pos.x, y: site.pos.y, z: -ISLAND_T, w: site.w, d: site.d, h: ISLAND_T }} />}
        <g className="lift">
          <Island site={site} pal={pal} />
          {ctx.edit && ctx.selected === site.id && <polygon className="sel-outline" points={pts([p(site.pos.x, site.pos.y), p(site.pos.x + site.w, site.pos.y), p(site.pos.x + site.w, site.pos.y + site.d), p(site.pos.x, site.pos.y + site.d)])} />}
          {paths.map((pa, i) => (
            <polygon key={i} points={pts([p(pa.x, pa.y), p(pa.x + pa.w, pa.y), p(pa.x + pa.w, pa.y + pa.d), p(pa.x, pa.y + pa.d)])} style={fill(pal.path)} />
          ))}
          {sorted.map((o) =>
            o.kind === 'b' ? (
              <BuildingView
                key={o.b.id}
                site={site}
                b={o.b}
                ctx={{
                  siteFocused: focused && !ctx.clusterMode,
                  open: ctx.openBuildings.has(o.b.id),
                  focusUnit: ctx.focusPath[1] === o.b.id ? (ctx.focusPath[2] ?? null) : null,
                  focusDevice: ctx.focusPath[1] === o.b.id ? (ctx.focusPath[3] ?? null) : null,
                  selected: ctx.selected,
                  edit: ctx.edit,
                  dim: false,
                  fade: !!openB && openB.id !== o.b.id,
                }}
              />
            ) : (
              <g key={o.d.key} className={`deco ${openB ? 'fade' : ''}`}>
                <DecoView d={o.d} pal={pal} snow={site.theme === 'snow'} />
              </g>
            ),
          )}
        </g>
      </g>
      {!focused && (
        <Billboard
          x={site.pos.x + site.w / 2}
          y={site.pos.y + site.d / 2}
          z={maxH + 8}
          text={site.name}
          sub={Number(total) ? `${total} devices${Number(down) ? ` · ${down} down` : ''}${Number(svcDown) ? ` · ${svcDown} svc down` : ''}` : site.description || 'empty'}
          status={Number(total) ? (rollup as never) : undefined}
          size={14}
          className="lbl-site"
        />
      )}
    </g>
  );
});

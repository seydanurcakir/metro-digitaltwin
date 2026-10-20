// Dark map style for the street map tiles, matched to the twin's map ground (#0D131A): land use and parks in
// near-black tints, water in deep blue, roads in slate greys by importance, buildings as faint footprints.
// No text is drawn into the tiles (the twin's own labels sit on top), so tiles stay readable at any tilt.
import type { VectorTile } from '@mapbox/vector-tile';
import { tileSizeM } from '../../src/index';

export const MAP_BG = '#0D131A';

export interface Feat {
  type: number;
  cls: string;
  sub: string;
  brunnel: string;
  ramp: boolean;
  props: Record<string, number | string | boolean>;
  /** Rings / line parts as flat [x0, y0, x1, y1, …] in tile units */
  parts: number[][];
  bbox: [number, number, number, number];
}
export interface Prepared {
  extent: number;
  layers: Record<string, Feat[]>;
}

const LAYERS = ['landcover', 'landuse', 'park', 'water', 'waterway', 'aeroway', 'building', 'transportation'];
const memo = new WeakMap<VectorTile, Prepared>();

/** Decode the layers the style uses once per data tile */
export function prepare(t: VectorTile): Prepared {
  const hit = memo.get(t);
  if (hit) return hit;
  const out: Prepared = { extent: 4096, layers: {} };
  for (const name of LAYERS) {
    const layer = t.layers[name];
    if (!layer) continue;
    out.extent = layer.extent;
    const feats: Feat[] = [];
    for (let i = 0; i < layer.length; i++) {
      const f = layer.feature(i);
      const geom = f.loadGeometry();
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      const parts = geom.map((ring) => {
        const a: number[] = [];
        for (const p of ring) {
          a.push(p.x, p.y);
          if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x;
          if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y;
        }
        return a;
      });
      const pr = f.properties;
      feats.push({
        type: f.type, cls: String(pr.class ?? ''), sub: String(pr.subclass ?? ''), brunnel: String(pr.brunnel ?? ''),
        ramp: pr.ramp === 1 || pr.ramp === true, props: pr, parts, bbox: [x0, y0, x1, y1],
      });
    }
    out.layers[name] = feats;
  }
  memo.set(t, out);
  return out;
}

const LANDUSE: Record<string, string> = {
  residential: '#10171E', suburb: '#10171E', neighbourhood: '#10171E',
  commercial: '#141920', retail: '#151920', industrial: '#13171C', garages: '#13171C',
  railway: '#11161B', cemetery: '#0F1C17', hospital: '#131922', school: '#121822', university: '#121822', college: '#121822', kindergarten: '#121822',
  stadium: '#10201A', pitch: '#10241B', playground: '#10201A', track: '#10201A',
};
const LANDCOVER: Record<string, string> = {
  wood: '#0E2018', grass: '#0F2019', wetland: '#0E1E1D', sand: '#18191A', ice: '#151C24', rock: '#121619',
};
const ROAD: Record<string, { color: string; m: number; px: number; minZ: number }> = {
  motorway: { color: '#3D4C60', m: 22, px: 1.7, minZ: 0 },
  trunk: { color: '#36455A', m: 19, px: 1.5, minZ: 0 },
  primary: { color: '#303D4F', m: 15, px: 1.3, minZ: 0 },
  secondary: { color: '#2B3747', m: 13, px: 1.1, minZ: 9 },
  tertiary: { color: '#263140', m: 11, px: 1.0, minZ: 11 },
  minor: { color: '#222C38', m: 8, px: 0.8, minZ: 12 },
  service: { color: '#1C252F', m: 5, px: 0.6, minZ: 14 },
  track: { color: '#1A222B', m: 3, px: 0.6, minZ: 15 },
  path: { color: '#1C2530', m: 2, px: 0.6, minZ: 16 },
  rail: { color: '#2A323C', m: 2.5, px: 0.9, minZ: 11 },
  transit: { color: '#2A323C', m: 2.5, px: 0.9, minZ: 12 },
};
const ROAD_ORDER = ['path', 'track', 'service', 'minor', 'tertiary', 'secondary', 'primary', 'trunk', 'motorway', 'transit', 'rail'];
const WATER = '#0B2436';
const BUILDING = '#18212B';
const BUILDING_EDGE = '#1F2A36';

/**
 * Draw one map tile into a square canvas of `size` px. The tile can be deeper than the data tile:
 * `scale` = 2^(zoom − data zoom) and (subX, subY) is its index inside the data tile.
 */
export function drawTile(ctx: CanvasRenderingContext2D, size: number, d: Prepared | null, zoom: number, scale: number, subX: number, subY: number) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = MAP_BG;
  ctx.fillRect(0, 0, size, size);
  if (!d) return;
  const k = (size / d.extent) * scale;
  const ox = subX * size, oy = subY * size;
  // Visible window in tile units (with a margin for line widths)
  const m = 64;
  const wx0 = ox / k - m, wy0 = oy / k - m, wx1 = (ox + size) / k + m, wy1 = (oy + size) / k + m;
  const visible = (f: Feat) => f.bbox[2] >= wx0 && f.bbox[0] <= wx1 && f.bbox[3] >= wy0 && f.bbox[1] <= wy1;
  const pxPerM = (size * 2 ** zoom) / tileSizeM(0);

  const path = (f: Feat) => {
    for (const a of f.parts) {
      ctx.moveTo(a[0] * k - ox, a[1] * k - oy);
      for (let i = 2; i < a.length; i += 2) ctx.lineTo(a[i] * k - ox, a[i + 1] * k - oy);
    }
  };
  const fillLayer = (name: string, color: (f: Feat) => string | null) => {
    const byColor = new Map<string, Feat[]>();
    for (const f of d.layers[name] ?? []) {
      if (f.type !== 3 || !visible(f)) continue;
      const c = color(f);
      if (c) (byColor.get(c) ?? byColor.set(c, []).get(c)!).push(f);
    }
    for (const [c, fs] of byColor) {
      ctx.beginPath();
      for (const f of fs) path(f);
      ctx.fillStyle = c;
      ctx.fill('evenodd');
    }
  };
  const strokeSet = (fs: Feat[], color: string, width: number, dash: number[] = []) => {
    if (!fs.length) return;
    ctx.beginPath();
    for (const f of fs) path(f);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.setLineDash(dash);
    ctx.stroke();
    ctx.setLineDash([]);
  };
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  fillLayer('landcover', (f) => LANDCOVER[f.cls] ?? null);
  fillLayer('landuse', (f) => LANDUSE[f.cls] ?? null);
  fillLayer('park', (f) => (f.cls === 'park' || f.cls === 'garden' ? '#0F2119' : null));
  fillLayer('aeroway', () => '#151B22');
  fillLayer('water', (f) => (f.brunnel === 'tunnel' ? null : WATER));
  const ww = (d.layers.waterway ?? []).filter((f) => f.type === 2 && f.brunnel !== 'tunnel' && visible(f));
  strokeSet(ww.filter((f) => f.cls === 'river' || f.cls === 'canal'), WATER, Math.max(1.2, 14 * pxPerM));
  strokeSet(ww.filter((f) => f.cls !== 'river' && f.cls !== 'canal'), WATER, Math.max(0.8, 3 * pxPerM));
  if (zoom >= 14) {
    fillLayer('building', () => BUILDING);
    if (zoom >= 16) strokeSet((d.layers.building ?? []).filter(visible), BUILDING_EDGE, 1);
  }

  // Roads by importance; tunnels faint, bridges drawn last with a dark casing
  const roads = (d.layers.transportation ?? []).filter((f) => f.type === 2 && visible(f));
  for (const pass of ['tunnel', 'ground', 'bridge'] as const) {
    for (const cls of ROAD_ORDER) {
      const st = ROAD[cls];
      if (!st || zoom < st.minZ) continue;
      const fs = roads.filter((f) => f.cls === cls && (pass === 'tunnel' ? f.brunnel === 'tunnel' : pass === 'bridge' ? f.brunnel === 'bridge' : f.brunnel !== 'tunnel' && f.brunnel !== 'bridge'));
      if (!fs.length) continue;
      const rail = cls === 'rail' || cls === 'transit';
      if (pass === 'tunnel' && rail) continue; // tunnels of the metro and Citybanan: the twin draws its own lines
      const w = Math.max(st.px, st.m * pxPerM);
      if (pass === 'bridge') strokeSet(fs, MAP_BG, w + 2.5);
      if (pass === 'tunnel') ctx.globalAlpha = 0.35;
      strokeSet(fs, st.color, rail ? Math.max(st.px, 2 * pxPerM) : w, rail && zoom >= 15 ? [6, 4] : []);
      ctx.globalAlpha = 1;
    }
  }
}

// Real 3D buildings around Solna from the street map's OpenStreetMap building footprints: clipped to their
// tile, placed in the local frame and filtered by the twin's exclusion zones (rail buffer of every line,
// station twins, the arena model, the event walkway). Heights come from OSM (render_height); towards the
// edge of the zone they taper so the 3D area blends into the flat map. Pure functions, unit-tested.
import type { XZ } from '../../src/index';
import { localToTile, tileOrigin, tileSizeM } from '../../src/index';
import { ARENA, WALKWAY } from '../twin/world';
import { MALL_RING } from '../twin/mall';
import { pointInPoly, polygonPolylineDistance, railClash, type Pt } from './clearance';

export const BUILDING_Z = 14;

/** 3D building zone: an ellipse over Solna, Arenastaden, Frösunda and the Brunnsviken shore (world m) */
export const ZONE = { cx: -2600, cz: -4450, rx: 2000, rz: 1000 };
/** Normalised zone radius of a point: < 1 inside */
export const zoneR = (p: XZ) => Math.hypot((p.x - ZONE.cx) / ZONE.rx, (p.z - ZONE.cz) / ZONE.rz);
/** Height factor: full height inside, tapering to a quarter at the edge of the zone */
export function zoneTaper(r: number): number {
  if (r <= 0.7) return 1;
  if (r >= 1) return 0.25;
  const t = (r - 0.7) / 0.3;
  return 1 - 0.75 * t * t * (3 - 2 * t);
}

/** Data tiles (zoom 14) covering the zone */
export function zoneTiles(): { x: number; y: number }[] {
  const a = localToTile({ x: ZONE.cx - ZONE.rx, z: ZONE.cz - ZONE.rz }, BUILDING_Z), b = localToTile({ x: ZONE.cx + ZONE.rx, z: ZONE.cz + ZONE.rz }, BUILDING_Z);
  const out: { x: number; y: number }[] = [];
  for (let x = Math.floor(a.tx); x <= Math.floor(b.tx); x++) for (let y = Math.floor(a.ty); y <= Math.floor(b.ty); y++) out.push({ x, y });
  return out;
}

export interface BuildingInput {
  /** Rings in tile units (outer rings and holes, MVT winding) */
  rings: Pt[][];
  props: Record<string, number | string | boolean>;
}

export interface Prism {
  outer: Pt[];
  holes: Pt[][];
  /** Roof and base height (m above ground) */
  h: number;
  base: number;
  centroid: XZ;
  area: number;
  /** Landmark kind when the building is a named place */
  tint: string | null;
}

export type DropReason = 'tiny' | 'zone' | 'rail' | 'station' | 'arena' | 'mall' | 'walkway' | 'hidden';

const signedArea = (r: Pt[]) => {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j][0] * r[i][1] - r[i][0] * r[j][1];
  return a / 2;
};

/** Group MVT rings into polygons: a ring with the first ring's winding starts a polygon, the other winding is a hole */
export function classify(rings: Pt[][]): Pt[][][] {
  const polys: Pt[][][] = [];
  let sign = 0;
  for (const r of rings) {
    const a = signedArea(r);
    if (a === 0) continue;
    if (!sign) sign = Math.sign(a);
    if (Math.sign(a) === sign) polys.push([r]);
    else if (polys.length) polys[polys.length - 1].push(r);
  }
  return polys;
}

/** Sutherland–Hodgman clip of a ring to the square [0, e]² (removes the tile buffer, so neighbouring
 * tiles' pieces of one building meet edge to edge instead of overlapping) */
export function clipRing(ring: Pt[], e: number): Pt[] {
  let out = ring;
  const edges: [(p: Pt) => boolean, (a: Pt, b: Pt) => Pt][] = [
    [(p) => p[0] >= 0, (a, b) => [0, a[1] + ((b[1] - a[1]) * (0 - a[0])) / (b[0] - a[0])]],
    [(p) => p[0] <= e, (a, b) => [e, a[1] + ((b[1] - a[1]) * (e - a[0])) / (b[0] - a[0])]],
    [(p) => p[1] >= 0, (a, b) => [a[0] + ((b[0] - a[0]) * (0 - a[1])) / (b[1] - a[1]), 0]],
    [(p) => p[1] <= e, (a, b) => [a[0] + ((b[0] - a[0]) * (e - a[1])) / (b[1] - a[1]), e]],
  ];
  for (const [inside, cut] of edges) {
    if (!out.length) break;
    const inp = out;
    out = [];
    for (let i = 0; i < inp.length; i++) {
      const cur = inp[i], prev = inp[(i + inp.length - 1) % inp.length];
      if (inside(cur)) {
        if (!inside(prev)) out.push(cut(prev, cur));
        out.push(cur);
      } else if (inside(prev)) out.push(cut(prev, cur));
    }
  }
  return out;
}

const inArena = (p: Pt, pad: number) => {
  const dx = p[0] - ARENA.pos.x, dz = p[1] - ARENA.pos.z, c = Math.cos(-ARENA.rotY), s = Math.sin(-ARENA.rotY);
  const u = dx * c + dz * s, v = -dx * s + dz * c;
  return (u / (ARENA.a + pad)) ** 2 + (v / (ARENA.b + pad)) ** 2 <= 1;
};

/**
 * Buildings of one zoom-14 tile, in world coordinates, with everything that must stay clear removed.
 * `extent` is the tile's coordinate range (4096 for OpenMapTiles).
 */
export function tileBuildings(feats: BuildingInput[], x: number, y: number, extent: number): { kept: Prism[]; dropped: Record<DropReason, number> } {
  const dropped: Record<DropReason, number> = { tiny: 0, zone: 0, rail: 0, station: 0, arena: 0, mall: 0, walkway: 0, hidden: 0 };
  const kept: Prism[] = [];
  const o = tileOrigin(BUILDING_Z, x, y), s = tileSizeM(BUILDING_Z);
  const toWorld = (r: Pt[]): Pt[] => r.map(([px, py]) => [o.x + (px / extent) * s, o.z + (py / extent) * s]);
  for (const f of feats) {
    if (f.props.hide_3d === true || f.props.hide_3d === 'true') { dropped.hidden++; continue; }
    const hRaw = Number(f.props.render_height ?? f.props.height ?? 10);
    const baseRaw = Number(f.props.render_min_height ?? f.props.min_height ?? 0);
    for (const poly of classify(f.rings)) {
      const clipped = poly.map((r) => clipRing(r, extent)).filter((r) => r.length >= 3);
      if (!clipped.length || clipped[0].length < 3) continue;
      const outer = toWorld(clipped[0]);
      const holes = clipped.slice(1).map(toWorld);
      const area = Math.abs(signedArea(outer)) - holes.reduce((a, h) => a + Math.abs(signedArea(h)), 0);
      if (area < 12) { dropped.tiny++; continue; }
      let cx = 0, cz = 0;
      for (const [px, pz] of outer) { cx += px; cz += pz; }
      const centroid = { x: cx / outer.length, z: cz / outer.length };
      const r = zoneR(centroid);
      if (r > 1) { dropped.zone++; continue; }
      const rail = railClash(outer);
      if (rail) { dropped[rail]++; continue; }
      if (inArena([centroid.x, centroid.z], 15) || outer.some((p) => inArena(p, 8)) || pointInPoly(ARENA.pos.x, ARENA.pos.z, outer)) { dropped.arena++; continue; }
      // Mall of Scandinavia has its own landmark model (Mall.tsx): its OSM blocks are replaced
      if (pointInPoly(centroid.x, centroid.z, MALL_RING) || outer.filter((p) => pointInPoly(p[0], p[1], MALL_RING)).length > outer.length / 2) { dropped.mall++; continue; }
      if (polygonPolylineDistance(outer, WALKWAY) < 5) { dropped.walkway++; continue; }
      const k = zoneTaper(r);
      const h = Math.max(3, Math.min(150, (Number.isFinite(hRaw) ? hRaw : 10) * k));
      const base = Math.min(h - 1, Math.max(0, (Number.isFinite(baseRaw) ? baseRaw : 0) * k));
      kept.push({ outer, holes, h, base, centroid, area, tint: null });
    }
  }
  return { kept, dropped };
}

/** Mark the buildings of named places (the one containing the landmark point, else the nearest within 40 m) */
export function tintLandmarks(prisms: Prism[], marks: { pos: XZ; kind: string }[]): number {
  let n = 0;
  for (const m of marks) {
    let hit = prisms.find((p) => pointInPoly(m.pos.x, m.pos.z, p.outer));
    if (!hit) {
      let bd = 40;
      for (const p of prisms) {
        const d = Math.hypot(p.centroid.x - m.pos.x, p.centroid.z - m.pos.z);
        if (d < bd) { bd = d; hit = p; }
      }
    }
    if (hit && !hit.tint) { hit.tint = m.kind; n++; }
  }
  return n;
}

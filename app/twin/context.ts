// Static surroundings of Solna station, from the reference map traced by scripts/trace-solna-map.py:
// water (Råstasjön, Brunnsviken), parks, motorways (E4, E18, Järva krog), local roads, rail-yard tracks,
// the Mall of Scandinavia complex, named landmarks and representative street blocks.
// Context only — nothing here takes part in the simulation or carries live data.
import type { XZ } from '../../src/index';
import { toLocal } from '../../src/index';
import MAP from './solna-map.json';
import { ARENA, TWINS, WALKWAY } from './world';
import { RAIL_CLEAR_M, awayFromRail, boxCorners, railClash, railDistance } from '../map/clearance';
import { rng } from './selectors';

export interface Area {
  area: number;
  pts: [number, number][];
}

export const SOLNA_MAP = MAP as unknown as {
  source: string;
  extent: [[number, number], [number, number]];
  water: Area[];
  green: Area[];
  commercial: Area[];
  mall: Area[];
  motorway: Area[];
  roads: [number, number][][];
  railyard: [number, number][][];
  free: { step: number; rows: string[]; ax: number; ay: number; s: number };
};

/** Detailed context area (world metres): north-west and south-east corners */
export const EXTENT = { x0: SOLNA_MAP.extent[0][0], z0: SOLNA_MAP.extent[0][1], x1: SOLNA_MAP.extent[1][0], z1: SOLNA_MAP.extent[1][1] };

const F = SOLNA_MAP.free;
/** Reference-map pixel → world */
export const fromPx = (px: number, py: number): XZ => ({ x: (px - F.ax) / F.s, z: (py - F.ay) / F.s });

/** Is this world point on open, built-up ground in the reference map (not water, park, road, motorway, commercial)? */
export function isFree(p: XZ): boolean {
  const px = F.ax + F.s * p.x, py = F.ay + F.s * p.z;
  const row = F.rows[Math.floor(py / F.step)];
  if (!row) return false;
  return row[Math.floor(px / F.step)] === '1';
}

export function inPolygon(p: XZ, pts: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i], [xj, zj] = pts[j];
    if ((zi > p.z) !== (zj > p.z) && p.x < ((xj - xi) * (p.z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

export interface Footprint {
  /** Centre (world m) */
  x: number;
  z: number;
  /** Size along and across the street grid, height (m) */
  w: number;
  d: number;
  h: number;
  rotY: number;
}

export type LandmarkKind = 'hotel' | 'venue' | 'retail' | 'park' | 'water' | 'area' | 'road' | 'poi';

export interface Landmark {
  id: string;
  name: string;
  kind: LandmarkKind;
  pos: XZ;
  /** Building drawn for this landmark, if any */
  building?: Footprint;
  /** Provenance shown as a tooltip */
  note: string;
}

const GRID_ROT = TWINS.solna.rotY;
const MAP_NOTE = 'Position from the reference map (approximate)';
const b = (p: XZ, w: number, d: number, h: number, rotY = GRID_ROT): Footprint => ({ x: p.x, z: p.z, w, d, h, rotY });
const off = (p: XZ, ux: number, uz: number, m: number): XZ => ({ x: p.x + ux * m, z: p.z + uz * m });

/** Landmarks as placed on the reference map (pixel positions of their map markers) */
export const LANDMARKS: Landmark[] = [
  { id: 'mall', name: 'Westfield Mall of Scandinavia', kind: 'retail', pos: fromPx(318, 245), note: `${MAP_NOTE}; footprint traced` },
  // The cinema is part of the mall's north-east wing: its block is set back from the map marker, south-west of
  // the event walkway (Evenemangsgatan) and aligned with it, so the walkway keeps its width.
  { id: 'filmstaden', name: 'Filmstaden Scandinavia', kind: 'venue', pos: fromPx(387, 208), building: b(off(fromPx(387, 208), -0.485, 0.874, 46), 70, 44, 32, -0.507), note: `${MAP_NOTE}; cinema block height assumed` },
  { id: 'gstar', name: 'G-Star RAW Store', kind: 'retail', pos: fromPx(412, 256), building: b(fromPx(412, 256), 26, 18, 9), note: MAP_NOTE },
  { id: 'pressbyran', name: 'Pressbyrån Solna Station', kind: 'poi', pos: fromPx(473, 308), note: MAP_NOTE },
  { id: 'comfort-hotel', name: 'Comfort Hotel Solna', kind: 'hotel', pos: toLocal({ lat: 59.3733, lon: 18.004 }), building: b(toLocal({ lat: 59.3733, lon: 18.004 }), 70, 24, 42), note: 'Evenemangsgatan 48; not on the reference map view, position approximate' },
  { id: 'winery', name: 'The Winery Hotel', kind: 'hotel', pos: fromPx(535, 13), building: b(fromPx(535, 22), 60, 34, 30), note: `${MAP_NOTE}; at the Järva krog interchange` },
  { id: 'hagastrand', name: 'Hagastrand, Autograph Collection', kind: 'hotel', pos: fromPx(838, 283), building: b(fromPx(838, 290), 52, 30, 22, 0.35), note: MAP_NOTE },
  { id: 'monte-carlo', name: 'Monte Carlo', kind: 'poi', pos: fromPx(768, 25), building: b(fromPx(768, 25), 20, 14, 9, 0.2), note: MAP_NOTE },
  { id: 'tivoliberget', name: 'Tivolibergets luftvärnsställning', kind: 'poi', pos: fromPx(885, 108), note: `${MAP_NOTE}; historic anti-aircraft position` },
  { id: 'vasalundsparken', name: 'Vasalundsparken', kind: 'park', pos: toLocal({ lat: 59.36831, lon: 18.00208 }), note: 'Park point from Pacer; outline traced from the reference map' },
  { id: 'hagaparken', name: 'Hagaparken', kind: 'park', pos: fromPx(705, 330), note: 'Park east of the E4 along Brunnsviken (outline traced)' },
  { id: 'rastasjon', name: 'Råstasjön', kind: 'water', pos: fromPx(140, 203), note: 'Lake outline traced from the reference map' },
  { id: 'brunnsviken', name: 'Brunnsviken', kind: 'water', pos: fromPx(900, 200), note: 'Bay outline traced from the reference map' },
  { id: 'frosunda', name: 'Frösunda', kind: 'area', pos: fromPx(505, 160), note: MAP_NOTE },
  { id: 'rastahem', name: 'Råstahem', kind: 'area', pos: fromPx(172, 12), note: MAP_NOTE },
  { id: 'rasunda', name: 'Råsunda', kind: 'area', pos: fromPx(240, 433), note: MAP_NOTE },
  { id: 'alkistan', name: 'Ålkistan', kind: 'area', pos: fromPx(1000, 96), note: MAP_NOTE },
  { id: 'e4', name: 'E4', kind: 'road', pos: fromPx(651, 235), note: MAP_NOTE },
  { id: 'e18', name: 'E18', kind: 'road', pos: fromPx(300, 34), note: MAP_NOTE },
  { id: 'jarva-krog', name: 'Trafikplats Järva krog', kind: 'road', pos: fromPx(468, 30), note: MAP_NOTE },
  { id: 'sjovagen', name: 'Sjövägen', kind: 'road', pos: fromPx(177, 288), note: MAP_NOTE },
  { id: 'ostervagen', name: 'Östervägen', kind: 'road', pos: fromPx(262, 363), note: MAP_NOTE },
  { id: 'rasundavagen', name: 'Råsundavägen', kind: 'road', pos: fromPx(177, 400), note: MAP_NOTE },
  { id: 'kolonnvagen', name: 'Kolonnvägen', kind: 'road', pos: fromPx(413, 100), note: MAP_NOTE },
];

/** Push a footprint straight away from the nearest track until it clears the rail buffer (and the station
 * boxes); `movedM` records how far. Used for landmark buildings whose map position falls inside the buffer. */
function clearOfRail(f: Footprint): Footprint & { movedM: number } {
  if (!railClash(boxCorners(f))) return { ...f, movedM: 0 };
  const dir = awayFromRail(f);
  for (let m = 5; dir && m <= 300; m += 5) {
    const g = { ...f, x: f.x + dir.x * m, z: f.z + dir.z * m };
    if (!railClash(boxCorners(g))) return { ...g, movedM: m };
  }
  return { ...f, movedM: NaN };
}

/** Landmark buildings, kept clear of the railway (see clearOfRail); dropped if they cannot be cleared */
export const LANDMARK_BUILDINGS: (Footprint & { id: string; movedM: number })[] = LANDMARKS.filter((l) => l.building)
  .map((l) => ({ id: l.id, ...clearOfRail(l.building!) }))
  .filter((b) => Number.isFinite(b.movedM));

/** Vasalundsparken: the traced park outline that contains the published park point */
export const PARK = SOLNA_MAP.green.find((g) => inPolygon(LANDMARKS.find((l) => l.id === 'vasalundsparken')!.pos, g.pts)) ?? null;

/** Mall of Scandinavia footprint and height */
export const MALL = { footprint: SOLNA_MAP.mall[0]?.pts ?? [], height: 24 };

const rot = (x: number, z: number, a: number) => ({ x: x * Math.cos(a) + z * Math.sin(a), z: -x * Math.sin(a) + z * Math.cos(a) });

function distToPolyline(p: XZ, pts: { x: number; z: number }[]): number {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], q = pts[i];
    const dx = q.x - a.x, dz = q.z - a.z;
    const l2 = dx * dx + dz * dz || 1;
    const u = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / l2));
    best = Math.min(best, Math.hypot(p.x - (a.x + dx * u), p.z - (a.z + dz * u)));
  }
  return best;
}

const inEllipse = (p: XZ, c: XZ, rx: number, rz: number, a: number, pad: number) => {
  const q = rot(p.x - c.x, p.z - c.z, -a);
  return (q.x / (rx + pad)) ** 2 + (q.z / (rz + pad)) ** 2 <= 1;
};

/** Clearances (m) that keep generated blocks off the twin's own features; exported for the tests */
export const CLEAR = { rail: RAIL_CLEAR_M, arena: 45, walkway: 30, landmark: 30 };

/** Why a block cannot stand here (or null): checks the rail buffer of every line and the station twins, then
 * the arena, walkway, mall, landmark buildings and the map */
export function blockClashes(f: Footprint): string | null {
  const rail = railClash(boxCorners(f));
  if (rail) return rail;
  const hw = f.w / 2, hd = f.d / 2;
  const pts = [{ x: 0, z: 0 }, { x: hw, z: hd }, { x: -hw, z: hd }, { x: hw, z: -hd }, { x: -hw, z: -hd }].map((o) => {
    const r = rot(o.x, o.z, f.rotY);
    return { x: f.x + r.x, z: f.z + r.z };
  });
  for (const p of pts) {
    if (inEllipse(p, ARENA.pos, ARENA.a, ARENA.b, ARENA.rotY, CLEAR.arena)) return 'arena';
    if (distToPolyline(p, WALKWAY) < CLEAR.walkway) return 'walkway';
    if (MALL.footprint.length && inPolygon(p, MALL.footprint)) return 'mall';
    for (const l of LANDMARK_BUILDINGS) if (Math.hypot(p.x - l.x, p.z - l.z) < Math.max(l.w, l.d) / 2 + CLEAR.landmark) return 'landmark';
    if (!isFree(p)) return 'map';
  }
  return null;
}

/** Representative street blocks on the open built-up ground of the reference map (generated, not surveyed) */
export const BLOCKS: Footprint[] = (() => {
  const r = rng(20261020);
  const out: Footprint[] = [];
  const cell = 56;
  const cx = (EXTENT.x0 + EXTENT.x1) / 2, cz = (EXTENT.z0 + EXTENT.z1) / 2;
  const n = Math.ceil(Math.max(EXTENT.x1 - EXTENT.x0, EXTENT.z1 - EXTENT.z0) / cell / 2) + 2;
  for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) {
    const g = rot(i * cell, j * cell, GRID_ROT);
    const x = cx + g.x + (r() - 0.5) * 10, z = cz + g.z + (r() - 0.5) * 10;
    if (x < EXTENT.x0 || x > EXTENT.x1 || z < EXTENT.z0 || z > EXTENT.z1) continue;
    if (r() < 0.12) continue; // courtyards and small squares
    // Taller office blocks in Frösunda/Arenastaden near the station, lower housing further out
    const near = Math.hypot(x - TWINS.solna.pos.x, z - TWINS.solna.pos.z) < 700;
    const h = near ? 14 + r() * 30 : 9 + r() * r() * 22;
    const f: Footprint = { x, z, w: 26 + r() * 18, d: 22 + r() * 16, h, rotY: GRID_ROT };
    if (!blockClashes(f)) out.push(f);
  }
  return out;
})();

/** Trees in Vasalundsparken */
export const TREES: XZ[] = (() => {
  if (!PARK) return [];
  const r = rng(7);
  const xs = PARK.pts.map((p) => p[0]), zs = PARK.pts.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
  const out: XZ[] = [];
  for (let k = 0; k < 4000 && out.length < 70; k++) {
    const p = { x: x0 + r() * (x1 - x0), z: z0 + r() * (z1 - z0) };
    if (inPolygon(p, PARK.pts) && distToPolyline(p, WALKWAY) > 15 && railDistance(p) > RAIL_CLEAR_M) out.push(p);
  }
  return out;
})();

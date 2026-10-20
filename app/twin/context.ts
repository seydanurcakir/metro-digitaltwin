// Static surroundings of Solna station: Vasalundsparken, Comfort Hotel Solna and representative street blocks.
// Context only — nothing here takes part in the simulation. Block positions are generated (not surveyed);
// they keep clear of the railway, the arena, the walkway, the park and the area reserved for Mall of Scandinavia.
import { toLocal, type XZ } from '../../src/index';
import { ARENA, LINES, TWINS, WALKWAY } from './world';
import { rng } from './selectors';

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

export interface Landmark {
  id: string;
  name: string;
  kind: 'park' | 'hotel';
  pos: XZ;
  /** Short provenance text shown in the label tooltip */
  note: string;
}

/** Street grid follows the railway through Solna (platform bearing 350°) */
const GRID_ROT = TWINS.solna.rotY;

export const PARK = {
  centre: toLocal({ lat: 59.36831, lon: 18.00208 }),
  /** Half axes (m); outline approximate */
  rx: 130,
  rz: 85,
  rotY: GRID_ROT,
};

export const HOTEL: Footprint = (() => {
  const p = toLocal({ lat: 59.3733, lon: 18.004 });
  return { x: p.x, z: p.z, w: 70, d: 24, h: 42, rotY: GRID_ROT };
})();

/** Area kept free for Mall of Scandinavia (next step) */
export const MALL_RESERVE = (() => {
  const c = toLocal({ lat: 59.3703, lon: 18.0047 });
  return { x: c.x, z: c.z, rx: 175, rz: 125 };
})();

export const LANDMARKS: Landmark[] = [
  { id: 'vasalundsparken', name: 'Vasalundsparken', kind: 'park', pos: PARK.centre, note: 'Park position from Pacer; outline approximate' },
  { id: 'comfort-hotel', name: 'Comfort Hotel Solna', kind: 'hotel', pos: { x: HOTEL.x, z: HOTEL.z }, note: 'Evenemangsgatan 48; position approximate' },
];

const rot = (x: number, z: number, a: number) => ({ x: x * Math.cos(a) + z * Math.sin(a), z: -x * Math.sin(a) + z * Math.cos(a) });

function distToPolyline(p: XZ, pts: { x: number; z: number }[]): number {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const dx = b.x - a.x, dz = b.z - a.z;
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

/** Clearances (m) used to keep blocks off important features; exported for the tests */
export const CLEAR = { rail: 55, arena: 45, walkway: 30, park: 20, mall: 25, hotel: 35 };

export function blockClashes(b: Footprint): string | null {
  // Test the centre and the four corners
  const hw = b.w / 2, hd = b.d / 2;
  const pts = [{ x: 0, z: 0 }, { x: hw, z: hd }, { x: -hw, z: hd }, { x: hw, z: -hd }, { x: -hw, z: -hd }].map((o) => {
    const r = rot(o.x, o.z, b.rotY);
    return { x: b.x + r.x, z: b.z + r.z };
  });
  const rail = LINES.PENDEL.al;
  const railPts = Array.from({ length: rail.xs.length }, (_, i) => ({ x: rail.xs[i], z: rail.zs[i] }));
  for (const p of pts) {
    if (distToPolyline(p, railPts) < CLEAR.rail) return 'rail';
    if (inEllipse(p, ARENA.pos, ARENA.a, ARENA.b, ARENA.rotY, CLEAR.arena)) return 'arena';
    if (distToPolyline(p, WALKWAY) < CLEAR.walkway) return 'walkway';
    if (inEllipse(p, PARK.centre, PARK.rx, PARK.rz, PARK.rotY, CLEAR.park)) return 'park';
    if (Math.abs(p.x - MALL_RESERVE.x) < MALL_RESERVE.rx + CLEAR.mall && Math.abs(p.z - MALL_RESERVE.z) < MALL_RESERVE.rz + CLEAR.mall) return 'mall';
    if (Math.hypot(p.x - HOTEL.x, p.z - HOTEL.z) < HOTEL.w / 2 + CLEAR.hotel) return 'hotel';
  }
  return null;
}

/** Representative street blocks within ~1 km of Solna station and the arena */
export const BLOCKS: Footprint[] = (() => {
  const r = rng(20261020);
  const centre = { x: (ARENA.pos.x + TWINS.solna.pos.x) / 2, z: (ARENA.pos.z + TWINS.solna.pos.z) / 2 };
  const out: Footprint[] = [];
  const cell = 92;
  for (let i = -12; i <= 12; i++) for (let j = -12; j <= 12; j++) {
    const g = rot(i * cell, j * cell, GRID_ROT);
    const x = centre.x + g.x, z = centre.z + g.z;
    if (Math.hypot(x - centre.x, z - centre.z) > 1050) continue;
    if (r() < 0.18) continue; // squares, plazas, gaps
    const b: Footprint = { x, z, w: 46 + r() * 30, d: 40 + r() * 28, h: 9 + r() * r() * 34, rotY: GRID_ROT };
    if (!blockClashes(b)) out.push(b);
  }
  return out;
})();

/** Trees scattered in the park */
export const TREES: XZ[] = (() => {
  const r = rng(7);
  const out: XZ[] = [];
  while (out.length < 46) {
    const q = { x: (r() * 2 - 1) * PARK.rx, z: (r() * 2 - 1) * PARK.rz };
    if ((q.x / PARK.rx) ** 2 + (q.z / PARK.rz) ** 2 > 0.85) continue;
    const w = rot(q.x, q.z, PARK.rotY);
    out.push({ x: PARK.centre.x + w.x, z: PARK.centre.z + w.z });
  }
  return out;
})();

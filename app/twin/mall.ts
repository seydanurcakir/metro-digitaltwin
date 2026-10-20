// Westfield Mall of Scandinavia as a distinct landmark: its footprint (simplified for clean facades), the
// facade that faces Solna station (digital billboard), the roof point for the illuminated 'M', and the
// neon line pattern on the walls. Pure geometry, unit-tested; drawn by app/scene/Mall.tsx. Static context.
import type { XZ } from '../../src/index';
import { MALL } from './context';
import { TWINS } from './world';

export type P2 = [number, number];

/** Building heights (m): lit shop-front podium, cladding above, total */
export const MALL_H = { podium: 7, total: 22 };

const segDist = (p: P2, a: P2, b: P2) => {
  const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz;
  const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz);
};

function dp(pts: P2[], tol: number): P2[] {
  if (pts.length < 3) return pts;
  let idx = 0, best = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = segDist(pts[i], pts[0], pts[pts.length - 1]);
    if (d > best) { best = d; idx = i; }
  }
  if (best <= tol) return [pts[0], pts[pts.length - 1]];
  return [...dp(pts.slice(0, idx + 1), tol).slice(0, -1), ...dp(pts.slice(idx), tol)];
}

export const signedArea = (r: P2[]) => {
  let a = 0;
  for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; a += p[0] * q[1] - q[0] * p[1]; }
  return a / 2;
};

/** Closed-ring Douglas–Peucker, returned counter-clockwise (positive area in x/z) */
export function simplifyRing(ring: P2[], tol: number): P2[] {
  // Split at the vertex farthest from the first one, simplify both halves
  let far = 0, fd = 0;
  ring.forEach((p, i) => { const d = Math.hypot(p[0] - ring[0][0], p[1] - ring[0][1]); if (d > fd) { fd = d; far = i; } });
  const a = dp(ring.slice(0, far + 1), tol), b = dp([...ring.slice(far), ring[0]], tol);
  const out = [...a.slice(0, -1), ...b.slice(0, -1)];
  return signedArea(out) < 0 ? out.reverse() : out;
}

export function pointInRing(p: XZ, r: P2[]): boolean {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, zi] = r[i], [xj, zj] = r[j];
    if ((zi > p.z) !== (zj > p.z) && p.x < ((xj - xi) * (p.z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** Simplified footprint (counter-clockwise) */
export const MALL_RING: P2[] = simplifyRing(MALL.footprint as P2[], 6);

export interface Edge { a: P2; b: P2; len: number; dir: XZ; out: XZ; mid: XZ }
/** Facade edges with unit direction and outward normal ((dz, −dx) points out of a counter-clockwise ring) */
export const MALL_EDGES: Edge[] = MALL_RING.map((a, i) => {
  const b = MALL_RING[(i + 1) % MALL_RING.length];
  const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
  return { a, b, len, dir: { x: dx / len, z: dz / len }, out: { x: dz / len, z: -dx / len }, mid: { x: (a[0] + b[0]) / 2, z: (a[1] + b[1]) / 2 } };
});

/** Billboard facade: the long edge whose face looks most directly towards Solna station */
export const BILLBOARD = (() => {
  const s = TWINS.solna.pos;
  let best = MALL_EDGES[0], score = -Infinity;
  for (const e of MALL_EDGES) {
    if (e.len < 40) continue;
    const vx = s.x - e.mid.x, vz = s.z - e.mid.z, l = Math.hypot(vx, vz);
    const sc = (e.out.x * vx + e.out.z * vz) / l + e.len / 400;
    if (sc > score) { score = sc; best = e; }
  }
  const width = Math.min(48, best.len - 8);
  return { edge: best, width, height: 12, y: MALL_H.podium + 1.5 + 6, centre: best.mid, rotY: Math.atan2(best.out.x, best.out.z) };
})();

/** Point on the roof farthest from the facades (for the 'M'): grid search inside the footprint */
export const ROOF_CENTRE: { p: XZ; clearance: number } = (() => {
  const xs = MALL_RING.map((p) => p[0]), zs = MALL_RING.map((p) => p[1]);
  let best = { p: { x: xs[0], z: zs[0] }, clearance: 0 };
  for (let x = Math.min(...xs); x <= Math.max(...xs); x += 4) for (let z = Math.min(...zs); z <= Math.max(...zs); z += 4) {
    const p = { x, z };
    if (!pointInRing(p, MALL_RING)) continue;
    const d = Math.min(...MALL_EDGES.map((e) => segDist([x, z], e.a, e.b)));
    if (d > best.clearance) best = { p, clearance: d };
  }
  return best;
})();

/**
 * Neon pattern on the facades, as line segments [x, y, z, x, y, z] just outside the walls: a band above the
 * shop fronts, the roofline, and a zigzag of chevrons on every long facade (skipping the billboard).
 */
export function neonSegments(offset = 0.6): { bands: number[]; zigzag: number[] } {
  const bands: number[] = [], zigzag: number[] = [];
  const P = (e: Edge, t: number, y: number) => [e.a[0] + e.dir.x * t + e.out.x * offset, y, e.a[1] + e.dir.z * t + e.out.z * offset];
  for (const e of MALL_EDGES) {
    for (const y of [MALL_H.podium + 0.3, MALL_H.total - 0.4]) bands.push(...P(e, 0, y), ...P(e, e.len, y));
    if (e.len < 24 || e === BILLBOARD.edge) continue;
    const period = 12, n = Math.floor((e.len - 4) / period), start = (e.len - n * period) / 2;
    const lo = MALL_H.podium + 3, hi = MALL_H.total - 3.5;
    for (let k = 0; k < n; k++) {
      const t0 = start + k * period;
      zigzag.push(...P(e, t0, lo), ...P(e, t0 + period / 2, hi), ...P(e, t0 + period / 2, hi), ...P(e, t0 + period, lo));
    }
  }
  return { bands, zigzag };
}

/** Outline of a geometric block 'M' (own design), width w, height h, centred on the origin, +y up */
export function letterM(w: number, h: number): P2[] {
  const s = w / 10, t = h / 10;
  return ([[-5, -5], [-3.2, -5], [-3.2, 1.6], [0, -1.6], [3.2, 1.6], [3.2, -5], [5, -5], [5, 5], [3.4, 5], [0, 1.2], [-3.4, 5], [-5, 5]] as P2[])
    .map(([x, y]) => [x * s, y * t] as P2);
}

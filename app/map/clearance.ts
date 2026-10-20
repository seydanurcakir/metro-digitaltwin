// Exclusion zones that keep static context (buildings, landmarks, trees) off the twin's own features:
// a clearance buffer along every rail alignment drawn on the map (T14 and the commuter corridor, including
// the faded corridor ends) and a box around each station twin. Read-only use of the alignments: the
// railway, stations and train paths are not changed here.
import type { XZ } from '../../src/index';
import { LINES, LINE_KEYS, TWINS, TWIN_IDS, twinToWorld } from '../twin/world';

/** Minimum distance (m) between any static object and a rail centre line. Covers both tracks (±6 m),
 * the drawn line with its glow at the zoom levels where buildings are shown, and a margin. */
export const RAIL_CLEAR_M = 25;

export type Pt = [number, number];

interface Seg { ax: number; az: number; bx: number; bz: number; line: string }

const CELL = 100;
const key = (i: number, j: number) => `${i},${j}`;

/** Rail centre-line segments, bucketed in a 100 m grid for fast proximity queries */
const RAIL = (() => {
  const segs: Seg[] = [];
  const grid = new Map<string, Seg[]>();
  for (const k of LINE_KEYS) {
    const al = LINES[k].al;
    for (let i = 1; i < al.xs.length; i++) {
      const s: Seg = { ax: al.xs[i - 1], az: al.zs[i - 1], bx: al.xs[i], bz: al.zs[i], line: k };
      segs.push(s);
      const i0 = Math.floor(Math.min(s.ax, s.bx) / CELL), i1 = Math.floor(Math.max(s.ax, s.bx) / CELL);
      const j0 = Math.floor(Math.min(s.az, s.bz) / CELL), j1 = Math.floor(Math.max(s.az, s.bz) / CELL);
      for (let a = i0; a <= i1; a++) for (let b = j0; b <= j1; b++) {
        const kk = key(a, b);
        (grid.get(kk) ?? grid.set(kk, []).get(kk)!).push(s);
      }
    }
  }
  return { segs, grid };
})();

export const RAIL_SEGMENT_COUNT = RAIL.segs.length;

function nearSegs(x0: number, z0: number, x1: number, z1: number, pad: number): Set<Seg> {
  const out = new Set<Seg>();
  const i0 = Math.floor((x0 - pad) / CELL), i1 = Math.floor((x1 + pad) / CELL);
  const j0 = Math.floor((z0 - pad) / CELL), j1 = Math.floor((z1 + pad) / CELL);
  for (let a = i0; a <= i1; a++) for (let b = j0; b <= j1; b++) for (const s of RAIL.grid.get(key(a, b)) ?? []) out.add(s);
  return out;
}

const ptSeg = (px: number, pz: number, ax: number, az: number, bx: number, bz: number) => {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
  const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2)) : 0;
  return Math.hypot(px - ax - t * dx, pz - az - t * dz);
};

const cross = (ax: number, az: number, bx: number, bz: number, cx: number, cz: number) => (bx - ax) * (cz - az) - (bz - az) * (cx - ax);

function segSeg(a: Seg, px: number, pz: number, qx: number, qz: number): number {
  const d1 = cross(a.ax, a.az, a.bx, a.bz, px, pz), d2 = cross(a.ax, a.az, a.bx, a.bz, qx, qz);
  const d3 = cross(px, pz, qx, qz, a.ax, a.az), d4 = cross(px, pz, qx, qz, a.bx, a.bz);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return 0;
  return Math.min(
    ptSeg(px, pz, a.ax, a.az, a.bx, a.bz), ptSeg(qx, qz, a.ax, a.az, a.bx, a.bz),
    ptSeg(a.ax, a.az, px, pz, qx, qz), ptSeg(a.bx, a.bz, px, pz, qx, qz),
  );
}

export function pointInPoly(x: number, z: number, pts: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i], [xj, zj] = pts[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** Distance (m) from a point to the nearest rail centre line, or `limit` if none is closer */
export function railDistance(p: XZ, limit = 500): number {
  let d = limit;
  for (const s of nearSegs(p.x, p.z, p.x, p.z, limit)) d = Math.min(d, ptSeg(p.x, p.z, s.ax, s.az, s.bx, s.bz));
  return d;
}

/** Distance (m) from a polygon (as an area) to the nearest rail centre line: 0 if a track crosses or lies
 * inside it; `limit` if nothing is closer. Bounding-box prefilter, then exact edge-to-segment distances. */
export function polygonRailDistance(pts: Pt[], limit = 200): number {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const [x, z] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  let d = limit;
  for (const s of nearSegs(x0, z0, x1, z1, limit)) {
    // Quick reject: segment bounding box farther than the current best
    if (Math.max(s.ax, s.bx) < x0 - d || Math.min(s.ax, s.bx) > x1 + d || Math.max(s.az, s.bz) < z0 - d || Math.min(s.az, s.bz) > z1 + d) continue;
    if (pointInPoly(s.ax, s.az, pts) || pointInPoly(s.bx, s.bz, pts)) return 0;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      d = Math.min(d, segSeg(s, pts[j][0], pts[j][1], pts[i][0], pts[i][1]));
      if (d === 0) return 0;
    }
  }
  return d;
}

/** Station twins: boxes around platforms, tracks and station buildings (station frame), in world corners */
export const TWIN_ZONES: Pt[][] = TWIN_IDS.map((id) => {
  const tw = TWINS[id];
  const hl = tw.layout.platformLength / 2 + 45, hw = Math.abs(tw.layout.wallZ) + 30;
  return [[-hl, -hw], [hl, -hw], [hl, hw], [-hl, hw]].map(([x, z]) => {
    const p = twinToWorld(tw, x, z);
    return [p.x, p.z] as Pt;
  });
});

/** Do two simple polygons overlap (edge crossing or containment)? */
export function polygonsOverlap(a: Pt[], b: Pt[]): boolean {
  if (pointInPoly(a[0][0], a[0][1], b) || pointInPoly(b[0][0], b[0][1], a)) return true;
  for (let i = 0, j = a.length - 1; i < a.length; j = i++) {
    const s: Seg = { ax: a[j][0], az: a[j][1], bx: a[i][0], bz: a[i][1], line: '' };
    for (let k = 0, l = b.length - 1; k < b.length; l = k++) if (segSeg(s, b[l][0], b[l][1], b[k][0], b[k][1]) === 0) return true;
  }
  return false;
}

/** Why a static footprint cannot stand here because of the railway, or null when it is clear */
export function railClash(pts: Pt[], buffer = RAIL_CLEAR_M): 'rail' | 'station' | null {
  if (polygonRailDistance(pts, buffer + 1) < buffer) return 'rail';
  if (TWIN_ZONES.some((z) => polygonsOverlap(pts, z))) return 'station';
  return null;
}

/** Corners of a rotated box footprint (centre, size along/across, rotation about y) */
export function boxCorners(f: { x: number; z: number; w: number; d: number; rotY: number }, pad = 0): Pt[] {
  const c = Math.cos(f.rotY), s = Math.sin(f.rotY), hw = f.w / 2 + pad, hd = f.d / 2 + pad;
  // Rotation about y by rotY maps local (x, z) to (x c + z s, −x s + z c)
  return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([x, z]) => [f.x + x * c + z * s, f.z - x * s + z * c] as Pt);
}

/** Unit vector pointing away from the nearest rail centre line */
export function awayFromRail(p: XZ): XZ | null {
  let best: Seg | null = null, bd = Infinity;
  for (const s of nearSegs(p.x, p.z, p.x, p.z, 500)) {
    const d = ptSeg(p.x, p.z, s.ax, s.az, s.bx, s.bz);
    if (d < bd) { bd = d; best = s; }
  }
  if (!best) return null;
  const dx = best.bx - best.ax, dz = best.bz - best.az, l = Math.hypot(dx, dz) || 1;
  let nx = -dz / l, nz = dx / l;
  const t = Math.max(0, Math.min(1, ((p.x - best.ax) * dx + (p.z - best.az) * dz) / (l * l)));
  if ((p.x - (best.ax + t * dx)) * nx + (p.z - (best.az + t * dz)) * nz < 0) { nx = -nx; nz = -nz; }
  return { x: nx, z: nz };
}

/** Distance (m) between a polygon (as an area) and a polyline, 0 when they touch */
export function polygonPolylineDistance(pts: Pt[], line: XZ[]): number {
  let d = Infinity;
  for (let i = 1; i < line.length; i++) {
    const s: Seg = { ax: line[i - 1].x, az: line[i - 1].z, bx: line[i].x, bz: line[i].z, line: '' };
    if (pointInPoly(s.ax, s.az, pts) || pointInPoly(s.bx, s.bz, pts)) return 0;
    for (let k = 0, l = pts.length - 1; k < pts.length; l = k++) d = Math.min(d, segSeg(s, pts[l][0], pts[l][1], pts[k][0], pts[k][1]));
  }
  return d;
}

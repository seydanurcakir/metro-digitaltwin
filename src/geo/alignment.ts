// Line alignment: a polyline in world metres with arc length, built from station coordinates.
// Arc length increases with station order ("north" direction). Stations with a 3D twin get a straight
// section along their platform axis so the model and the line coincide.

import type { Line } from '../types';
import { bearingToVec, toLocal, type XZ } from './projection';
import { PLATFORM_AXIS, SHAPE_POINTS, STATION_GEO } from './geodata';

export interface Pose extends XZ {
  /** Unit tangent in the direction of increasing arc */
  dx: number;
  dz: number;
}

export interface Alignment {
  key: string;
  xs: Float64Array;
  zs: Float64Array;
  /** Cumulative arc length at each vertex */
  arc: Float64Array;
  length: number;
  /** Arc position of each station, by station order */
  stationArc: number[];
  /** Station id → arc position */
  arcOf: Record<string, number>;
}

export function buildAlignment(key: string, line: Line): Alignment {
  const pts: XZ[] = [];
  const stationVertex: number[] = [];
  line.stations.forEach((st, i) => {
    const g = STATION_GEO[st.id];
    if (!g) throw new Error(`No coordinates for station ${st.id}`);
    const c = toLocal(g);
    const axis = PLATFORM_AXIS[st.id];
    if (i > 0) {
      const shape = SHAPE_POINTS[`${line.stations[i - 1].id}>${st.id}`];
      if (shape) for (const p of shape.value) pts.push(toLocal(p));
    }
    if (axis) {
      let u = bearingToVec(axis.bearingDeg.value);
      // Make the axis point towards increasing order
      const nb = line.stations[i + 1] ?? line.stations[i - 1];
      const n = toLocal(STATION_GEO[nb.id]);
      const toward = line.stations[i + 1] ? 1 : -1;
      if (((n.x - c.x) * u.x + (n.z - c.z) * u.z) * toward < 0) u = { x: -u.x, z: -u.z };
      const h = axis.straightHalfM;
      pts.push({ x: c.x - u.x * h, z: c.z - u.z * h });
      stationVertex.push(pts.length);
      pts.push(c);
      pts.push({ x: c.x + u.x * h, z: c.z + u.z * h });
    } else {
      stationVertex.push(pts.length);
      pts.push(c);
    }
  });
  const n = pts.length;
  const xs = new Float64Array(n), zs = new Float64Array(n), arc = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    xs[i] = pts[i].x;
    zs[i] = pts[i].z;
    if (i > 0) arc[i] = arc[i - 1] + Math.hypot(xs[i] - xs[i - 1], zs[i] - zs[i - 1]);
  }
  const stationArc = stationVertex.map((v) => arc[v]);
  const arcOf: Record<string, number> = {};
  line.stations.forEach((s, i) => { arcOf[s.id] = stationArc[i]; });
  return { key, xs, zs, arc, length: arc[n - 1], stationArc, arcOf };
}

/** Point and tangent at arc position s (clamped to the line) */
export function poseAt(al: Alignment, s: number, out: Pose = { x: 0, z: 0, dx: 1, dz: 0 }): Pose {
  const { xs, zs, arc } = al;
  const n = arc.length;
  const v = Math.max(0, Math.min(al.length, s));
  let lo = 0, hi = n - 2;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (arc[mid] <= v) lo = mid; else hi = mid - 1;
  }
  const seg = arc[lo + 1] - arc[lo] || 1;
  const f = (v - arc[lo]) / seg;
  const dx = (xs[lo + 1] - xs[lo]) / seg;
  const dz = (zs[lo + 1] - zs[lo]) / seg;
  out.x = xs[lo] + (xs[lo + 1] - xs[lo]) * f;
  out.z = zs[lo] + (zs[lo + 1] - zs[lo]) * f;
  out.dx = dx;
  out.dz = dz;
  return out;
}

/** Vertices of the alignment between two arc positions (for drawing parts of a line) */
export function slice(al: Alignment, a: number, b: number): XZ[] {
  const out: XZ[] = [];
  const p = poseAt(al, a);
  out.push({ x: p.x, z: p.z });
  for (let i = 0; i < al.arc.length; i++) if (al.arc[i] > a && al.arc[i] < b) out.push({ x: al.xs[i], z: al.zs[i] });
  const q = poseAt(al, b);
  out.push({ x: q.x, z: q.z });
  return out;
}

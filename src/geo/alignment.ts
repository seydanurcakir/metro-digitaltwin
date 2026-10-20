// Line alignment: a smooth curve in world metres with arc length, built from station coordinates.
// Arc length increases with station order ("north" direction). Stations with a 3D twin get a straight
// section along their platform axis so the model and the line coincide.
//
// The control points (stations, schematic shape points, twin straight ends) are joined by cubic Hermite
// segments and resampled densely, so the line has no corners: everything that follows it (drawn lines,
// trains, camera follow) turns smoothly. Station points lie exactly on the curve.

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
  /** Control points the curve was built from (stations, shape points, twin straight ends) */
  control: XZ[];
}

/** Spacing of the resampled curve (m) */
export const SAMPLE_M = 12;

export function buildAlignment(key: string, line: Line): Alignment {
  const pts: XZ[] = [];
  /** Fixed tangent for control points on a twin's straight section (unit vector), otherwise null */
  const locked: (XZ | null)[] = [];
  const stationVertex: number[] = [];
  line.stations.forEach((st, i) => {
    const g = STATION_GEO[st.id];
    if (!g) throw new Error(`No coordinates for station ${st.id}`);
    const c = toLocal(g);
    const axis = PLATFORM_AXIS[st.id];
    if (i > 0) {
      const shape = SHAPE_POINTS[`${line.stations[i - 1].id}>${st.id}`];
      if (shape) for (const p of shape.value) { pts.push(toLocal(p)); locked.push(null); }
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
      locked.push(u, u, u);
    } else {
      stationVertex.push(pts.length);
      pts.push(c);
      locked.push(null);
    }
  });

  // Tangent direction at each control point: the platform axis on twin sections, otherwise the
  // direction from the previous to the next point (Catmull-Rom style)
  const m = pts.length;
  const tan: XZ[] = pts.map((p, i) => {
    if (locked[i]) return locked[i]!;
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(m - 1, i + 1)];
    const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
    return { x: dx / l, z: dz / l };
  });

  // Cubic Hermite per segment, tangent length = chord length (a segment whose end tangents both lie
  // along the chord comes out exactly straight), resampled every ~SAMPLE_M metres
  const out: XZ[] = [pts[0]];
  const ctrlIndex: number[] = [0];
  for (let i = 0; i < m - 1; i++) {
    const p0 = pts[i], p1 = pts[i + 1];
    const L = Math.hypot(p1.x - p0.x, p1.z - p0.z);
    const t0 = { x: tan[i].x * L, z: tan[i].z * L }, t1 = { x: tan[i + 1].x * L, z: tan[i + 1].z * L };
    const k = Math.max(1, Math.ceil(L / SAMPLE_M));
    for (let j = 1; j <= k; j++) {
      const u = j / k, u2 = u * u, u3 = u2 * u;
      const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
      out.push(j === k ? p1 : {
        x: h00 * p0.x + h10 * t0.x + h01 * p1.x + h11 * t1.x,
        z: h00 * p0.z + h10 * t0.z + h01 * p1.z + h11 * t1.z,
      });
    }
    ctrlIndex.push(out.length - 1);
  }

  const n = out.length;
  const xs = new Float64Array(n), zs = new Float64Array(n), arc = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    xs[i] = out[i].x;
    zs[i] = out[i].z;
    if (i > 0) arc[i] = arc[i - 1] + Math.hypot(xs[i] - xs[i - 1], zs[i] - zs[i - 1]);
  }
  const stationArc = stationVertex.map((v) => arc[ctrlIndex[v]]);
  const arcOf: Record<string, number> = {};
  line.stations.forEach((s, i) => { arcOf[s.id] = stationArc[i]; });
  return { key, xs, zs, arc, length: arc[n - 1], stationArc, arcOf, control: pts };
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
  out.x = xs[lo] + (xs[lo + 1] - xs[lo]) * f;
  out.z = zs[lo] + (zs[lo + 1] - zs[lo]) * f;
  // Heading: blend this sample's direction with its neighbour's around each vertex, so the heading
  // turns continuously instead of stepping at every sample point
  const dir = (i: number) => {
    const j = Math.max(0, Math.min(n - 2, i));
    const l = arc[j + 1] - arc[j] || 1;
    return [(xs[j + 1] - xs[j]) / l, (zs[j + 1] - zs[j]) / l];
  };
  const [ax, az] = dir(lo);
  const [bx, bz] = f < 0.5 ? dir(lo - 1) : dir(lo + 1);
  const w = f < 0.5 ? 0.5 - f : f - 0.5;
  let dx = ax * (1 - w) + bx * w, dz = az * (1 - w) + bz * w;
  const l = Math.hypot(dx, dz) || 1;
  dx /= l; dz /= l;
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

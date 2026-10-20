// Merged, flat-shaded geometry for extruded building footprints: walls with outward normals and
// triangulated roofs (holes included), one vertex colour per building.
import * as THREE from 'three';
import type { Prism } from './buildings';
import type { Pt } from './clearance';

export const BUILDING_COLORS: Record<string, [string, string]> = {
  // [walls, roof]
  default: ['#1E2935', '#293644'],
  hotel: ['#34506F', '#40607F'],
  venue: ['#4E3C68', '#5C4878'],
  retail: ['#574732', '#66553C'],
  poi: ['#3A4A3C', '#465948'],
};

const ringArea = (r: Pt[]) => {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j][0] * r[i][1] - r[i][0] * r[j][1];
  return a / 2;
};

export function buildingGeometry(prisms: Prism[], groundY: number): THREE.BufferGeometry {
  const pos: number[] = [], nor: number[] = [], col: number[] = [];
  const c = new THREE.Color();
  const tri = (a: number[], b: number[], d: number[], n: number[], color: THREE.Color) => {
    // Keep the winding counter-clockwise as seen from the side the normal points to
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    const [p, q] = cx * n[0] + cy * n[1] + cz * n[2] >= 0 ? [b, d] : [d, b];
    pos.push(...a, ...p, ...q);
    for (let i = 0; i < 3; i++) { nor.push(...n); col.push(color.r, color.g, color.b); }
  };
  for (const pr of prisms) {
    const [wallHex, roofHex] = BUILDING_COLORS[pr.tint ?? 'default'] ?? BUILDING_COLORS.default;
    // Taller buildings a touch lighter, so the skyline reads
    const lift = Math.min(0.06, pr.h / 900);
    const wall = c.set(wallHex).offsetHSL(0, 0, lift).clone();
    const roof = c.set(roofHex).offsetHSL(0, 0, lift).clone();
    const y0 = groundY + pr.base, y1 = groundY + pr.h;
    const rings = [pr.outer, ...pr.holes];
    rings.forEach((r, ri) => {
      // Outward normal: right-hand side for a counter-clockwise (x, z) ring; holes face into the hole
      const ccw = ringArea(r) > 0;
      const flip = (ri === 0) !== ccw; // (dz, −dx) points out of a CCW ring
      for (let i = 0; i < r.length; i++) {
        const a = r[i], b = r[(i + 1) % r.length];
        const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz);
        if (l < 0.05) continue;
        let nx = dz / l, nz = -dx / l;
        if (flip) { nx = -nx; nz = -nz; }
        const n = [nx, 0, nz];
        const p0 = [a[0], y0, a[1]], p1 = [b[0], y0, b[1]], p2 = [b[0], y1, b[1]], p3 = [a[0], y1, a[1]];
        tri(p0, p1, p2, n, wall);
        tri(p0, p2, p3, n, wall);
      }
    });
    const contour = pr.outer.map(([x, z]) => new THREE.Vector2(x, z));
    const holes = pr.holes.map((h) => h.map(([x, z]) => new THREE.Vector2(x, z)));
    const all = [...contour, ...holes.flat()];
    for (const [i, j, k] of THREE.ShapeUtils.triangulateShape(contour, holes)) {
      tri([all[i].x, y1, all[i].y], [all[j].x, y1, all[j].y], [all[k].x, y1, all[k].y], [0, 1, 0], roof);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeBoundingSphere();
  return g;
}

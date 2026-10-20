// Tests for the street map and the static context: rail clearance buffer, vector tile decoding and styling,
// building extraction with exclusion zones, and the extruded building geometry.
// Run: npm run test:map
import { VectorTile } from '@mapbox/vector-tile';
import { PbfReader } from 'pbf';
import * as THREE from 'three';
import { localToTile, tileOrigin, tileSizeM, type XZ } from '../src/index';
import { ARENA, LINES, TWINS, WALKWAY } from '../app/twin/world';
import { BLOCKS, LANDMARK_BUILDINGS, LANDMARKS, MALL, TREES } from '../app/twin/context';
import { RAIL_CLEAR_M, boxCorners, polygonRailDistance, railClash, railDistance, type Pt } from '../app/map/clearance';
import { BUILDING_Z, ZONE, classify, clipRing, tileBuildings, tintLandmarks, zoneR, zoneTiles, type BuildingInput } from '../app/map/buildings';
import { buildingGeometry } from '../app/map/mesh';
import { drawTile, prepare } from '../app/map/style';
import { tileZoomFor } from '../app/scene/BaseMap';
import { encodeTile, type EncFeature } from './lib/mvt';
import { BILLBOARD, MALL_EDGES, MALL_H, MALL_RING, ROOF_CENTRE, letterM, neonSegments, pointInRing, signedArea } from '../app/twin/mall';

let failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? '✔' : '✘'} ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) failed++;
};
const box = (c: XZ, w: number, d = w, rotY = 0) => boxCorners({ x: c.x, z: c.z, w, d, rotY });

console.log('\n— Rail clearance buffer (all lines)');
const t14 = LINES.T14.al, pd = LINES.PENDEL.al;
const t14Pt = (i: number): XZ => ({ x: t14.xs[i], z: t14.zs[i] });
check('A building on a T14 track is rejected', railClash(box(t14Pt(Math.floor(t14.xs.length * 0.8)), 30)) === 'rail');
check('A building on a commuter track is rejected', railClash(box({ x: pd.xs[40], z: pd.zs[40] }, 30)) === 'rail');
// Box whose edge is 10 m from the track vs 40 m from it (offset along the local normal)
const i0 = Math.floor(t14.xs.length * 0.6), a = t14Pt(i0), b = t14Pt(i0 + 1);
const l = Math.hypot(b.x - a.x, b.z - a.z), n = { x: -(b.z - a.z) / l, z: (b.x - a.x) / l };
const near = box({ x: a.x + n.x * 20, z: a.z + n.z * 20 }, 20), far = box({ x: a.x + n.x * 50, z: a.z + n.z * 50 }, 20);
check('Buffer applies to the footprint edge, not its centre', railClash(near) === 'rail' && railClash(far) === null,
  `edge 10 m: ${polygonRailDistance(near).toFixed(1)} m, edge 40 m: ${polygonRailDistance(far).toFixed(1)} m`);
check('A building on the Solna twin is rejected', railClash(box(TWINS.solna.pos, 20)) !== null);
const blockD = Math.min(...BLOCKS.map((f) => polygonRailDistance(boxCorners(f))));
check(`Every stand-in block is at least ${RAIL_CLEAR_M} m from every track`, blockD >= RAIL_CLEAR_M && BLOCKS.length > 150, `${BLOCKS.length} blocks, closest ${blockD.toFixed(1)} m`);
const ALKISTAN = LANDMARKS.find((x) => x.id === 'alkistan')!.pos;
check('No stand-in block near Ålkistan touches the T14 buffer', BLOCKS.filter((f) => Math.hypot(f.x - ALKISTAN.x, f.z - ALKISTAN.z) < 600).every((f) => polygonRailDistance(boxCorners(f)) >= RAIL_CLEAR_M));
check('Landmark buildings clear of every track', LANDMARK_BUILDINGS.every((f) => railClash(boxCorners(f)) === null),
  LANDMARK_BUILDINGS.filter((f) => f.movedM > 0).map((f) => `${f.id} moved ${f.movedM} m`).join(', ') || 'none moved');
check('Mall footprint clear of every track', railClash(MALL.footprint as Pt[]) === null, `${polygonRailDistance(MALL.footprint as Pt[]).toFixed(0)} m`);
check('Park trees clear of every track', TREES.every((t) => railDistance(t) >= RAIL_CLEAR_M));

console.log('\n— Street map tiles');
check('Tile level follows the zoom and stays in range', tileZoomFor(0.04, 1) >= 9 && tileZoomFor(28, 2) === 19 && tileZoomFor(0.5, 1) < tileZoomFor(2, 1),
  `zoom 0.088 → z${tileZoomFor(0.088, 1)}, 0.68 → z${tileZoomFor(0.68, 2)}, 4.2 → z${tileZoomFor(4.2, 2)}`);
const ring = (c: XZ, w: number, tx: number, ty: number): [number, number][] => {
  // world box → tile units of the zoom-14 tile (tx, ty); exterior ring with positive area (y down)
  const o = tileOrigin(BUILDING_Z, tx, ty), s = tileSizeM(BUILDING_Z);
  const u = (p: XZ) => [((p.x - o.x) / s) * 4096, ((p.z - o.z) / s) * 4096] as [number, number];
  return [u({ x: c.x - w / 2, z: c.z - w / 2 }), u({ x: c.x + w / 2, z: c.z - w / 2 }), u({ x: c.x + w / 2, z: c.z + w / 2 }), u({ x: c.x - w / 2, z: c.z + w / 2 })];
};
// A zoom-14 tile inside the zone that the T14 line crosses (near Ålkistan / Bergshamra)
let tT14: { x: number; y: number; p: XZ } | null = null;
for (let i = 0; i < t14.xs.length && !tT14; i += 5) {
  const p = t14Pt(i);
  if (zoneR(p) < 0.95) { const t = localToTile(p, BUILDING_Z); tT14 = { x: Math.floor(t.tx), y: Math.floor(t.ty), p }; }
}
check('The 3D building zone includes a stretch of T14 (Ålkistan)', !!tT14);
const sol = localToTile(TWINS.solna.pos, BUILDING_Z), sx = Math.floor(sol.tx), sy = Math.floor(sol.ty);
const ok = { x: TWINS.solna.pos.x + 260, z: TWINS.solna.pos.z - 140 };
const tOk = localToTile(ok, BUILDING_Z);
const mid = { x: (WALKWAY[1].x + WALKWAY[2].x) / 2, z: (WALKWAY[1].z + WALKWAY[2].z) / 2 };
const tMid = localToTile(mid, BUILDING_Z), tAr = localToTile(ARENA.pos, BUILDING_Z);
type Case = { name: string; c: XZ; w: number; t: { tx: number; ty: number }; props?: EncFeature['props'] };
const cases: Case[] = [
  { name: 'free', c: ok, w: 24, t: tOk, props: { render_height: 31, render_min_height: 0 } },
  { name: 'on-pendel', c: TWINS.solna.pos, w: 30, t: sol },
  { name: 'arena', c: ARENA.pos, w: 120, t: tAr },
  { name: 'walkway', c: mid, w: 30, t: tMid },
  ...(tT14 ? [{ name: 'on-t14', c: tT14.p, w: 30, t: { tx: tT14.x + 0.5, ty: tT14.y + 0.5 } }] : []),
];
// Encode each case into its tile, decode with the app's decoder, extract buildings
const byTile = new Map<string, Case[]>();
for (const cs of cases) {
  const k = `${Math.floor(cs.t.tx)}/${Math.floor(cs.t.ty)}`;
  (byTile.get(k) ?? byTile.set(k, []).get(k)!).push(cs);
}
const kept: ReturnType<typeof tileBuildings>['kept'] = [];
const dropped: Record<string, number> = {};
let decodeOk = true, drawOk = true;
for (const [k, list] of byTile) {
  const [tx, ty] = k.split('/').map(Number);
  const bytes = encodeTile({
    building: list.map((cs) => ({ type: 3, geom: [ring(cs.c, cs.w, tx, ty)], props: cs.props ?? { render_height: 20 } })),
    water: [{ type: 3, geom: [[[0, 0], [600, 0], [600, 600], [0, 600]]], props: { class: 'lake' } }],
    transportation: [{ type: 2, geom: [[[0, 2048], [4096, 2048]]], props: { class: 'primary' } }, { type: 2, geom: [[[2048, 0], [2048, 4096]]], props: { class: 'rail', brunnel: 'tunnel' } }],
  });
  const vt = new VectorTile(new PbfReader(bytes));
  const layer = vt.layers.building;
  if (!layer || layer.length !== list.length) decodeOk = false;
  const feats: BuildingInput[] = [];
  for (let i = 0; i < (layer?.length ?? 0); i++) {
    const f = layer.feature(i);
    feats.push({ rings: f.loadGeometry().map((r) => r.map((p) => [p.x, p.y] as Pt)), props: f.properties });
  }
  const out = tileBuildings(feats, tx, ty, layer.extent);
  kept.push(...out.kept);
  for (const [r, v] of Object.entries(out.dropped)) dropped[r] = (dropped[r] ?? 0) + v;
  // Draw it with the map style on a recording canvas context
  const calls: string[] = [];
  const ctx = new Proxy({} as CanvasRenderingContext2D, {
    get: (_t, p) => (typeof p === 'string' && /^(fill|stroke|moveTo|lineTo|beginPath|setTransform|fillRect|setLineDash)/.test(p) ? (...args: unknown[]) => { calls.push(p); void args; } : undefined),
    set: () => true,
  });
  try { drawTile(ctx, 512, prepare(vt), 15, 2, 0, 0); } catch { drawOk = false; }
  if (!calls.includes('fill') || !calls.includes('stroke')) drawOk = false;
}
check('Vector tiles round-trip through the decoder', decodeOk);
check('Map style draws decoded tiles (fills and strokes, over-zoomed)', drawOk);
check('Real buildings off the twin features are kept, with their OSM height', kept.length === 1 && Math.abs(kept[0].h - 31) < 1e-9, `kept ${kept.length}`);
check('Buildings on T14, the commuter line, the arena or the walkway are dropped',
  (dropped.rail ?? 0) + (dropped.station ?? 0) === (tT14 ? 2 : 1) && dropped.arena === 1 && dropped.walkway === 1, JSON.stringify(dropped));

const sq: Pt[] = [[-100, -100], [200, -100], [200, 200], [-100, 200]];
const cl = clipRing(sq, 100);
check('Building pieces are clipped to their tile (no overlap with neighbours)', cl.length === 4 && cl.every(([x, y]) => x >= 0 && x <= 100 && y >= 0 && y <= 100));
const holes = classify([[[0, 0], [10, 0], [10, 10], [0, 10]], [[2, 2], [2, 8], [8, 8], [8, 2]], [[20, 20], [30, 20], [30, 30], [20, 30]]]);
check('Rings group into polygons with holes', holes.length === 2 && holes[0].length === 2 && holes[1].length === 1);
check('Building zone covers Solna, the arena and Ålkistan', zoneR(TWINS.solna.pos) < 0.8 && zoneR(ARENA.pos) < 0.8 && zoneR(ALKISTAN) < 1 && zoneTiles().length <= 24, `${zoneTiles().length} data tiles`);

console.log('\n— Landmarks and building geometry');
const mallMark = LANDMARKS.find((x) => x.id === 'mall')!.pos;
const prisms = [
  { outer: [[mallMark.x - 50, mallMark.z - 50], [mallMark.x + 50, mallMark.z - 50], [mallMark.x + 50, mallMark.z + 50], [mallMark.x - 50, mallMark.z + 50]] as Pt[], holes: [], h: 24, base: 0, centroid: mallMark, area: 1e4, tint: null as string | null },
];
check('The building under a landmark marker is tinted', tintLandmarks(prisms, [{ pos: mallMark, kind: 'retail' }]) === 1 && prisms[0].tint === 'retail');
// A 10 m cube with a 4 m courtyard: every wall faces away from the solid, the roof faces up
const cube = { outer: [[0, 0], [10, 0], [10, 10], [0, 10]] as Pt[], holes: [[[3, 3], [3, 7], [7, 7], [7, 3]] as Pt[]], h: 10, base: 0, centroid: { x: 5, z: 5 }, area: 84, tint: null };
const g = buildingGeometry([cube], 0);
const P = g.getAttribute('position'), N = g.getAttribute('normal');
let outward = true, ccw = true;
const va = new THREE.Vector3(), vb = new THREE.Vector3(), vc = new THREE.Vector3();
for (let t = 0; t < P.count; t += 3) {
  va.fromBufferAttribute(P, t); vb.fromBufferAttribute(P, t + 1); vc.fromBufferAttribute(P, t + 2);
  const nrm = new THREE.Vector3().fromBufferAttribute(N, t);
  const face = vb.clone().sub(va).cross(vc.clone().sub(va));
  if (face.dot(nrm) <= 0) ccw = false;
  if (nrm.y === 0) {
    const c = va.clone().add(vb).add(vc).divideScalar(3);
    // Probe 0.5 m along the normal: it must be outside the solid (outside the cube, or inside the courtyard)
    const q = c.clone().addScaledVector(nrm, 0.5);
    const outside = q.x < 0 || q.x > 10 || q.z < 0 || q.z > 10 || (q.x > 3 && q.x < 7 && q.z > 3 && q.z < 7);
    if (!outside) outward = false;
  } else if (nrm.y !== 1) outward = false;
}
check('Walls face outwards (also into courtyards) and roofs face up', outward);
check('Triangles wind counter-clockwise towards their normal (front faces)', ccw, `${P.count / 3} triangles`);


console.log('\n— Mall of Scandinavia landmark');
const mallArea = signedArea(MALL_RING), tracedArea = Math.abs(signedArea(MALL.footprint as [number, number][]));
check('Simplified footprint keeps the traced shape (area within 3%)', mallArea > 0 && Math.abs(mallArea - tracedArea) / tracedArea < 0.03, `${MALL_RING.length} corners, ${(mallArea / 1e3).toFixed(0)}k m²`);
const toSol = { x: TWINS.solna.pos.x - BILLBOARD.centre.x, z: TWINS.solna.pos.z - BILLBOARD.centre.z }, ls = Math.hypot(toSol.x, toSol.z);
const facing = (BILLBOARD.edge.out.x * toSol.x + BILLBOARD.edge.out.z * toSol.z) / ls;
check('Billboard sits on a long facade facing Solna station', facing > 0.5 && BILLBOARD.width >= 30 && BILLBOARD.width <= BILLBOARD.edge.len,
  `${BILLBOARD.width.toFixed(0)} × ${BILLBOARD.height} m, facing ${(Math.acos(facing) * 180 / Math.PI).toFixed(0)}° off the station`);
check('Billboard stays between the shop fronts and the roof', BILLBOARD.y - BILLBOARD.height / 2 >= MALL_H.podium && BILLBOARD.y + BILLBOARD.height / 2 <= MALL_H.total);
const mSize = Math.min(70, ROOF_CENTRE.clearance * 1.5);
check("Roof 'M' fits on the roof", pointInRing(ROOF_CENTRE.p, MALL_RING) && letterM(mSize, mSize * 0.8).every(([x, y]) => pointInRing({ x: ROOF_CENTRE.p.x + x, z: ROOF_CENTRE.p.z - y }, MALL_RING)), `${mSize.toFixed(0)} m wide`);
const neon = neonSegments();
let neonOut = true;
for (const arr of [neon.bands, neon.zigzag]) for (let i = 0; i < arr.length; i += 3) if (pointInRing({ x: arr[i], z: arr[i + 2] }, MALL_RING)) neonOut = false;
check('Neon lines run just outside the walls', neonOut && neon.zigzag.length > 0, `${neon.bands.length / 6} band and ${neon.zigzag.length / 6} chevron segments on ${MALL_EDGES.length} facades`);
{
  const c = ROOF_CENTRE.p, t = localToTile(c, BUILDING_Z), tx = Math.floor(t.tx), ty = Math.floor(t.ty);
  const vt = new VectorTile(new PbfReader(encodeTile({ building: [{ type: 3, geom: [ring(c, 40, tx, ty)], props: { render_height: 20 } }] })));
  const f = vt.layers.building.feature(0);
  const r = tileBuildings([{ rings: f.loadGeometry().map((q) => q.map((p) => [p.x, p.y] as Pt)), props: f.properties }], tx, ty, 4096);
  check('Generic OSM blocks of the mall are replaced by the landmark model', r.kept.length === 0 && r.dropped.mall === 1);
}

console.log(`\n${failed === 0 ? 'All tests passed.' : `${failed} test(s) failed.`}`);
process.exit(failed === 0 ? 0 : 1);

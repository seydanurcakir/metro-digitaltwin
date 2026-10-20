// Tests for Strawberry Arena, the event crowd flow to Solna (Scenario 2) and the context layer.
// Run: npm run test:arena
import { haversine, hhmmToSec, toLocal, STATION_GEO } from '../src/index';
import { SIMULATED_EVENT, STRAWBERRY_ARENA } from '../src/data/arena';
import { CORRIDOR_EVENT_PLAN, CITYBANAN_OTHER, CORRIDOR_SOLNA } from '../src/data/corridor-solna';
import { arenaStateAt, arenaSurges, buildArenaFlow, egressShares } from '../src/network/arena';
import { getCorridor } from '../app/twin/network';
import { eventMetrics } from '../app/twin/arena';
import { ARENA, TWINS, WALKWAY, WALKWAY_LENGTH_M } from '../app/twin/world';
import { BLOCKS, EXTENT, LANDMARKS, MALL, PARK, SOLNA_MAP, TREES, blockClashes, inPolygon } from '../app/twin/context';

let failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? '✔' : '✘'} ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) failed++;
};
const rel = (a: number, b: number) => Math.abs(a - b) / Math.max(1, Math.abs(b));
const A = STRAWBERRY_ARENA;

console.log('\n— Placement');
const g = A.geo.value, s = STATION_GEO.solna;
check('Arena lies north-west of Solna station', g.lat > s.lat && g.lon < s.lon, `${haversine(g, s).toFixed(0)} m apart`);
const dx = ARENA.pos.x - TWINS.solna.pos.x, dz = ARENA.pos.z - TWINS.solna.pos.z;
check('Map position matches the published coordinates', Math.abs(Math.hypot(dx, dz) - haversine(g, s)) / haversine(g, s) < 0.005);
check('Walkway joins the arena to the Solna footbridge', Math.hypot(WALKWAY[0].x - ARENA.pos.x, WALKWAY[0].z - ARENA.pos.z) < ARENA.a + 10
  && Math.hypot(WALKWAY[WALKWAY.length - 1].x - TWINS.solna.pos.x, WALKWAY[WALKWAY.length - 1].z - TWINS.solna.pos.z) < 150);
check('Drawn walkway length is close to the published walk (±15%)', rel(WALKWAY_LENGTH_M, A.walkway.lengthM.value) < 0.15, `${WALKWAY_LENGTH_M.toFixed(0)} m vs ${A.walkway.lengthM.value} m`);

console.log('\n— Context layer (static, traced from the reference map)');
const area = (pts: [number, number][]) => Math.abs(pts.reduce((a, p, i) => { const q = pts[(i + 1) % pts.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
const inAny = (p: { x: number; z: number }, layer: { pts: [number, number][] }[]) => layer.some((a) => inPolygon(p, a.pts));
check('Representative blocks generated', BLOCKS.length > 150, `${BLOCKS.length} blocks`);
check('No block on the railway, arena, walkway, mall, landmarks, water, parks or roads', BLOCKS.every((b) => blockClashes(b) === null));
check('Every landmark lies inside the mapped area', LANDMARKS.every((l) => l.pos.x >= EXTENT.x0 && l.pos.x <= EXTENT.x1 && l.pos.z >= EXTENT.z0 && l.pos.z <= EXTENT.z1));
const ids = new Set(LANDMARKS.map((l) => l.id));
check('Key landmarks placed', ['mall', 'filmstaden', 'winery', 'comfort-hotel', 'hagastrand', 'rastasjon', 'brunnsviken', 'e4', 'e18'].every((id) => ids.has(id)));
const mallA = area(MALL.footprint);
check('Mall of Scandinavia footprint traced (plausible size)', mallA > 60_000 && mallA < 130_000, `${(mallA / 1e3).toFixed(0)}k m²`);
const mallL = LANDMARKS.find((l) => l.id === 'mall')!;
check('Mall marker sits on the mall footprint', inPolygon(mallL.pos, MALL.footprint));
check('Mall lies between the arena and Solna station (south-east of the arena)', mallL.pos.z > ARENA.pos.z - 50 && mallL.pos.x < TWINS.solna.pos.x);
const lake = toLocal({ lat: 59.37222, lon: 17.98889 });
check('Råstasjön traced at its published position', inAny(lake, SOLNA_MAP.water));
check('Brunnsviken traced east of the E4', inAny(LANDMARKS.find((l) => l.id === 'brunnsviken')!.pos, SOLNA_MAP.water));
check('Arena and walkway are not in water', !inAny(ARENA.pos, SOLNA_MAP.water) && WALKWAY.every((p) => !inAny(p, SOLNA_MAP.water)));
check('Motorway and road layers traced', SOLNA_MAP.motorway.length >= 3 && SOLNA_MAP.roads.length > 100, `${SOLNA_MAP.motorway.length} motorway areas, ${SOLNA_MAP.roads.length} road lines`);
const park = LANDMARKS.find((l) => l.id === 'vasalundsparken')!, parkGeo = toLocal({ lat: 59.36831, lon: 18.00208 });
check('Vasalundsparken at its published point, with a traced outline', Math.hypot(park.pos.x - parkGeo.x, park.pos.z - parkGeo.z) < 1e-6 && PARK !== null, PARK ? `${(area(PARK.pts) / 1e3).toFixed(0)}k m²` : 'no outline');
check('Park trees stay inside the park', PARK !== null && TREES.length > 20 && TREES.every((t) => inPolygon(t, PARK!.pts)), `${TREES.length} trees`);
const walkPts: { x: number; z: number }[] = [];
for (let i = 1; i < WALKWAY.length; i++) {
  const a = WALKWAY[i - 1], c = WALKWAY[i], n = Math.ceil(Math.hypot(c.x - a.x, c.z - a.z) / 4);
  for (let k = 0; k <= n; k++) walkPts.push({ x: a.x + ((c.x - a.x) * k) / n, z: a.z + ((c.z - a.z) * k) / n });
}
const inBox = (p: { x: number; z: number }, f: { x: number; z: number; w: number; d: number; rotY: number }, m: number) => {
  const dx = p.x - f.x, dz = p.z - f.z, c = Math.cos(f.rotY), s = Math.sin(f.rotY);
  return Math.abs(dx * c - dz * s) < f.w / 2 + m && Math.abs(dx * s + dz * c) < f.d / 2 + m;
};
check('Walkway stays clear of the mall and every landmark building (4 m margin)', walkPts.every((p) => !inPolygon(p, MALL.footprint) && LANDMARKS.every((l) => !l.building || !inBox(p, l.building, 4))));
for (const l of LANDMARKS.filter((x) => x.building)) {
  const why = blockClashes(l.building!);
  console.log(`  · ${l.name}: nearest feature ${why ?? 'none'}`);
}

console.log('\n— Crowd flow');
const sh = egressShares(A.egressP90Min.value);
let acc = 0, p90 = 0;
for (let k = 0; k < sh.length; k++) { acc += sh[k]; if (acc >= 0.9 && !p90) p90 = k + 1; }
check('Egress curve sums to 1 and 90% leave on time', Math.abs(sh.reduce((a, b) => a + b, 0) - 1) < 1e-9 && Math.abs(p90 - A.egressP90Min.value) <= 1, `90% after ${p90} min`);
const f = buildArenaFlow(A, SIMULATED_EVENT);
check('Rail-bound crowd = attendance × rail share', rel(f.railFans, SIMULATED_EVENT.attendance.value * A.railShare.value) < 1e-6, `${Math.round(f.railFans)}`);
check('Everyone bound for rail reaches the station', rel(f.arrivals.reduce((a, b) => a + b, 0), f.railFans) < 1e-9);
check('Walkway never carries more than its capacity', f.walkIn.every((x) => x <= f.capacityPerBin + 1e-9), `${Math.round(f.capacityPerBin)} people/min`);
check('Queue never negative', f.queue.every((q) => q >= 0));
const surges = arenaSurges(f, A.southShare.value);
check('Surges at Solna add up to the rail-bound crowd', rel(surges.reduce((a, x) => a + x.passengers, 0), f.railFans) < 1e-9 && surges.every((x) => x.stationId === 'solna'));
const end = hhmmToSec(SIMULATED_EVENT.end);
let conserved = true;
for (let t = end; t < end + 3 * 3600; t += 120) {
  const st = arenaStateAt(f, SIMULATED_EVENT, t);
  const railLeft = st.queue + st.onWalkway + st.atStation;
  const expected = Math.min(f.railFans, st.left * A.railShare.value);
  if (Math.abs(railLeft - expected) > 1) conserved = false;
}
check('Live state conserves people (queue + walking + at station = rail-bound who left)', conserved);
check('Arena full during the event', rel(arenaStateAt(f, SIMULATED_EVENT, hhmmToSec('20:00')).inside, SIMULATED_EVENT.attendance.value) < 1e-6);
check('Arena empty and cleared 2 h after the end', arenaStateAt(f, SIMULATED_EVENT, end + 7200).phase === 'cleared');

console.log('\n— Simulation at Solna');
const solOrder = CORRIDOR_SOLNA.stations.find((x) => x.id === 'solna')!.order;
const boarded = (sc: 'normal' | 'match' | 'match-plus') => getCorridor('current', sc).result.events.filter((e) => e.stationOrder === solOrder).reduce((a, e) => a + e.boarded, 0);
const extra = boarded('match') - boarded('normal');
check('Match day adds the rail-bound crowd to Solna boardings', rel(extra, f.railFans) < 0.02, `+${Math.round(extra)}`);
check('Extra-train plan respects Citybanan (≤ 16 commuter trains/h)', CORRIDOR_EVENT_PLAN.slots.every((x) => 60 / x.headwayMin + CITYBANAN_OTHER.trainsPerHourBySlot[x.slotIndex] <= 16 + 1e-9));
const mA = eventMetrics('current', 'match')!, mB = eventMetrics('current', 'match-plus')!;
check('Extra trains clear the crowd faster', (mB.dispersionSec ?? Infinity) < (mA.dispersionSec ?? Infinity), `${mA.dispersionSec == null ? '> 3 h' : Math.round(mA.dispersionSec / 60) + ' min'} → ${Math.round((mB.dispersionSec ?? 0) / 60)} min`);
check('Extra trains lower the platform peak', mB.peakDensity < mA.peakDensity, `${mA.peakDensity.toFixed(2)} → ${mB.peakDensity.toFixed(2)} people/m²`);
check('No event metrics without an event', eventMetrics('current', 'normal') === null);

console.log(`\n${failed === 0 ? 'All tests passed.' : `${failed} test(s) failed.`}`);
process.exit(failed === 0 ? 0 : 1);

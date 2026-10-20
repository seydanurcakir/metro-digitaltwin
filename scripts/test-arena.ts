// Tests for Strawberry Arena, the event crowd flow to Solna (Scenario 2) and the context layer.
// Run: npm run test:arena
import { haversine, hhmmToSec, toLocal, STATION_GEO } from '../src/index';
import { SIMULATED_EVENT, STRAWBERRY_ARENA } from '../src/data/arena';
import { CORRIDOR_EVENT_PLAN, CITYBANAN_OTHER, CORRIDOR_SOLNA } from '../src/data/corridor-solna';
import { arenaStateAt, arenaSurges, buildArenaFlow, egressShares } from '../src/network/arena';
import { getCorridor } from '../app/twin/network';
import { eventMetrics } from '../app/twin/arena';
import { ARENA, TWINS, WALKWAY, WALKWAY_LENGTH_M } from '../app/twin/world';
import { BLOCKS, HOTEL, LANDMARKS, blockClashes } from '../app/twin/context';

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

console.log('\n— Context layer');
check('Representative blocks generated', BLOCKS.length > 150, `${BLOCKS.length} blocks`);
check('No block on the railway, arena, walkway, park, mall area or hotel', BLOCKS.every((b) => blockClashes(b) === null));
const hotelReason = blockClashes({ ...HOTEL });
check('Hotel clear of railway, arena and walkway', hotelReason === 'hotel', `nearest feature: ${hotelReason}`);
check('Landmarks are near Solna (within 1.2 km)', LANDMARKS.every((l) => Math.hypot(l.pos.x - TWINS.solna.pos.x, l.pos.z - TWINS.solna.pos.z) < 1200));
const park = LANDMARKS.find((l) => l.id === 'vasalundsparken')!, parkGeo = toLocal({ lat: 59.36831, lon: 18.00208 });
check('Vasalundsparken at its published point', Math.hypot(park.pos.x - parkGeo.x, park.pos.z - parkGeo.z) < 1e-6);

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

// Tests for the app calculation layer (the pure functions the scene and panels read) and a per-frame cost check.
// Run: npm run test:app
import { computeKpis, hhmmToSec, SLOTS, type Direction } from '../src/index';
import { DATASET, FOCUS_STATION_ID, SCENARIOS, UI_PLANS, getResult, type ScenarioId } from '../app/twin/model';
import { getCorridor } from '../app/twin/network';
import { buildStationView, platformAt, trainsAt, nextArrivals } from '../app/twin/selectors';
import { tripDetail, sideDetail, escalatorDetail } from '../app/twin/inspect';
import { p90Series, planMetrics, solnaMetrics, trainsOnLine, verdict } from '../app/twin/metrics';
import { LINES, TWINS, MAP_STATIONS, BOUNDS, type TwinDef } from '../app/twin/world';
import { trainPose, TRACK_OFFSET_M } from '../app/twin/trainpose';

let failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? '✔' : '✘'} ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) failed++;
};

const POOL = 6; // train pool in app/scene/Trains.tsx
const T0 = hhmmToSec('05:00'), T1 = hhmmToSec('01:00');

/** Station-frame point → world (same transform as the scene group) */
const toWorld = (tw: TwinDef, x: number, z: number) => {
  const c = Math.cos(tw.rotY), s = Math.sin(tw.rotY);
  return { x: tw.pos.x + x * c + z * s, z: tw.pos.z - x * s + z * c };
};

console.log('\n— World');
check('Every map station lies inside the pan bounds', MAP_STATIONS.every((s) => s.pos.x > BOUNDS.x0 && s.pos.x < BOUNDS.x1 && s.pos.z > BOUNDS.z0 && s.pos.z < BOUNDS.z1));
for (const tw of Object.values(TWINS)) {
  const L = LINES[tw.line];
  const end = toWorld(tw, 100, 0);
  const p = L.al.arcOf[tw.stationId];
  check(`${tw.name}: model axis follows the line on the map`, Math.abs(Math.hypot(end.x - tw.pos.x, end.z - tw.pos.z) - 100) < 1e-6 && p === tw.arc);
  check(`${tw.name}: twin zone fits inside the straight section`, tw.layout.zoneHalf <= 280 && tw.layout.zoneHalf > tw.layout.platformLength / 2);
}

for (const plan of UI_PLANS) {
  for (const sc of Object.keys(SCENARIOS) as ScenarioId[]) {
    const r = getResult(plan.id, sc);
    const cv = getCorridor(plan.id, sc);
    console.log(`\n[${plan.label} · ${SCENARIOS[sc].name}]`);
    for (const tw of Object.values(TWINS)) {
      const ds = tw.line === 'T14' ? DATASET : cv.corridor.ds;
      const res = tw.line === 'T14' ? r : cv.result;
      const opts = tw.line === 'T14' ? SCENARIOS[sc].options : cv.opts;
      const v = buildStationView(ds, res, tw.stationId, opts);
      const L = LINES[tw.line];
      const lay = tw.layout;

      // Platform count equals the simulated queue at every train event, never negative
      let maxErr = 0, minVal = Infinity;
      for (const e of v.events) {
        const p = platformAt(v, e.t);
        maxErr = Math.max(maxErr, Math.abs(p.total - e.platformAfter));
        const before = platformAt(v, e.t - 0.001);
        minVal = Math.min(minVal, before.north, before.south);
      }
      check(`${tw.name}: platform count matches the simulation at train events`, maxErr < 1e-6, `max diff ${maxErr.toExponential(1)}`);
      check(`${tw.name}: platform count never negative`, minVal >= -1e-9);

      // Trains: stopped trains inside the platform; never more visible than the pool
      let inside = true, maxVisible = 0, seamless = true, exclusive = true;
      for (let t = T0; t < T1; t += 5) {
        const trs = trainsAt(v, lay, L, tw.arc, t);
        maxVisible = Math.max(maxVisible, trs.length);
        for (const tr of trs) {
          if (tr.phase === 'stopped' && Math.abs(tr.x) + tr.length / 2 > lay.platformLength / 2 + 1e-6) inside = false;
          // The detailed train and the map pose describe the same place
          const trip = v.trips.get(tr.tripId)!;
          const mp = trainPose(tw.line, trip, t)!;
          if (!mp.inTwin) exclusive = false;
          const w = toWorld(tw, tr.x, tr.z);
          const along = (w.x - mp.x) * Math.cos(mp.yaw) - (w.z - mp.z) * Math.sin(mp.yaw);
          const lateral = Math.hypot(w.x - mp.x, w.z - mp.z);
          if (Math.abs(along) > 1e-6 || Math.abs(lateral - Math.abs(Math.abs(tr.z) - TRACK_OFFSET_M)) > 1e-6) seamless = false;
        }
      }
      check(`${tw.name}: stopped trains stay within the platform`, inside);
      check(`${tw.name}: visible trains ≤ pool (${POOL})`, maxVisible <= POOL, `max ${maxVisible}`);
      check(`${tw.name}: twin trains and map trains never overlap (handover at the zone edge)`, exclusive);
      check(`${tw.name}: twin and map agree on train position along the line`, seamless);

      // Selected train always moves forward along its line
      const t8 = hhmmToSec('08:05');
      const call = v.calls.find((c) => c.arrive > t8)!;
      let lastPos = -1, mono = true;
      for (let t = call.arrive - 1200; t < call.arrive + 1200; t += 20) {
        const d = tripDetail(L, ds, res, call.tripId, t, tw.stationId)!;
        const pos = d.where.kind === 'before' ? -1 : d.where.kind === 'done' ? 99 : d.where.kind === 'at' ? d.where.index : d.where.fromIndex + 0.5 + 0.49 * d.where.progress;
        if (pos < lastPos) mono = false;
        lastPos = pos;
      }
      check(`${tw.name}: selected train always moves forward`, mono);
    }

    // Metrics layer equals the reference calculation
    const t8 = hhmmToSec('08:05');
    const m = planMetrics(plan.id, sc, 'am', 'station', t8);
    const ref = computeKpis(DATASET, r, { fromSec: hhmmToSec('07:30'), toSec: hhmmToSec('08:30'), stationId: FOCUS_STATION_ID });
    check('Window metrics equal computeKpis', m.dispersionP90Sec === ref.dispersionP90Sec && Math.abs(m.avgWaitSec - ref.avgWaitSec) < 1e-9);
    const series = p90Series(plan.id, sc, 'line');
    const slow = SLOTS.filter((_, i) => i % 9 === 0).map((s) => computeKpis(DATASET, r, { fromSec: s.startMin * 60, toSec: s.startMin * 60 + 900 }).dispersionP90Sec);
    check('Day P90 series equals the reference', SLOTS.filter((_, i) => i % 9 === 0).every((s, k) => series[s.index] === slow[k]));
    const sm = solnaMetrics(plan.id, sc, t8);
    const k = cv.series[Math.floor((t8 - T0) / 900)];
    check('Solna KPI strip equals the station agent series', sm.p90WaitSec === k.p90WaitSec && sm.densityMax === k.densityMax);
  }
}

console.log('\n— General');
check('Verdict: smaller is better', verdict('dispersionP90Sec', 300, 240) === 'better' && verdict('unitTrips', 100, 120) === 'worse' && verdict('peakLoadFactor', 0.5, 0.501) === 'same');

// Per-frame cost: scene selectors (every frame) + panel calculations (every simulated second)
const r = getResult('current', 'surge');
const cv = getCorridor('current', 'surge');
const vT = buildStationView(DATASET, r, FOCUS_STATION_ID, SCENARIOS.surge.options);
const vS = buildStationView(cv.corridor.ds, cv.result, 'solna', cv.opts);
const t0 = hhmmToSec('21:05');
const N = 1000;
let a = performance.now();
for (let i = 0; i < N; i++) {
  const t = t0 + i * 0.25;
  trainsAt(vT, TWINS.tc.layout, LINES.T14, TWINS.tc.arc, t); platformAt(vT, t);
  trainsAt(vS, TWINS.solna.layout, LINES.PENDEL, TWINS.solna.arc, t); platformAt(vS, t);
  for (const trip of r.trips) if (t >= trip.stops[0].t && t <= trip.stops[trip.stops.length - 1].t) trainPose('T14', trip, t);
  for (const trip of cv.result.trips) if (t >= trip.stops[0].t && t <= trip.stops[trip.stops.length - 1].t) trainPose('PENDEL', trip, t);
}
const sceneMs = (performance.now() - a) / N;
a = performance.now();
for (let i = 0; i < 200; i++) {
  const t = t0 + i;
  const call = vT.calls.find((c) => c.depart >= t)!;
  tripDetail(LINES.T14, DATASET, r, call.tripId, t, FOCUS_STATION_ID);
  sideDetail(DATASET, LINES.T14, vT, 'south' as Direction, t);
  escalatorDetail(vT, TWINS.tc.escalatorNames[0], 2, t);
  nextArrivals(vT, t);
  planMetrics('current', 'surge', 'slot', 'station', t);
  planMetrics('sample-candidate', 'surge', 'slot', 'line', t);
  solnaMetrics('current', 'surge', t);
  trainsOnLine(r, t);
}
const hudMs = (performance.now() - a) / 200;
console.log(`  Scene selectors (both twins + all map trains): ${sceneMs.toFixed(3)} ms/frame · Panels: ${hudMs.toFixed(2)} ms/update`);
check('Calculations stay far below the 60 FPS budget (16.7 ms)', sceneMs + hudMs < 4, `${(sceneMs + hudMs).toFixed(2)} ms`);

console.log(`\n${failed === 0 ? 'All tests passed.' : `${failed} test(s) failed.`}`);
process.exit(failed === 0 ? 0 : 1);

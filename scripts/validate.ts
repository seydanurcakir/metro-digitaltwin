// Consistency tests and summary report for the data model.
// Run: npm run validate
import {
  buildDataset, cycleTimeMin, unitsRequired, trainCapacity, SLOTS, slotIndexAt,
  type Direction, type ServicePlan, type TwinDataset,
} from '../src/index';
import { dailyLineBoardings } from '../src/data/demand';

let failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? '✔' : '✘'} ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) failed++;
};
const near = (a: number, b: number, tol = 1e-6) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));

const ds: TwinDataset = buildDataset();
const { line, demand, constraints, fleet, otherLine } = ds;

console.log('\n— Structure');
check('19 stations', line.stations.length === 19);
check('Order numbers run 0..18 consecutively', line.stations.every((s, i) => s.order === i));
check('18 sections linking consecutive stations',
  line.segments.length === 18 && line.segments.every((g, i) => g.from === line.stations[i].id && g.to === line.stations[i + 1].id));
check('Only the two end stations are terminals', line.stations.filter((s) => s.isTerminal).map((s) => s.name).join(',') === 'Fruängen,Mörby centrum');
check('Shared trunk has 8 stations (Liljeholmen–Östermalmstorg)', line.stations.filter((s) => s.onTrunk).length === 8);
check('80 slots (05:00–01:00, 15 min)', SLOTS.length === 80 && SLOTS[0].label === '05:00' && SLOTS[79].label === '00:45');
check('slotIndexAt("08:00") = 12', slotIndexAt('08:00') === 12);

console.log('\n— Source traceability');
const refs = new Set(ds.sources.map((s) => s.id));
const allSrc = [
  ...line.stations.flatMap((s) => [s.boardingsPerDay.src, s.lineShare.src, s.dwellSec.src, s.platform.usableAreaM2.src, s.platform.areaShareByDirection.src, s.platform.lengthM.src]),
  ...line.segments.map((g) => g.runTimeSec.src),
  line.turnaroundSec.src, line.trunk.maxTrainsPerHour.src,
  fleet.unitType.seats.src, fleet.unitType.standing.src, fleet.unitType.lengthM.src, fleet.allowedUnitsPerTrain.src, fleet.unitsAvailable.src,
  demand.src, demand.profile.src, demand.directionalBias.src, otherLine.src,
  ...ds.plans.map((p) => p.src),
  ...Object.values(constraints).map((c) => c.src),
];
check('Every number has a defined source', allSrc.every((s) => refs.has(s.ref)), `${allSrc.length} source links`);
const byKind = allSrc.reduce<Record<string, number>>((a, s) => ((a[s.kind] = (a[s.kind] ?? 0) + 1), a), {});
console.log('  by kind:', byKind);

console.log('\n— Demand');
const prof = demand.profile;
check('Time-of-day shares sum to 1', near(prof.shares.reduce((a, b) => a + b, 0), 1));
check('Shares are non-negative', prof.shares.every((x) => x >= 0));
const daily = dailyLineBoardings(line);
const perStation: Record<string, number> = {};
for (const c of demand.cells) perStation[c.stationId] = (perStation[c.stationId] ?? 0) + c.arrivals;
check('Daily demand per station = boardings × T14 share',
  line.stations.every((s) => near(perStation[s.id], daily[s.id], 1e-9)));
check('Fruängen only northbound, Mörby centrum only southbound',
  !demand.cells.some((c) => (c.stationId === 'fruangen' && c.direction === 'south') || (c.stationId === 'morby-centrum' && c.direction === 'north')));
check('Destination shares sum to 1 in every row',
  demand.od.every((r) => near(Object.values(r.destinationShares).reduce((a, b) => a + b, 0), 1)));
check('Destinations match the direction',
  demand.od.every((r) => {
    const o = line.stations.find((s) => s.id === r.originId)!.order;
    return Object.keys(r.destinationShares).every((d) => {
      const dOrder = line.stations.find((s) => s.id === d)!.order;
      return r.direction === 'north' ? dOrder > o : dOrder < o;
    });
  }));
const totalDaily = Object.values(daily).reduce((a, b) => a + b, 0);
const peakSlot = prof.shares.indexOf(Math.max(...prof.shares));
console.log(`  T14 total daily boardings: ${Math.round(totalDaily).toLocaleString('en-US')}`);
console.log(`  Busiest slot: ${SLOTS[peakSlot].label} (${(prof.shares[peakSlot] * 100).toFixed(2)}% of the day)`);

// Passenger flow per section in one direction during a slot (people/hour): simple static flow calculation.
const linkFlowsPerHour = (slot: number, dir: Direction): number[] => {
  const n = line.stations.length;
  const flows = new Array(n - 1).fill(0);
  for (const c of demand.cells.filter((x) => x.slotIndex === slot && x.direction === dir)) {
    const o = line.stations.find((s) => s.id === c.stationId)!.order;
    const row = demand.od.find((r) => r.period === demand.periodBySlot[slot] && r.originId === c.stationId && r.direction === dir)!;
    for (const [dId, share] of Object.entries(row.destinationShares)) {
      const d = line.stations.find((s) => s.id === dId)!.order;
      const [a, b] = dir === 'north' ? [o, d] : [d, o];
      for (let k = a; k < b; k++) flows[k] += c.arrivals * share * (60 / prof.slotMinutes);
    }
  }
  return flows;
};

console.log('\n— Plans');
const cyc = cycleTimeMin(line);
console.log(`  Cycle time (both directions + turnarounds): ${cyc.toFixed(1)} min`);
const checkPlan = (plan: ServicePlan) => {
  console.log(`\n  [${plan.name}]`);
  check('  All 80 slots defined', plan.slots.length === 80 && plan.slots.every((p, i) => p.slotIndex === i));
  check('  Headway within limits',
    plan.slots.every((p) => p.headwayMin >= constraints.minHeadwayMin.value && p.headwayMin <= constraints.maxHeadwayMin.value));
  check('  Train length allowed (2 or 3 units)', plan.slots.every((p) => fleet.allowedUnitsPerTrain.value.includes(p.unitsPerTrain)));
  const trunkOver = plan.slots.filter((p) => 60 / p.headwayMin + otherLine.trainsPerHourBySlot[p.slotIndex] > line.trunk.maxTrainsPerHour.value);
  check('  Shared trunk capacity (T13 + T14 ≤ 24 trains/h)', trunkOver.length === 0, trunkOver.length ? `${trunkOver.length} slots over` : '');
  const maxUnits = Math.max(...plan.slots.map((p) => unitsRequired(line, plan, p.slotIndex)));
  check('  Fleet is sufficient', maxUnits <= fleet.unitsAvailable.value, `max ${maxUnits} / ${fleet.unitsAvailable.value} units`);

  // Static capacity report: load factor on the busiest section (average flow, not simulation)
  let worst = { lf: 0, slot: 0, dir: 'north' as Direction, link: 0 };
  for (const s of SLOTS) for (const dir of ['north', 'south'] as Direction[]) {
    const f = linkFlowsPerHour(s.index, dir);
    const p = plan.slots[s.index];
    const capPerHour = (60 / p.headwayMin) * trainCapacity(p.unitsPerTrain, fleet);
    f.forEach((v, k) => { const lf = v / capPerHour; if (lf > worst.lf) worst = { lf, slot: s.index, dir, link: k }; });
  }
  const a = line.stations[worst.link].name, b = line.stations[worst.link + 1].name;
  console.log(`    Highest average load: ${(worst.lf * 100).toFixed(0)}% — ${SLOTS[worst.slot].label}, ${worst.dir === 'north' ? 'northbound' : 'southbound'}, ${a} → ${b}`);
};
ds.plans.forEach(checkPlan);

console.log(`\n${failed === 0 ? 'All tests passed.' : `${failed} test(s) failed.`}`);
process.exit(failed === 0 ? 0 : 1);

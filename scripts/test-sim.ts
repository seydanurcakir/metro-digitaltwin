// Simulation engine tests and comparison report. Run: npm run sim
import {
  buildDataset, simulate, computeKpis, hhmmToSec, SLOTS,
  type Kpis, type ServicePlan, type SimResult, type TwinDataset,
} from '../src/index';

let failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? '✔' : '✘'} ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) failed++;
};
const rel = (a: number, b: number) => Math.abs(a - b) / Math.max(1, Math.abs(b));
const fmt = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;

const ds: TwinDataset = buildDataset();
const current = ds.plans.find((p) => p.id === 'current')!;
const sample = ds.plans.find((p) => p.id === 'sample-candidate')!;
const allDay5: ServicePlan = {
  id: 'all-day-5', name: 'Every 5 min all day, long trains', kind: 'candidate',
  slots: SLOTS.map((s) => ({ slotIndex: s.index, headwayMin: 5, unitsPerTrain: 3 })),
  src: { kind: 'assumption', ref: 'assumption', note: 'Test: upper-bound plan' },
};

const t0 = performance.now();
const base = simulate(ds, current);
const ms = performance.now() - t0;

console.log('\n— Conservation and physics');
check('Arrived = boarded + waiting at close', rel(base.totals.arrived, base.totals.boarded + base.totals.unservedAtClose) < 1e-6,
  `${Math.round(base.totals.arrived)} = ${Math.round(base.totals.boarded)} + ${Math.round(base.totals.unservedAtClose)}`);
check('Boarded = alighted (everyone gets off somewhere)', rel(base.totals.alighted, base.totals.boarded) < 1e-6);
check('Boarded never exceeds arrived', base.totals.boarded <= base.totals.arrived + 1e-6);
check('Train load never exceeds capacity', base.events.every((e) => e.loadAfter <= e.capacity + 1e-6));
check('Waiting times are non-negative', Array.from(base.waits.waitSec).every((w) => w >= 0));
check('Few passengers still waiting at close (arrived after the last train)', base.totals.unservedAtClose < 0.002 * base.totals.arrived,
  `${Math.round(base.totals.unservedAtClose)} people`);
check('Daily arrivals ≈ demand in the data model', rel(base.totals.arrived, ds.demand.cells.reduce((a, c) => a + c.arrivals, 0)) < 1e-6);

console.log('\n— Behaviour');
const roomy = simulate(ds, current, { boardingLimitFactor: 100 });
const maxWait = Math.max(...Array.from(roomy.waits.waitSec));
check('With unlimited capacity, wait ≤ longest headway', maxWait <= 10 * 60 + 30, `longest ${fmt(maxWait)}`);
check('With unlimited capacity, nobody is left behind', roomy.events.every((e) => e.leftBehind < 1e-6));
const again = simulate(ds, current);
check('Same input → same output (deterministic)', JSON.stringify(computeKpis(ds, again)) === JSON.stringify(computeKpis(ds, base)));
const k5 = computeKpis(ds, simulate(ds, allDay5));
const kb = computeKpis(ds, base);
check('More frequent service → average wait does not grow', k5.avgWaitSec <= kb.avgWaitSec + 1e-9, `${fmt(kb.avgWaitSec)} → ${fmt(k5.avgWaitSec)}`);
const stress = simulate(ds, current, { demandMultiplier: 3 });
const ks = computeKpis(ds, stress);
check('Demand ×3 → passengers get left behind', ks.leftBehind > 0, `${Math.round(ks.leftBehind)} person-times`);
check('Demand ×3 → dispersion time grows', ks.dispersionP90Sec > kb.dispersionP90Sec, `${fmt(kb.dispersionP90Sec)} → ${fmt(ks.dispersionP90Sec)}`);
const surgeStart = hhmmToSec('21:00');
const surge = simulate(ds, current, { surges: [{ stationId: 't-centralen', direction: 'south', startSec: surgeStart, endSec: surgeStart + 600, passengers: 3000 }] });
const winS = { fromSec: surgeStart, toSec: surgeStart + 600, stationId: 't-centralen' };
const ksur = computeKpis(ds, surge, winS);
const knos = computeKpis(ds, base, winS);
check('A sudden crowd (21:00, 3,000 people) lengthens dispersion time', ksur.dispersionP90Sec > knos.dispersionP90Sec,
  `${fmt(knos.dispersionP90Sec)} → ${fmt(ksur.dispersionP90Sec)}`);
check('The whole crowd is carried', rel(surge.totals.boarded + surge.totals.unservedAtClose, surge.totals.arrived) < 1e-6 && surge.totals.unservedAtClose < base.totals.unservedAtClose + 1);

console.log(`\nSimulation time: ${ms.toFixed(0)} ms (${base.trips.length} trips, ${base.events.length} stop events)`);

// — Report
const row = (name: string, k: Kpis) =>
  console.log(`  ${name.padEnd(32)} dispersion P90 ${fmt(k.dispersionP90Sec).padStart(5)} | avg wait ${fmt(k.avgWaitSec).padStart(5)} | peak load ${(k.peakLoadFactor * 100).toFixed(0).padStart(3)}% | platform ${k.maxPlatformDensity.toFixed(2)} people/m² | left behind ${Math.round(k.leftBehind)}`);

const plans: [ServicePlan, SimResult][] = [current, sample, allDay5].map((p) => [p, simulate(ds, p)]);
const am = { fromSec: hhmmToSec('07:30'), toSec: hhmmToSec('08:30') };
const mid = { fromSec: hhmmToSec('10:00'), toSec: hhmmToSec('14:00') };
for (const [title, f] of [['Whole day', {}], ['Morning peak 07:30–08:30', am], ['Midday 10:00–14:00', mid], ['T-Centralen, morning peak', { ...am, stationId: 't-centralen' }]] as const) {
  console.log(`\n${title}`);
  for (const [p, r] of plans) row(p.name, computeKpis(ds, r, f));
}

console.log('\nOperating cost (unit-trips departing during service hours)');
for (const [p, r] of plans) {
  const unitTrips = r.trips.filter((t) => t.departSec >= hhmmToSec('05:00')).reduce((a, t) => a + t.units, 0);
  console.log(`  ${p.name.padEnd(32)} ${unitTrips} unit-trips`);
}

console.log('\nSudden crowd example: 3,000 extra southbound passengers at T-Centralen, 21:00–21:10');
const evening = (headwayMin: number, unitsPerTrain: number, fromMin: number): ServicePlan => ({
  ...current, id: `evening-${headwayMin}-${unitsPerTrain}-${fromMin}`,
  slots: current.slots.map((s) => (SLOTS[s.slotIndex].startMin >= fromMin && SLOTS[s.slotIndex].startMin < 22 * 60 ? { ...s, headwayMin, unitsPerTrain } : s)),
});
const surgeOpt = { surges: [{ stationId: 't-centralen', direction: 'south' as const, startSec: surgeStart, endSec: surgeStart + 600, passengers: 3000 }] };
const winSurge = { fromSec: surgeStart, toSec: surgeStart + 2400, stationId: 't-centralen' };
const surgeRow = (label: string, p: ServicePlan) => {
  const r = simulate(ds, p, surgeOpt);
  const k = computeKpis(ds, r, winS);
  const dens = computeKpis(ds, r, winSurge).maxPlatformDensity;
  console.log(`  ${label.padEnd(34)} dispersion P90 ${fmt(k.dispersionP90Sec).padStart(5)} | peak platform ${dens.toFixed(2)} people/m²`);
  return dens;
};
console.log('  If the plan change starts at 20:45 (late):');
const late = [['Current: 10 min, short trains', current], ['5 min, long trains', evening(5, 3, 20 * 60 + 45)]] as const;
late.forEach(([l, p]) => surgeRow(l, p));
console.log('  If the plan change starts at 20:15 (one trip time earlier):');
const early = [['10 min, long trains', evening(10, 3, 20 * 60 + 15)], ['5 min, short trains', evening(5, 2, 20 * 60 + 15)], ['5 min, long trains', evening(5, 3, 20 * 60 + 15)]] as const;
const densEarly = early.map(([l, p]) => surgeRow(l, p));
const densLate = computeKpis(ds, simulate(ds, current, surgeOpt), winSurge).maxPlatformDensity;
check('Frequent service started early lowers the platform peak', densEarly[2] < densLate, `${densLate.toFixed(2)} → ${densEarly[2].toFixed(2)} people/m²`);

console.log('\nStations with the longest dispersion time in the morning peak (current timetable)');
const ranked = ds.line.stations
  .map((s) => ({ s, k: computeKpis(ds, plans[0][1], { ...am, stationId: s.id }) }))
  .sort((a, b) => b.k.dispersionP90Sec - a.k.dispersionP90Sec)
  .slice(0, 4);
for (const { s, k } of ranked) console.log(`  ${s.name.padEnd(20)} P90 ${fmt(k.dispersionP90Sec)} · platform ${k.maxPlatformDensity.toFixed(2)} people/m²`);

console.log(`\n${failed === 0 ? 'All tests passed.' : `${failed} test(s) failed.`}`);
process.exit(failed === 0 ? 0 : 1);

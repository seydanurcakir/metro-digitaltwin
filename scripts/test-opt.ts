// Tests of the recommended plans. Run: npm run test:opt
import { buildDataset, computeKpis, cycleTimeMin, hhmmToSec, simulate, type ServicePlan, type SimOptions } from '../src/index';
import { optimizePlan, planUnitTrips } from '../src/opt/optimize';

let failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? '✔' : '✘'} ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) failed++;
};
const fmt = (sec: number) => { const s = Math.round(sec); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

const ds = buildDataset();
const current = ds.plans.find((p) => p.id === 'current')!;
const budget = planUnitTrips(current);
const surgeStart = hhmmToSec('21:00');
const SURGE: SimOptions = { surges: [{ stationId: 't-centralen', direction: 'south', startSec: surgeStart, endSec: surgeStart + 600, passengers: 3000 }] };
const cases: [string, SimOptions][] = [['optimized', {}], ['optimized-event', SURGE]];

for (const [id, sim] of cases) {
  const plan = ds.plans.find((p) => p.id === id) as ServicePlan;
  console.log(`\n[${plan?.name ?? id}]`);
  check('Plan exists in the dataset with 80 slots', !!plan && plan.slots.length === 80);
  if (!plan) continue;
  const { constraints: c, fleet, line, otherLine } = ds;
  check('Headway within limits', plan.slots.every((s) => s.headwayMin >= c.minHeadwayMin.value && s.headwayMin <= c.maxHeadwayMin.value));
  check('Shared trunk ≤ 24 trains/h', plan.slots.every((s) => 60 / s.headwayMin + otherLine.trainsPerHourBySlot[s.slotIndex] <= line.trunk.maxTrainsPerHour.value + 1e-9));
  check('Fleet is sufficient', plan.slots.every((s) => Math.ceil(cycleTimeMin(line) / s.headwayMin) * s.unitsPerTrain <= fleet.unitsAvailable.value));
  check('Operating budget not exceeded', planUnitTrips(plan) <= budget + 1e-9, `${planUnitTrips(plan)} / ${budget} unit-trips`);

  const rc = simulate(ds, current, sim), ro = simulate(ds, plan, sim);
  const day = { a: computeKpis(ds, rc), b: computeKpis(ds, ro) };
  const eveF = { fromSec: hhmmToSec('20:30'), toSec: hhmmToSec('22:00'), stationId: 't-centralen' };
  const eve = { a: computeKpis(ds, rc, eveF), b: computeKpis(ds, ro, eveF) };
  check('Whole-day dispersion time no worse than the current timetable', day.b.dispersionP90Sec <= day.a.dispersionP90Sec, `${fmt(day.a.dispersionP90Sec)} → ${fmt(day.b.dispersionP90Sec)}`);
  check('Evening dispersion time at T-Centralen gets shorter', eve.b.dispersionP90Sec < eve.a.dispersionP90Sec, `${fmt(eve.a.dispersionP90Sec)} → ${fmt(eve.b.dispersionP90Sec)}`);
  check('Platform density below the safe limit', day.b.maxPlatformDensity <= c.platformDensityLimit.value, `${day.b.maxPlatformDensity.toFixed(2)} people/m²`);
  if (id === 'optimized') {
    check('On a normal day train load ≤ 90%', day.b.peakLoadFactor <= c.maxLoadFactor.value, `${Math.round(day.b.peakLoadFactor * 100)}%`);
    const again = optimizePlan(ds, { id, name: plan.name, sim });
    check('Optimisation is reproducible (same as the stored plan)', JSON.stringify(again.plan.slots) === JSON.stringify(plan.slots));
  } else {
    check('Event plan adds capacity before the crowd', plan.slots.some((s) => s.slotIndex >= 62 && s.slotIndex <= 64 && s.unitsPerTrain === 3),
      'long trains depart between 20:30 and 21:15');
  }
}

console.log(`\n${failed === 0 ? 'All tests passed.' : `${failed} test(s) failed.`}`);
process.exit(failed === 0 ? 0 : 1);

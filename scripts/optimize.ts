// Produces the recommended service plans and writes them to src/data/optimized-plans.json.
// Run: npm run optimize
import { writeFileSync } from 'node:fs';
import { buildDataset, computeKpis, hhmmToSec, simulate, SLOTS, type ServicePlan, type SimOptions } from '../src/index';
import { optimizePlan, planUnitTrips } from '../src/opt/optimize';

const ds = buildDataset();
const current = ds.plans.find((p) => p.id === 'current')!;
const surgeStart = hhmmToSec('21:00');
const SURGE: SimOptions = { surges: [{ stationId: 't-centralen', direction: 'south', startSec: surgeStart, endSec: surgeStart + 600, passengers: 3000 }] };

const bands = (p: ServicePlan) => {
  const out: string[] = [];
  let start = 0;
  for (let i = 1; i <= p.slots.length; i++) {
    const a = p.slots[start], b = p.slots[i];
    if (!b || b.headwayMin !== a.headwayMin || b.unitsPerTrain !== a.unitsPerTrain) {
      const end = i < SLOTS.length ? SLOTS[i].label : '01:00';
      out.push(`    ${SLOTS[start].label}–${end}  every ${String(a.headwayMin).padStart(4)} min · ${a.unitsPerTrain} units`);
      start = i;
    }
  }
  return out.join('\n');
};
const fmt = (sec: number) => { const s = Math.round(sec); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

const results: ServicePlan[] = [];
for (const [id, name, sim] of [
  ['optimized', 'Recommended plan', {}],
  ['optimized-event', 'Recommended plan (event)', SURGE],
] as const) {
  const t0 = performance.now();
  const rep = optimizePlan(ds, { id, name, sim });
  const ms = performance.now() - t0;
  results.push(rep.plan);
  console.log(`\n=== ${name} ===  (${ms.toFixed(0)} ms, ${rep.iterations} iterations)`);
  console.log(`  Budget ${rep.budgetUnitTrips} unit-trips, used ${rep.usedUnitTrips}`);
  console.log(bands(rep.plan));
  if (rep.tightenedSlots.length) console.log(`  Slots tightened after simulation: ${rep.tightenedSlots.map((s) => SLOTS[s].label).join(', ')}`);
  console.log(rep.remainingIssues.length ? `  Slots still over a limit: ${rep.remainingIssues.map((i) => `${i.label} (load ${Math.round(i.loadFactor * 100)}%, platform ${i.density.toFixed(2)})`).join('; ')}` : '  No remaining constraint violations.');
  const rc = simulate(ds, current, sim), ro = simulate(ds, rep.plan, sim);
  for (const [label, f] of [
    ['Whole day, whole line', {}],
    ['Whole day, T-Centralen', { stationId: 't-centralen' }],
    ['Evening 20:30–22:00, T-Centralen', { fromSec: hhmmToSec('20:30'), toSec: hhmmToSec('22:00'), stationId: 't-centralen' }],
  ] as const) {
    const a = computeKpis(ds, rc, f), b = computeKpis(ds, ro, f);
    console.log(`  ${label.padEnd(32)} P90 ${fmt(a.dispersionP90Sec)} → ${fmt(b.dispersionP90Sec)} | avg wait ${fmt(a.avgWaitSec)} → ${fmt(b.avgWaitSec)} | load ${Math.round(a.peakLoadFactor * 100)}% → ${Math.round(b.peakLoadFactor * 100)}% | platform ${a.maxPlatformDensity.toFixed(2)} → ${b.maxPlatformDensity.toFixed(2)}`);
  }
}
console.log(`\nCurrent timetable: ${planUnitTrips(current)} unit-trips`);
writeFileSync('src/data/optimized-plans.json', JSON.stringify(results, null, 1) + '\n');
console.log('Written: src/data/optimized-plans.json');

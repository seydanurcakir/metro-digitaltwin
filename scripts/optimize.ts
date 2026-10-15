// Önerilen sefer planlarını üretir ve src/data/optimized-plans.json dosyasına yazar.
// Çalıştır: npm run optimize
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
      out.push(`    ${SLOTS[start].label}–${end}  ${String(a.headwayMin).padStart(4)} dk · ${a.unitsPerTrain} ünite`);
      start = i;
    }
  }
  return out.join('\n');
};
const fmt = (sec: number) => { const s = Math.round(sec); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

const results: ServicePlan[] = [];
for (const [id, name, sim] of [
  ['optimized', 'Önerilen plan', {}],
  ['optimized-event', 'Önerilen plan (etkinlik)', SURGE],
] as const) {
  const t0 = performance.now();
  const rep = optimizePlan(ds, { id, name, sim });
  const ms = performance.now() - t0;
  results.push(rep.plan);
  console.log(`\n=== ${name} ===  (${ms.toFixed(0)} ms, ${rep.iterations} yineleme)`);
  console.log(`  Bütçe ${rep.budgetUnitTrips} ünite-sefer, kullanılan ${rep.usedUnitTrips}`);
  console.log(bands(rep.plan));
  if (rep.tightenedSlots.length) console.log(`  Simülasyonda sıkılaştırılan dilimler: ${rep.tightenedSlots.map((s) => SLOTS[s].label).join(', ')}`);
  console.log(rep.remainingIssues.length ? `  Hâlâ sınırı aşan dilimler: ${rep.remainingIssues.map((i) => `${i.label} (doluluk %${Math.round(i.loadFactor * 100)}, peron ${i.density.toFixed(2)})`).join('; ')}` : '  Kalan kısıt ihlali yok.');
  const rc = simulate(ds, current, sim), ro = simulate(ds, rep.plan, sim);
  for (const [label, f] of [
    ['Tüm gün, tüm hat', {}],
    ['Tüm gün, T-Centralen', { stationId: 't-centralen' }],
    ['Akşam 20:30–22:00, T-Centralen', { fromSec: hhmmToSec('20:30'), toSec: hhmmToSec('22:00'), stationId: 't-centralen' }],
  ] as const) {
    const a = computeKpis(ds, rc, f), b = computeKpis(ds, ro, f);
    console.log(`  ${label.padEnd(32)} P90 ${fmt(a.dispersionP90Sec)} → ${fmt(b.dispersionP90Sec)} | ort. bekleme ${fmt(a.avgWaitSec)} → ${fmt(b.avgWaitSec)} | doluluk %${Math.round(a.peakLoadFactor * 100)} → %${Math.round(b.peakLoadFactor * 100)} | peron ${a.maxPlatformDensity.toFixed(2)} → ${b.maxPlatformDensity.toFixed(2)}`);
  }
}
console.log(`\nMevcut tarife: ${planUnitTrips(current)} ünite-sefer`);
writeFileSync('src/data/optimized-plans.json', JSON.stringify(results, null, 1) + '\n');
console.log('Yazıldı: src/data/optimized-plans.json');

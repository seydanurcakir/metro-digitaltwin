// Önerilen planların testleri. Çalıştır: npm run test:opt
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
  check('Plan veri setinde var ve 80 dilim', !!plan && plan.slots.length === 80);
  if (!plan) continue;
  const { constraints: c, fleet, line, otherLine } = ds;
  check('Sefer aralığı sınırlar içinde', plan.slots.every((s) => s.headwayMin >= c.minHeadwayMin.value && s.headwayMin <= c.maxHeadwayMin.value));
  check('Ortak gövde ≤ 24 tren/saat', plan.slots.every((s) => 60 / s.headwayMin + otherLine.trainsPerHourBySlot[s.slotIndex] <= line.trunk.maxTrainsPerHour.value + 1e-9));
  check('Filo yeterli', plan.slots.every((s) => Math.ceil(cycleTimeMin(line) / s.headwayMin) * s.unitsPerTrain <= fleet.unitsAvailable.value));
  check('İşletme bütçesi aşılmıyor', planUnitTrips(plan) <= budget + 1e-9, `${planUnitTrips(plan)} / ${budget} ünite-sefer`);

  const rc = simulate(ds, current, sim), ro = simulate(ds, plan, sim);
  const day = { a: computeKpis(ds, rc), b: computeKpis(ds, ro) };
  const eveF = { fromSec: hhmmToSec('20:30'), toSec: hhmmToSec('22:00'), stationId: 't-centralen' };
  const eve = { a: computeKpis(ds, rc, eveF), b: computeKpis(ds, ro, eveF) };
  check('Gün boyu dağılma süresi mevcut tarifeden kötü değil', day.b.dispersionP90Sec <= day.a.dispersionP90Sec, `${fmt(day.a.dispersionP90Sec)} → ${fmt(day.b.dispersionP90Sec)}`);
  check('Akşam T-Centralen dağılma süresi kısalıyor', eve.b.dispersionP90Sec < eve.a.dispersionP90Sec, `${fmt(eve.a.dispersionP90Sec)} → ${fmt(eve.b.dispersionP90Sec)}`);
  check('Peron yoğunluğu güvenli sınırın altında', day.b.maxPlatformDensity <= c.platformDensityLimit.value, `${day.b.maxPlatformDensity.toFixed(2)} kişi/m²`);
  if (id === 'optimized') {
    check('Normal günde vagon doluluğu ≤ %90', day.b.peakLoadFactor <= c.maxLoadFactor.value, `%${Math.round(day.b.peakLoadFactor * 100)}`);
    const again = optimizePlan(ds, { id, name: plan.name, sim });
    check('Optimizasyon tekrarlanabilir (kayıtlı planla aynı)', JSON.stringify(again.plan.slots) === JSON.stringify(plan.slots));
  } else {
    check('Etkinlik planı kalabalıktan önce kapasiteyi artırıyor', plan.slots.some((s) => s.slotIndex >= 62 && s.slotIndex <= 64 && s.unitsPerTrain === 3),
      'uzun trenler 20:30–21:15 arasında kalkıyor');
  }
}

console.log(`\n${failed === 0 ? 'Tüm testler geçti.' : `${failed} test başarısız.`}`);
process.exit(failed === 0 ? 0 : 1);

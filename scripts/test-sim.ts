// Simülasyon motoru testleri ve karşılaştırma raporu. Çalıştır: npm run sim
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
  id: 'all-day-5', name: 'Gün boyu 5 dk, uzun tren', kind: 'candidate',
  slots: SLOTS.map((s) => ({ slotIndex: s.index, headwayMin: 5, unitsPerTrain: 3 })),
  src: { kind: 'assumption', ref: 'assumption', note: 'Test: üst sınır plan' },
};

const t0 = performance.now();
const base = simulate(ds, current);
const ms = performance.now() - t0;

console.log('\n— Korunum ve fizik');
check('Gelen = binen + kapanışta bekleyen', rel(base.totals.arrived, base.totals.boarded + base.totals.unservedAtClose) < 1e-6,
  `${Math.round(base.totals.arrived)} = ${Math.round(base.totals.boarded)} + ${Math.round(base.totals.unservedAtClose)}`);
check('Binen = inen (herkes bir yerde iniyor)', rel(base.totals.alighted, base.totals.boarded) < 1e-6);
check('Binen yolcu gelen yolcuyu aşmıyor', base.totals.boarded <= base.totals.arrived + 1e-6);
check('Tren yükü kapasiteyi aşmıyor', base.events.every((e) => e.loadAfter <= e.capacity + 1e-6));
check('Bekleme süreleri negatif değil', Array.from(base.waits.waitSec).every((w) => w >= 0));
check('Kapanışta bekleyen yolcu küçük (son trenden sonra gelenler)', base.totals.unservedAtClose < 0.002 * base.totals.arrived,
  `${Math.round(base.totals.unservedAtClose)} kişi`);
check('Günlük gelen yolcu ≈ veri modelindeki talep', rel(base.totals.arrived, ds.demand.cells.reduce((a, c) => a + c.arrivals, 0)) < 1e-6);

console.log('\n— Davranış');
const roomy = simulate(ds, current, { boardingLimitFactor: 100 });
const maxWait = Math.max(...Array.from(roomy.waits.waitSec));
check('Kapasite sınırsızken bekleme ≤ en uzun sefer aralığı', maxWait <= 10 * 60 + 30, `en uzun ${fmt(maxWait)}`);
check('Kapasite sınırsızken kimse geride kalmıyor', roomy.events.every((e) => e.leftBehind < 1e-6));
const again = simulate(ds, current);
check('Aynı girdi → aynı sonuç (deterministik)', JSON.stringify(computeKpis(ds, again)) === JSON.stringify(computeKpis(ds, base)));
const k5 = computeKpis(ds, simulate(ds, allDay5));
const kb = computeKpis(ds, base);
check('Daha sık sefer → ortalama bekleme artmıyor', k5.avgWaitSec <= kb.avgWaitSec + 1e-9, `${fmt(kb.avgWaitSec)} → ${fmt(k5.avgWaitSec)}`);
const stress = simulate(ds, current, { demandMultiplier: 3 });
const ks = computeKpis(ds, stress);
check('Talep ×3 → geride kalan yolcu oluşuyor', ks.leftBehind > 0, `${Math.round(ks.leftBehind)} kişi-kez`);
check('Talep ×3 → dağılma süresi uzuyor', ks.dispersionP90Sec > kb.dispersionP90Sec, `${fmt(kb.dispersionP90Sec)} → ${fmt(ks.dispersionP90Sec)}`);
const surgeStart = hhmmToSec('21:00');
const surge = simulate(ds, current, { surges: [{ stationId: 't-centralen', direction: 'south', startSec: surgeStart, endSec: surgeStart + 600, passengers: 3000 }] });
const winS = { fromSec: surgeStart, toSec: surgeStart + 600, stationId: 't-centralen' };
const ksur = computeKpis(ds, surge, winS);
const knos = computeKpis(ds, base, winS);
check('Ani kalabalık (21:00, 3000 kişi) dağılma süresini uzatıyor', ksur.dispersionP90Sec > knos.dispersionP90Sec,
  `${fmt(knos.dispersionP90Sec)} → ${fmt(ksur.dispersionP90Sec)}`);
check('Ani kalabalığın hepsi taşınıyor', rel(surge.totals.boarded + surge.totals.unservedAtClose, surge.totals.arrived) < 1e-6 && surge.totals.unservedAtClose < base.totals.unservedAtClose + 1);

console.log(`\nSimülasyon süresi: ${ms.toFixed(0)} ms (${base.trips.length} sefer, ${base.events.length} durak olayı)`);

// — Rapor
const row = (name: string, k: Kpis) =>
  console.log(`  ${name.padEnd(28)} dağılma P90 ${fmt(k.dispersionP90Sec).padStart(5)} | ort. bekleme ${fmt(k.avgWaitSec).padStart(5)} | en yüksek doluluk %${(k.peakLoadFactor * 100).toFixed(0).padStart(3)} | peron ${k.maxPlatformDensity.toFixed(2)} kişi/m² | geride kalan ${Math.round(k.leftBehind)}`);

const plans: [ServicePlan, SimResult][] = [current, sample, allDay5].map((p) => [p, simulate(ds, p)]);
const am = { fromSec: hhmmToSec('07:30'), toSec: hhmmToSec('08:30') };
const mid = { fromSec: hhmmToSec('10:00'), toSec: hhmmToSec('14:00') };
for (const [title, f] of [['Tüm gün', {}], ['Sabah zirvesi 07:30–08:30', am], ['Öğle 10:00–14:00', mid], ['T-Centralen, sabah zirvesi', { ...am, stationId: 't-centralen' }]] as const) {
  console.log(`\n${title}`);
  for (const [p, r] of plans) row(p.name, computeKpis(ds, r, f));
}

console.log('\nİşletme maliyeti (servis saatlerinde kalkan ünite-sefer sayısı)');
for (const [p, r] of plans) {
  const unitTrips = r.trips.filter((t) => t.departSec >= hhmmToSec('05:00')).reduce((a, t) => a + t.units, 0);
  console.log(`  ${p.name.padEnd(28)} ${unitTrips} ünite-sefer`);
}

console.log('\nAni kalabalık örneği: 21:00–21:10 arası T-Centralen’de güneye 3000 ek yolcu');
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
  console.log(`  ${label.padEnd(34)} dağılma P90 ${fmt(k.dispersionP90Sec).padStart(5)} | en yüksek peron ${dens.toFixed(2)} kişi/m²`);
  return dens;
};
console.log('  Plan değişikliği 20:45’te başlarsa (geç):');
const late = [['Mevcut: 10 dk, kısa tren', current], ['5 dk, uzun tren', evening(5, 3, 20 * 60 + 45)]] as const;
late.forEach(([l, p]) => surgeRow(l, p));
console.log('  Plan değişikliği 20:15’te başlarsa (bir sefer süresi önce):');
const early = [['10 dk, uzun tren', evening(10, 3, 20 * 60 + 15)], ['5 dk, kısa tren', evening(5, 2, 20 * 60 + 15)], ['5 dk, uzun tren', evening(5, 3, 20 * 60 + 15)]] as const;
const densEarly = early.map(([l, p]) => surgeRow(l, p));
const densLate = computeKpis(ds, simulate(ds, current, surgeOpt), winSurge).maxPlatformDensity;
check('Önceden başlayan sık sefer peron zirvesini düşürüyor', densEarly[2] < densLate, `${densLate.toFixed(2)} → ${densEarly[2].toFixed(2)} kişi/m²`);

console.log('\nSabah zirvesinde dağılma süresi en uzun istasyonlar (mevcut tarife)');
const ranked = ds.line.stations
  .map((s) => ({ s, k: computeKpis(ds, plans[0][1], { ...am, stationId: s.id }) }))
  .sort((a, b) => b.k.dispersionP90Sec - a.k.dispersionP90Sec)
  .slice(0, 4);
for (const { s, k } of ranked) console.log(`  ${s.name.padEnd(20)} P90 ${fmt(k.dispersionP90Sec)} · peron ${k.maxPlatformDensity.toFixed(2)} kişi/m²`);

console.log(`\n${failed === 0 ? 'Tüm testler geçti.' : `${failed} test başarısız.`}`);
process.exit(failed === 0 ? 0 : 1);

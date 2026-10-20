// Veri modelinin tutarlılık testleri ve özet raporu.
// Çalıştır: npm run validate
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

console.log('\n— Yapı');
check('19 istasyon', line.stations.length === 19);
check('Sıra numaraları 0..18 ardışık', line.stations.every((s, i) => s.order === i));
check('18 bölüm, ardışık istasyonları bağlıyor',
  line.segments.length === 18 && line.segments.every((g, i) => g.from === line.stations[i].id && g.to === line.stations[i + 1].id));
check('Yalnız iki uç istasyon son durak', line.stations.filter((s) => s.isTerminal).map((s) => s.name).join(',') === 'Fruängen,Mörby centrum');
check('Ortak gövde 8 istasyon (Liljeholmen–Östermalmstorg)', line.stations.filter((s) => s.onTrunk).length === 8);
check('80 dilim (05:00–01:00, 15 dk)', SLOTS.length === 80 && SLOTS[0].label === '05:00' && SLOTS[79].label === '00:45');
check('slotIndexAt("08:00") = 12', slotIndexAt('08:00') === 12);

console.log('\n— Kaynak izlenebilirliği');
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
check('Her sayının kaynağı tanımlı', allSrc.every((s) => refs.has(s.ref)), `${allSrc.length} kaynak bağlantısı`);
const byKind = allSrc.reduce<Record<string, number>>((a, s) => ((a[s.kind] = (a[s.kind] ?? 0) + 1), a), {});
console.log('  türlere göre:', byKind);

console.log('\n— Talep');
const prof = demand.profile;
check('Gün içi paylar toplamı = 1', near(prof.shares.reduce((a, b) => a + b, 0), 1));
check('Paylar negatif değil', prof.shares.every((x) => x >= 0));
const daily = dailyLineBoardings(line);
const perStation: Record<string, number> = {};
for (const c of demand.cells) perStation[c.stationId] = (perStation[c.stationId] ?? 0) + c.arrivals;
check('İstasyon başına günlük talep = biniş × T14 payı',
  line.stations.every((s) => near(perStation[s.id], daily[s.id], 1e-9)));
check('Fruängen yalnız kuzeye, Mörby centrum yalnız güneye',
  !demand.cells.some((c) => (c.stationId === 'fruangen' && c.direction === 'south') || (c.stationId === 'morby-centrum' && c.direction === 'north')));
check('Varış payları her satırda toplamı 1',
  demand.od.every((r) => near(Object.values(r.destinationShares).reduce((a, b) => a + b, 0), 1)));
check('Varış istasyonu yöne uygun',
  demand.od.every((r) => {
    const o = line.stations.find((s) => s.id === r.originId)!.order;
    return Object.keys(r.destinationShares).every((d) => {
      const dOrder = line.stations.find((s) => s.id === d)!.order;
      return r.direction === 'north' ? dOrder > o : dOrder < o;
    });
  }));
const totalDaily = Object.values(daily).reduce((a, b) => a + b, 0);
const peakSlot = prof.shares.indexOf(Math.max(...prof.shares));
console.log(`  T14 günlük toplam biniş: ${Math.round(totalDaily).toLocaleString('tr-TR')}`);
console.log(`  En yoğun dilim: ${SLOTS[peakSlot].label} (günün %${(prof.shares[peakSlot] * 100).toFixed(2)}'si)`);

// Bir dilimde bir yöndeki en yüklü bölümdeki yolcu akışı (kişi/saat): basit statik akış hesabı.
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

console.log('\n— Planlar');
const cyc = cycleTimeMin(line);
console.log(`  Tur süresi (iki yön + dönüşler): ${cyc.toFixed(1)} dk`);
const checkPlan = (plan: ServicePlan) => {
  console.log(`\n  [${plan.name}]`);
  check('  80 dilimin hepsi tanımlı', plan.slots.length === 80 && plan.slots.every((p, i) => p.slotIndex === i));
  check('  Sefer aralığı sınırlar içinde',
    plan.slots.every((p) => p.headwayMin >= constraints.minHeadwayMin.value && p.headwayMin <= constraints.maxHeadwayMin.value));
  check('  Tren uzunluğu izinli (2 veya 3 ünite)', plan.slots.every((p) => fleet.allowedUnitsPerTrain.value.includes(p.unitsPerTrain)));
  const trunkOver = plan.slots.filter((p) => 60 / p.headwayMin + otherLine.trainsPerHourBySlot[p.slotIndex] > line.trunk.maxTrainsPerHour.value);
  check('  Ortak gövde kapasitesi (T13 + T14 ≤ 24 tren/saat)', trunkOver.length === 0, trunkOver.length ? `${trunkOver.length} dilim aşıyor` : '');
  const maxUnits = Math.max(...plan.slots.map((p) => unitsRequired(line, plan, p.slotIndex)));
  check('  Filo yeterli', maxUnits <= fleet.unitsAvailable.value, `en çok ${maxUnits} / ${fleet.unitsAvailable.value} ünite`);

  // Statik kapasite raporu: en yüklü bölümde doluluk oranı (simülasyon değil, ortalama akış)
  let worst = { lf: 0, slot: 0, dir: 'north' as Direction, link: 0 };
  for (const s of SLOTS) for (const dir of ['north', 'south'] as Direction[]) {
    const f = linkFlowsPerHour(s.index, dir);
    const p = plan.slots[s.index];
    const capPerHour = (60 / p.headwayMin) * trainCapacity(p.unitsPerTrain, fleet);
    f.forEach((v, k) => { const lf = v / capPerHour; if (lf > worst.lf) worst = { lf, slot: s.index, dir, link: k }; });
  }
  const a = line.stations[worst.link].name, b = line.stations[worst.link + 1].name;
  console.log(`    En yüksek ortalama doluluk: %${(worst.lf * 100).toFixed(0)} — ${SLOTS[worst.slot].label}, ${worst.dir === 'north' ? 'kuzey' : 'güney'} yönü, ${a} → ${b}`);
};
ds.plans.forEach(checkPlan);

console.log(`\n${failed === 0 ? 'Tüm testler geçti.' : `${failed} test başarısız.`}`);
process.exit(failed === 0 ? 0 : 1);

// Uygulama hesap katmanının testleri (sahne ve panellerin okuduğu saf fonksiyonlar) ve kare başına maliyet ölçümü.
// Çalıştır: npm run test:app
import { computeKpis, hhmmToSec, SLOTS } from '../src/index';
import { DATASET, FOCUS_STATION_ID, SCENARIOS, getResult, type ScenarioId } from '../app/twin/model';
import { buildLayout } from '../app/twin/layout';
import { buildStationView, platformAt, trainsAt, nextArrivals } from '../app/twin/selectors';
import { tripDetail, sideDetail, escalatorDetail } from '../app/twin/inspect';
import { p90Series, planMetrics, trainsOnLine, verdict } from '../app/twin/metrics';

let failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? '✔' : '✘'} ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) failed++;
};

const station = DATASET.line.stations.find((s) => s.id === FOCUS_STATION_ID)!;
const lay = buildLayout(DATASET, station);
const POOL = 6; // app/scene/Trains.tsx içindeki tren havuzu

for (const plan of DATASET.plans) {
  for (const sc of Object.keys(SCENARIOS) as ScenarioId[]) {
    const r = getResult(plan.id, sc);
    const v = buildStationView(DATASET, r, FOCUS_STATION_ID, SCENARIOS[sc].options);
    const tag = `[${plan.name} · ${SCENARIOS[sc].name}]`;
    console.log(`\n${tag}`);

    // Peron sayısı: tren olayı anında simülasyondaki kuyrukla aynı, hiç negatif değil
    let maxErr = 0, minVal = Infinity;
    for (const e of v.events) {
      const p = platformAt(v, e.t);
      maxErr = Math.max(maxErr, Math.abs(p.total - e.platformAfter));
      const before = platformAt(v, e.t - 0.001);
      minVal = Math.min(minVal, before.north, before.south);
    }
    check('Peron sayısı tren anında simülasyonla aynı', maxErr < 1e-6, `en büyük fark ${maxErr.toExponential(1)}`);
    check('Peron sayısı hiç negatif değil', minVal >= -1e-9);

    // Trenler: durunca peron içinde; aynı anda havuzdan fazla tren yok
    let inside = true, maxVisible = 0;
    for (let t = hhmmToSec('05:00'); t < hhmmToSec('01:00'); t += 5) {
      const trs = trainsAt(v, lay, t);
      maxVisible = Math.max(maxVisible, trs.length);
      for (const tr of trs) if (tr.phase === 'stopped' && Math.abs(tr.x) + tr.length / 2 > lay.platformLength / 2 + 1e-6) inside = false;
    }
    check('Duran tren peron sınırları içinde', inside);
    check(`Aynı anda görünen tren ≤ havuz (${POOL})`, maxVisible <= POOL, `en çok ${maxVisible}`);

    // Ölçüt katmanı referans hesapla aynı
    const t8 = hhmmToSec('08:05');
    const m = planMetrics(plan.id, sc, 'am', 'station', t8);
    const ref = computeKpis(DATASET, r, { fromSec: hhmmToSec('07:30'), toSec: hhmmToSec('08:30'), stationId: FOCUS_STATION_ID });
    check('Pencere ölçütleri computeKpis ile aynı', m.dispersionP90Sec === ref.dispersionP90Sec && Math.abs(m.avgWaitSec - ref.avgWaitSec) < 1e-9);
    const series = p90Series(plan.id, sc, 'line');
    const slow = SLOTS.filter((_, i) => i % 9 === 0).map((s) => computeKpis(DATASET, r, { fromSec: s.startMin * 60, toSec: s.startMin * 60 + 900 }).dispersionP90Sec);
    check('Gün boyu P90 serisi referansla aynı', SLOTS.filter((_, i) => i % 9 === 0).every((s, k) => series[s.index] === slow[k]));

    // Sefer ayrıntısı: zaman ilerledikçe tren hatta ilerliyor
    const call = v.calls.find((c) => c.arrive > t8)!;
    let lastPos = -1, mono = true;
    for (let t = call.arrive - 1200; t < call.arrive + 1200; t += 20) {
      const d = tripDetail(DATASET, r, v, call.tripId, t)!;
      const pos = d.where.kind === 'before' ? -1 : d.where.kind === 'done' ? 99 : d.where.kind === 'at' ? d.where.index : d.where.fromIndex + 0.5 + 0.49 * d.where.progress;
      if (pos < lastPos) mono = false;
      lastPos = pos;
    }
    check('Seçili tren hat boyunca hep ileri gidiyor', mono);
  }
}

console.log('\n— Genel');
check('Karar: küçük değer daha iyi', verdict('dispersionP90Sec', 300, 240) === 'better' && verdict('unitTrips', 100, 120) === 'worse' && verdict('peakLoadFactor', 0.5, 0.501) === 'same');

// Kare başına maliyet: sahne seçicileri (her karede) + panel hesapları (her simülasyon saniyesinde)
const r = getResult('current', 'surge');
const v = buildStationView(DATASET, r, FOCUS_STATION_ID, SCENARIOS.surge.options);
const t0 = hhmmToSec('21:05');
const N = 2000;
let a = performance.now();
for (let i = 0; i < N; i++) { const t = t0 + i * 0.25; trainsAt(v, lay, t); platformAt(v, t); }
const sceneMs = (performance.now() - a) / N;
a = performance.now();
for (let i = 0; i < 200; i++) {
  const t = t0 + i;
  const call = v.calls.find((c) => c.depart >= t)!;
  tripDetail(DATASET, r, v, call.tripId, t);
  sideDetail(DATASET, v, 'south', t);
  escalatorDetail(v, 0, 2, t);
  nextArrivals(v, t);
  planMetrics('current', 'surge', 'slot', 'station', t);
  planMetrics('sample-candidate', 'surge', 'slot', 'line', t);
  trainsOnLine(r, t);
}
const hudMs = (performance.now() - a) / 200;
console.log(`  Sahne seçicileri: ${sceneMs.toFixed(3)} ms/kare · Panel hesapları: ${hudMs.toFixed(2)} ms/güncelleme`);
check('Hesaplar 60 FPS bütçesinin (16,7 ms) çok altında', sceneMs + hudMs < 4, `${(sceneMs + hudMs).toFixed(2)} ms`);

console.log(`\n${failed === 0 ? 'Tüm testler geçti.' : `${failed} test başarısız.`}`);
process.exit(failed === 0 ? 0 : 1);

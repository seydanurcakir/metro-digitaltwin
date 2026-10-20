// Ağ, Solna koridoru ve T14 entegrasyonu testleri. Çalıştır: npm run test:network
import {
  buildCorridor, buildDataset, buildStockholmNetwork, computeKpis, hhmmToSec, route, simulate, StationAgent, SLOTS,
  CITY_ID, SOLNA_ID, TC_ID, type ServicePlan,
} from '../src/index';
import { dailyLineBoardings } from '../src/data/demand';

let failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? '✔' : '✘'} ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) failed++;
};
const rel = (a: number, b: number) => Math.abs(a - b) / Math.max(1, Math.abs(b));

const t14 = buildDataset();
const cur14 = t14.plans.find((p) => p.id === 'current')!;
const r14 = simulate(t14, cur14);
const cor = buildCorridor(t14, r14);
const { ds } = cor;
const opts = { surges: cor.transfer.surges };
const rc = simulate(ds, ds.plans[0], opts);
const net = buildStockholmNetwork(t14, cor);
const solnaSt = ds.line.stations.find((s) => s.id === SOLNA_ID)!;

console.log('\n— Ağ yapısı');
check('Solna ağda bir düğüm', net.nodes.has(SOLNA_ID) && net.nodes.get(SOLNA_ID)!.mode === 'commuter');
check('T-Centralen ↔ Stockholm City aktarma kenarı var', net.edges.some((e) => e.kind === 'transfer' && e.from === TC_ID && e.to === CITY_ID));
check('Her ray kenarının süresi pozitif', net.edges.every((e) => e.travelTimeSec.value > 0));
check('Koridorun gerçek ray kenarlarında sinyalizasyon ve kapasite tanımlı',
  net.edges.filter((e) => e.lineKey === 'PENDEL-SOLNA' && !net.nodes.get(e.from)!.isBoundary && !net.nodes.get(e.to)!.isBoundary)
    .every((e) => !!e.signalling && !!e.capacity?.trainsPerHour));
const refs = new Set(ds.sources.map((s) => s.id));
const allSrc = [
  ...ds.line.stations.flatMap((s) => [s.boardingsPerDay.src, s.lineShare.src, s.dwellSec.src, s.platform.usableAreaM2.src, s.platform.lengthM.src]),
  ...ds.line.segments.map((g) => g.runTimeSec.src),
  ...net.edges.flatMap((e) => [e.travelTimeSec.src, e.capacity?.trainsPerHour?.src, e.capacity?.paxPerHour?.src, e.signalling?.system.src, e.signalling?.minHeadwaySec.src].filter(Boolean)),
  ds.fleet.unitType.seats.src, ds.fleet.unitType.standing.src, ds.plans[0].src, ds.otherLine.src, ds.demand.directionalBias.src,
] as { ref: string }[];
check('Ağdaki her değerin kaynağı tanımlı', allSrc.every((s) => refs.has(s.ref)), `${allSrc.length} kaynak bağlantısı`);

console.log('\n— Güzergâh T-Centralen → Solna');
for (const hh of ['08:00', '12:00', '22:00']) {
  const r = route(net, TC_ID, SOLNA_ID, hhmmToSec(hh));
  const hw = ds.plans[0].slots[SLOTS.findIndex((s) => s.label === hh)].headwayMin;
  const expected = 300 + (hw * 60) / 2 + 420;
  check(`${hh}: yürüme + yarım sefer aralığı + 7 dk yolculuk`, !!r && Math.abs(r.totalSec - expected) < 1, r ? `${(r.totalSec / 60).toFixed(2)} dk` : 'yok');
}
check('Güzergâh sanal sınır düğümlerinden geçmiyor', !route(net, TC_ID, SOLNA_ID, hhmmToSec('08:00'))!.legs.some((l) => net.nodes.get(l.to)!.isBoundary));

console.log('\n— Koridor tarifesi');
const p = ds.plans[0];
check('80 dilim tanımlı', p.slots.length === 80);
check('Citybanan pendeltåg kapasitesi aşılmıyor (≤ 16 tren/saat)',
  p.slots.every((s) => 60 / s.headwayMin + ds.otherLine.trainsPerHourBySlot[s.slotIndex] <= ds.line.trunk.maxTrainsPerHour.value + 1e-9));
check('Sefer aralığı sinyal sınırının üstünde', p.slots.every((s) => s.headwayMin >= ds.constraints.minHeadwayMin.value));
check('Tren uzunluğu izinli (1 veya 2 X60)', p.slots.every((s) => ds.fleet.allowedUnitsPerTrain.value.includes(s.unitsPerTrain)));

console.log('\n— Talep ve entegrasyon');
const daily = dailyLineBoardings(ds.line);
const cells = (id: string) => ds.demand.cells.filter((c) => c.stationId === id).reduce((a, c) => a + c.arrivals, 0);
check('Solna günlük talebi = yayınlanmış 16 000', rel(cells(SOLNA_ID), 16_000) < 1e-9, `${Math.round(cells(SOLNA_ID))}`);
const transferTotal = cor.transfer.daily.north + cor.transfer.daily.south;
check('Stockholm City: yürüyerek gelen + T14 aktarması = yayınlanmış biniş × hat payı (çift sayım yok)',
  rel(cells(CITY_ID) + transferTotal, daily[CITY_ID]) < 1e-9, `${Math.round(cells(CITY_ID))} + ${Math.round(transferTotal)} = ${Math.round(daily[CITY_ID])}`);
check('Aktarma akışı yalnızca Stockholm City’ye bağlanıyor', cor.transfer.surges.every((s) => s.stationId === CITY_ID));
const tcAlight = r14.events.filter((e) => e.stationId === TC_ID).reduce((a, e) => a + e.alighted, 0);
check('Aktarma = T14’te T-Centralen’de inenlerin %10’u', rel(transferTotal, tcAlight * 0.1) < 1e-9, `${Math.round(transferTotal)} / ${Math.round(tcAlight)}`);
const alt14 = t14.plans.find((x) => x.id === 'optimized') as ServicePlan;
const corAlt = buildCorridor(t14, simulate(t14, alt14), cor.transfer);
const shift = Math.abs(corAlt.transfer.surges[10].startSec - cor.transfer.surges[10].startSec) > 0 || corAlt.transfer.surges.length !== cor.transfer.surges.length;
check('T14 planı değişince aktarma dalgalarının zamanlaması değişiyor', shift, `${cor.transfer.surges.length} → ${corAlt.transfer.surges.length} dalga`);
check('T14 planı değişince City’nin yürüyerek gelen talebi sabit kalıyor', rel(corAlt.ds.demand.cells.filter((c) => c.stationId === CITY_ID).reduce((a, c) => a + c.arrivals, 0), cells(CITY_ID)) < 1e-9);
check('Kapsam: koridorda etkinlik yığılması yok (yalnız aktarma akışı)', cor.transfer.surges.every((s) => s.endSec - s.startSec === 60));

console.log('\n— Simülasyon');
check('Korunum: gelen = binen + kapanışta bekleyen', rel(rc.totals.arrived, rc.totals.boarded + rc.totals.unservedAtClose) < 1e-6);
check('Binen = inen', rel(rc.totals.alighted, rc.totals.boarded) < 1e-6);
check('Tren yükü kapasiteyi aşmıyor', rc.events.every((e) => e.loadAfter <= e.capacity + 1e-6));
const k = computeKpis(ds, rc, { stationId: SOLNA_ID });
check('Solna’da normal günde kimse trende yer bulamadan kalmıyor', k.leftBehind < 1, `${Math.round(k.leftBehind)}`);
check('Solna peron yoğunluğu güvenli sınırın altında', k.maxPlatformDensity < ds.constraints.platformDensityLimit.value, `${k.maxPlatformDensity.toFixed(2)} kişi/m²`);

console.log('\n— Solna etmeni ve zaman serileri');
const ag = new StationAgent(ds, rc, SOLNA_ID, opts);
const ts = ag.timeSeries();
const sum = (key: 'entries' | 'exits' | 'boarded') => ts.reduce((a, x) => a + x[key], 0);
check('80 dilimlik zaman serisi', ts.length === 80);
check('Zaman serisi girişleri = günlük talep', rel(sum('entries'), 16_000) < 1e-6, `${Math.round(sum('entries'))}`);
check('Zaman serisi binişleri = simülasyondaki binişler', rel(sum('boarded'), rc.events.filter((e) => e.stationOrder === solnaSt.order).reduce((a, e) => a + e.boarded, 0)) < 1e-9);
check('Negatif değer yok', ts.every((x) => Object.values(x).every((v) => typeof v !== 'number' || v >= 0)));
const tWait = ts.filter((x) => x.boarded > 50);
check('Ortalama bekleme ≈ yarım sefer aralığı (±60 sn)', tWait.every((x) => Math.abs(x.avgWaitSec - (p.slots[x.slot].headwayMin * 60) / 2) < 60));
const ev = rc.events.filter((e) => e.stationOrder === solnaSt.order)[50];
const sBefore = ag.stateAt(ev.t);
check('Etmen durumu tren anında simülasyonla aynı', rel(sBefore.total, ev.platformAfter) < 1e-6);
const states = [...ag.stream(hhmmToSec('07:00'), hhmmToSec('08:00'), 60)];
check('Akış: 07:00–08:00 arası dakikalık 61 durum', states.length === 61 && states.every((s) => s.occupancy >= 0));
check('Sanal sınır düğümü için etmen oluşturulmuyor', (() => { try { new StationAgent(ds, rc, 'sinir-kuzey'); return false; } catch { return true; } })());

console.log(`\n${failed === 0 ? 'Tüm testler geçti.' : `${failed} test başarısız.`}`);
process.exit(failed === 0 ? 0 : 1);

// Solna istasyonu: ağ özeti, T-Centralen bağlantısı ve 15 dakikalık KPI zaman serileri.
// Çalıştır: npm run solna  →  data/solna-timeseries.json ve data/solna-timeseries.csv
import { mkdirSync, writeFileSync } from 'node:fs';
import {
  buildCorridor, buildDataset, buildStockholmNetwork, hhmmToSec, route, simulate, StationAgent, SOLNA_ID, TC_ID,
} from '../src/index';

const t14 = buildDataset();
const r14 = simulate(t14, t14.plans.find((p) => p.id === 'current')!);
const cor = buildCorridor(t14, r14);
const opts = { surges: cor.transfer.surges };
const rc = simulate(cor.ds, cor.ds.plans[0], opts);
const solna = new StationAgent(cor.ds, rc, SOLNA_ID, opts);
const net = buildStockholmNetwork(t14, cor);

const fmt = (s: number) => { const r = Math.round(s); return `${Math.floor(r / 60)}:${String(r % 60).padStart(2, '0')}`; };
const n = (x: number) => Math.round(x).toLocaleString('tr-TR');

console.log('\n— Ağ');
console.log(`  ${net.nodes.size} düğüm (${[...net.nodes.values()].filter((d) => d.isBoundary).length} sanal sınır), ${net.edges.length} kenar`);
const link = net.edges.filter((e) => ['stockholm-city', 'stockholm-odenplan', 'solna'].includes(e.from) || e.kind === 'transfer');
for (const e of link) {
  const cap = e.capacity?.trainsPerHour ? `${e.capacity.trainsPerHour.value} tren/saat` : e.capacity?.paxPerHour ? `${n(e.capacity.paxPerHour.value)} yolcu/saat` : '—';
  const sig = e.signalling ? `${e.signalling.system.value}, en kısa aralık ${e.signalling.minHeadwaySec.value} sn` : '—';
  console.log(`  ${e.kind === 'transfer' ? 'Aktarma' : 'Ray    '} ${e.from} → ${e.to}: ${e.travelTimeSec.value} sn · kapasite ${cap} · sinyal ${sig}`);
}
console.log('\n— T-Centralen → Solna (kapıdan kapıya, beklenen)');
for (const hh of ['08:00', '12:00', '17:00', '22:00']) {
  const r = route(net, TC_ID, SOLNA_ID, hhmmToSec(hh))!;
  console.log(`  ${hh}  ${fmt(r.totalSec)} dk  (${r.legs.map((l) => `${l.kind === 'walk' ? 'yürüme' : l.kind === 'wait' ? 'bekleme' : l.kind === 'ride' ? 'yolculuk' : 'durak'} ${Math.round(l.sec)}`).join(' + ')} sn)`);
}
console.log(`\n— Aktarma akışı: günde ${n(cor.transfer.daily.north + cor.transfer.daily.south)} kişi T14’ten koridor trenlerine (kuzey ${n(cor.transfer.daily.north)}, güney ${n(cor.transfer.daily.south)})`);

const ts = solna.timeSeries();
const sum = (k: keyof (typeof ts)[number]) => ts.reduce((a, x) => a + (x[k] as number), 0);
const peak = ts.reduce((a, b) => (b.platformMax > a.platformMax ? b : a));
console.log('\n— Solna günlük özet');
console.log(`  Giriş ${n(sum('entries'))} · çıkış ${n(sum('exits'))} · binen ${n(sum('boarded'))} · tren ${sum('trains')}`);
console.log(`  En kalabalık an: ${peak.label} · peronda en çok ${n(peak.platformMax)} kişi · ${peak.densityMax.toFixed(2)} kişi/m² · doluluk %${Math.round(peak.occupancyMax * 100)}`);
console.log(`  En yüksek kalkış doluluğu: %${Math.round(Math.max(...ts.map((x) => x.maxDepartureLoad)) * 100)}`);
console.log('\n  Saat   Giriş  Çıkış  Ort.bekl  P90   Peron ort/en çok  Doluluk  Kalkış dol.');
for (const x of ts.filter((_, i) => i % 4 === 0)) {
  console.log(`  ${x.label}  ${String(Math.round(x.entries)).padStart(5)}  ${String(Math.round(x.exits)).padStart(5)}  ${fmt(x.avgWaitSec).padStart(6)}  ${fmt(x.p90WaitSec).padStart(5)}  ${String(Math.round(x.platformAvg)).padStart(6)} / ${String(Math.round(x.platformMax)).padStart(4)}   %${String(Math.round(x.occupancyMax * 100)).padStart(3)}     %${Math.round(x.maxDepartureLoad * 100)}`);
}

mkdirSync('data', { recursive: true });
writeFileSync('data/solna-timeseries.json', JSON.stringify({
  station: solna.info(),
  generatedFrom: 'npm run solna — T14 mevcut tarife + pendeltåg mevcut tarife, normal iş günü, sentetik gün içi talep',
  units: { waitSec: 'saniye', density: 'kişi/m²', occupancy: 'perondaki kişi / (alan × 2,0 kişi/m²)', load: 'kalkışta yük / kapasite' },
  slots: ts,
}, null, 1) + '\n');
const cols = Object.keys(ts[0]) as (keyof (typeof ts)[number])[];
writeFileSync('data/solna-timeseries.csv', [cols.join(','), ...ts.map((x) => cols.map((c) => (typeof x[c] === 'number' ? +(x[c] as number).toFixed(4) : x[c])).join(','))].join('\n') + '\n');
console.log('\nYazıldı: data/solna-timeseries.json, data/solna-timeseries.csv');

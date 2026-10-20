// Solna station: network summary, link to T-Centralen and 15-minute KPI time series.
// Run: npm run solna  →  data/solna-timeseries.json and data/solna-timeseries.csv
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
const n = (x: number) => Math.round(x).toLocaleString('en-US');

console.log('\n— Network');
console.log(`  ${net.nodes.size} nodes (${[...net.nodes.values()].filter((d) => d.isBoundary).length} virtual boundaries), ${net.edges.length} edges`);
const link = net.edges.filter((e) => ['stockholm-city', 'stockholm-odenplan', 'solna'].includes(e.from) || e.kind === 'transfer');
for (const e of link) {
  const cap = e.capacity?.trainsPerHour ? `${e.capacity.trainsPerHour.value} trains/h` : e.capacity?.paxPerHour ? `${n(e.capacity.paxPerHour.value)} pax/h` : '—';
  const sig = e.signalling ? `${e.signalling.system.value}, min headway ${e.signalling.minHeadwaySec.value} s` : '—';
  console.log(`  ${e.kind === 'transfer' ? 'Transfer' : 'Track   '} ${e.from} → ${e.to}: ${e.travelTimeSec.value} s · capacity ${cap} · signalling ${sig}`);
}
console.log('\n— T-Centralen → Solna (door to door, expected)');
for (const hh of ['08:00', '12:00', '17:00', '22:00']) {
  const r = route(net, TC_ID, SOLNA_ID, hhmmToSec(hh))!;
  console.log(`  ${hh}  ${fmt(r.totalSec)} min  (${r.legs.map((l) => `${l.kind === 'walk' ? 'walk' : l.kind === 'wait' ? 'wait' : l.kind === 'ride' ? 'ride' : 'dwell'} ${Math.round(l.sec)}`).join(' + ')} s)`);
}
console.log(`\n— Transfer flow: ${n(cor.transfer.daily.north + cor.transfer.daily.south)} people a day from T14 to corridor trains (north ${n(cor.transfer.daily.north)}, south ${n(cor.transfer.daily.south)})`);

const ts = solna.timeSeries();
const sum = (k: keyof (typeof ts)[number]) => ts.reduce((a, x) => a + (x[k] as number), 0);
const peak = ts.reduce((a, b) => (b.platformMax > a.platformMax ? b : a));
console.log('\n— Solna daily summary');
console.log(`  Entries ${n(sum('entries'))} · exits ${n(sum('exits'))} · boarded ${n(sum('boarded'))} · trains ${sum('trains')}`);
console.log(`  Busiest moment: ${peak.label} · up to ${n(peak.platformMax)} people on the platform · ${peak.densityMax.toFixed(2)} people/m² · occupancy ${Math.round(peak.occupancyMax * 100)}%`);
console.log(`  Highest departure load: ${Math.round(Math.max(...ts.map((x) => x.maxDepartureLoad)) * 100)}%`);
console.log('\n  Time   Entry   Exit  Avg wait  P90   Platform avg/max  Occup.  Dep. load');
for (const x of ts.filter((_, i) => i % 4 === 0)) {
  console.log(`  ${x.label}  ${String(Math.round(x.entries)).padStart(5)}  ${String(Math.round(x.exits)).padStart(5)}  ${fmt(x.avgWaitSec).padStart(6)}  ${fmt(x.p90WaitSec).padStart(5)}  ${String(Math.round(x.platformAvg)).padStart(6)} / ${String(Math.round(x.platformMax)).padStart(4)}   ${String(Math.round(x.occupancyMax * 100)).padStart(3)}%    ${Math.round(x.maxDepartureLoad * 100)}%`);
}

mkdirSync('data', { recursive: true });
writeFileSync('data/solna-timeseries.json', JSON.stringify({
  station: solna.info(),
  generatedFrom: 'npm run solna — T14 current timetable + commuter rail current timetable, normal weekday, synthetic time-of-day demand',
  units: { waitSec: 'seconds', density: 'people/m²', occupancy: 'people on platform / (area × 2.0 people/m²)', load: 'load on departure / capacity' },
  slots: ts,
}, null, 1) + '\n');
const cols = Object.keys(ts[0]) as (keyof (typeof ts)[number])[];
writeFileSync('data/solna-timeseries.csv', [cols.join(','), ...ts.map((x) => cols.map((c) => (typeof x[c] === 'number' ? +(x[c] as number).toFixed(4) : x[c])).join(','))].join('\n') + '\n');
console.log('\nWritten: data/solna-timeseries.json, data/solna-timeseries.csv');

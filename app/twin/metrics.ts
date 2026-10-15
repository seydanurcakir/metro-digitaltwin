// Ölçüt katmanı: plan karşılaştırması, zaman penceresi ve kapsam filtreleri. Her sayı simülasyondan hesaplanır.
import { computeKpis, hhmmToSec, SLOTS, type Kpis, type SimResult } from '../../src/index';
import { SERVICE_END_MIN, SERVICE_START_MIN, SLOT_MINUTES } from '../../src/data/time';
import { DATASET, FOCUS_STATION_ID, getResult, type ScenarioId } from './model';

export type WindowId = 'slot' | 'am' | 'mid' | 'pm' | 'eve' | 'day';
export type Scope = 'station' | 'line';

export const WINDOWS: { id: WindowId; label: string; range?: [string, string] }[] = [
  { id: 'slot', label: 'Bu 15 dakika' },
  { id: 'am', label: 'Sabah zirvesi 07:30–08:30', range: ['07:30', '08:30'] },
  { id: 'mid', label: 'Öğle 10:00–14:00', range: ['10:00', '14:00'] },
  { id: 'pm', label: 'Akşam zirvesi 16:30–17:30', range: ['16:30', '17:30'] },
  { id: 'eve', label: 'Akşam 20:30–22:00', range: ['20:30', '22:00'] },
  { id: 'day', label: 'Tüm gün', range: ['05:00', '01:00'] },
];

const SLOT_SEC = SLOT_MINUTES * 60;
const START = SERVICE_START_MIN * 60;
const END = SERVICE_END_MIN * 60;

export const slotIndexOf = (t: number) => Math.max(0, Math.min(SLOTS.length - 1, Math.floor((t - START) / SLOT_SEC)));

export function windowRange(id: WindowId, t: number): [number, number] {
  if (id === 'slot') {
    const s = START + slotIndexOf(t) * SLOT_SEC;
    return [s, s + SLOT_SEC];
  }
  const w = WINDOWS.find((x) => x.id === id)!;
  const a = hhmmToSec(w.range![0]);
  const b = w.id === 'day' ? END : hhmmToSec(w.range![1]);
  return [a, b];
}

export interface PlanMetrics extends Kpis {
  /** Penceredeki son duraklardan kalkan ünite-sefer (işletme maliyeti göstergesi) */
  unitTrips: number;
}

const unitTrips = (r: SimResult, a: number, b: number) =>
  r.trips.filter((tr) => tr.departSec >= a && tr.departSec < b).reduce((s, tr) => s + tr.units, 0);

const cache = new Map<string, PlanMetrics>();

export function planMetrics(planId: string, scenario: ScenarioId, win: WindowId, scope: Scope, t: number): PlanMetrics {
  const [a, b] = windowRange(win, t);
  const key = `${planId}|${scenario}|${scope}|${a}|${b}`;
  let m = cache.get(key);
  if (!m) {
    const r = getResult(planId, scenario);
    const k = computeKpis(DATASET, r, { fromSec: a, toSec: b, stationId: scope === 'station' ? FOCUS_STATION_ID : undefined });
    m = { ...k, unitTrips: unitTrips(r, a, b) };
    cache.set(key, m);
  }
  return m;
}

const seriesCache = new Map<string, number[]>();

/** Gün boyu her 15 dakikalık dilim için dağılma P90 (sn) */
export function p90Series(planId: string, scenario: ScenarioId, scope: Scope): number[] {
  const key = `${planId}|${scenario}|${scope}`;
  let s = seriesCache.get(key);
  if (!s) {
    // Kayıtları bir kez dilimlere ayır, sonra her dilimde ağırlıklı yüzdelik al (computeKpis ile aynı tanım).
    const w = getResult(planId, scenario).waits;
    const order = scope === 'station' ? DATASET.line.stations.find((x) => x.id === FOCUS_STATION_ID)!.order : -1;
    const buckets: number[][] = SLOTS.map(() => []);
    for (let i = 0; i < w.length; i++) {
      if (order >= 0 && w.stationOrder[i] !== order) continue;
      const k = Math.floor((w.arrivalSec[i] - START) / SLOT_SEC);
      if (k >= 0 && k < buckets.length) buckets[k].push(i);
    }
    s = buckets.map((idx) => {
      if (!idx.length) return 0;
      idx.sort((p, q) => w.waitSec[p] - w.waitSec[q]);
      const total = idx.reduce((acc, i) => acc + w.passengers[i], 0);
      let acc = 0;
      for (const i of idx) { acc += w.passengers[i]; if (acc >= 0.9 * total) return w.waitSec[i]; }
      return w.waitSec[idx[idx.length - 1]];
    });
    seriesCache.set(key, s);
  }
  return s;
}

export type MetricKey = keyof PlanMetrics;

export const METRIC_ROWS: { key: MetricKey; label: string; fmt: (v: number) => string; delta: (d: number) => string }[] = [
  { key: 'dispersionP90Sec', label: 'Dağılma süresi (P90)', fmt: (v) => fmtMinSec(v), delta: (d) => `${d > 0 ? '+' : d < 0 ? '−' : ''}${fmtMinSec(Math.abs(d))}` },
  { key: 'avgWaitSec', label: 'Ort. bekleme', fmt: (v) => fmtMinSec(v), delta: (d) => `${d > 0 ? '+' : d < 0 ? '−' : ''}${fmtMinSec(Math.abs(d))}` },
  { key: 'peakLoadFactor', label: 'En yüksek doluluk', fmt: (v) => `%${Math.round(v * 100)}`, delta: (d) => `${d > 0 ? '+' : d < 0 ? '−' : ''}${Math.abs(Math.round(d * 100))} puan` },
  { key: 'maxPlatformDensity', label: 'Peron yoğunluğu (kişi/m²)', fmt: (v) => fmtDec(v), delta: (d) => `${d > 0 ? '+' : d < 0 ? '−' : ''}${fmtDec(Math.abs(d))}` },
  { key: 'leftBehind', label: 'Trene sığamayan (kişi)', fmt: (v) => fmtInt(v), delta: (d) => `${d > 0 ? '+' : d < 0 ? '−' : ''}${fmtInt(Math.abs(d))}` },
  { key: 'unitTrips', label: 'İşletme (ünite-sefer)', fmt: (v) => fmtInt(v), delta: (d) => `${d > 0 ? '+' : d < 0 ? '−' : ''}${fmtInt(Math.abs(d))}` },
];

/** Tüm ölçütlerde küçük olan daha iyi. Küçük farklar "değişmedi" sayılır. */
export function verdict(key: MetricKey, a: number, b: number): 'better' | 'worse' | 'same' {
  const eps = key === 'peakLoadFactor' ? 0.005 : key === 'maxPlatformDensity' ? 0.005 : key === 'unitTrips' || key === 'leftBehind' ? 0.5 : 1;
  if (Math.abs(b - a) < eps) return 'same';
  return b < a ? 'better' : 'worse';
}

export function fmtMinSec(sec: number) {
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
export const fmtInt = (n: number) => Math.round(n).toLocaleString('tr-TR');
export const fmtDec = (n: number) => n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** t anında hatta (iki son durak arasında) olan tren ve ünite sayısı */
export function trainsOnLine(r: SimResult, t: number) {
  let trains = 0, units = 0;
  for (const tr of r.trips) {
    if (t >= tr.stops[0].t && t <= tr.stops[tr.stops.length - 1].t) { trains++; units += tr.units; }
  }
  return { trains, units };
}

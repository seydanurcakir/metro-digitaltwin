// Simülasyon sonuçlarından ölçütler. Her sayı simülasyon kayıtlarından hesaplanır.
import type { Kpis, TwinDataset } from '../types';
import type { SimResult } from './engine';
import { SERVICE_START_MIN, SLOTS, SLOT_MINUTES } from '../data/time';

export interface KpiFilter {
  /** Yolcunun perona geliş zamanı penceresi (sn, gün başından) */
  fromSec?: number;
  toSec?: number;
  stationId?: string;
}

/** Ağırlıklı yüzdelik */
export function weightedPercentile(values: ArrayLike<number>, weights: ArrayLike<number>, p: number, mask?: (i: number) => boolean): number {
  const idx: number[] = [];
  let total = 0;
  for (let i = 0; i < values.length; i++) if (!mask || mask(i)) { idx.push(i); total += weights[i]; }
  if (total === 0) return 0;
  idx.sort((a, b) => values[a] - values[b]);
  let acc = 0;
  for (const i of idx) { acc += weights[i]; if (acc >= p * total) return values[i]; }
  return values[idx[idx.length - 1]];
}

export const hhmmToSec = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  let min = h * 60 + m;
  if (min < SERVICE_START_MIN) min += 1440;
  return min * 60;
};

export function computeKpis(ds: TwinDataset, r: SimResult, f: KpiFilter = {}): Kpis {
  const from = f.fromSec ?? -Infinity;
  const to = f.toSec ?? Infinity;
  const order = f.stationId ? ds.line.stations.find((s) => s.id === f.stationId)!.order : -1;
  const w = r.waits;
  const mask = (i: number) => w.arrivalSec[i] >= from && w.arrivalSec[i] < to && (order < 0 || w.stationOrder[i] === order);

  let sumW = 0, sumP = 0;
  for (let i = 0; i < w.length; i++) if (mask(i)) { sumW += w.waitSec[i] * w.passengers[i]; sumP += w.passengers[i]; }

  const evs = r.events.filter((e) => e.t >= from && e.t < to && (order < 0 || e.stationOrder === order));
  return {
    dispersionP90Sec: weightedPercentile(w.waitSec, w.passengers, 0.9, mask),
    avgWaitSec: sumP ? sumW / sumP : 0,
    peakLoadFactor: evs.reduce((m, e) => Math.max(m, e.loadAfter / e.capacity), 0),
    maxPlatformDensity: evs.reduce((m, e) => Math.max(m, e.densityBefore), 0),
    leftBehind: evs.reduce((s, e) => s + e.leftBehind, 0),
  };
}

/** 15 dakikalık dilim bazında ölçüt serisi (grafikler için) */
export function slotSeries(ds: TwinDataset, r: SimResult, stationId?: string) {
  return SLOTS.map((s) => {
    const fromSec = s.startMin * 60;
    const k = computeKpis(ds, r, { fromSec, toSec: fromSec + SLOT_MINUTES * 60, stationId });
    return { slot: s.index, label: s.label, ...k };
  });
}

/** Bir istasyonda peron doluluğunun zaman izi (tren öncesi / sonrası) */
export function platformTrace(r: SimResult, stationId: string) {
  return r.events
    .filter((e) => e.stationId === stationId)
    .map((e) => ({ t: e.t, direction: e.direction, before: e.platformBefore, after: e.platformAfter, density: e.densityBefore }));
}

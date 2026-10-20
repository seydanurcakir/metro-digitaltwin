// İstasyon etmeni: bir istasyonu bağımsız bir nesne olarak temsil eder.
// Simülasyon sonucundan herhangi bir t anındaki durumu (peron, trenler) ve 15 dakikalık KPI zaman serilerini üretir.

import type { Direction, TwinDataset } from '../types';
import type { SimOptions, SimResult } from '../sim/engine';
import { SERVICE_END_MIN, SERVICE_START_MIN, SLOTS, SLOT_MINUTES } from '../data/time';
import { weightedPercentile } from '../sim/kpi';

const START = SERVICE_START_MIN * 60;
const END = SERVICE_END_MIN * 60;
const SLOT = SLOT_MINUTES * 60;
const DIRS: Direction[] = ['north', 'south'];

export interface StationState {
  t: number;
  waiting: Record<Direction, number>;
  total: number;
  /** kişi/m² */
  density: number;
  /** Perondaki kişi / (alan × güvenli yoğunluk sınırı) */
  occupancy: number;
  next: Record<Direction, { inSec: number; units: number; loadFactorOnDeparture: number } | null>;
}

export interface SlotKpi {
  slot: number;
  label: string;
  /** Perona gelen (istasyona giren) yolcu */
  entries: number;
  /** Trenden inen (istasyondan çıkan) yolcu */
  exits: number;
  boarded: number;
  /** Çıkanların toplam harekete oranı */
  exitShare: number;
  avgWaitSec: number;
  p90WaitSec: number;
  platformAvg: number;
  platformMax: number;
  densityMax: number;
  /** Ortalama peron doluluk oranı (0–1+) */
  occupancyAvg: number;
  occupancyMax: number;
  trains: number;
  avgDepartureLoad: number;
  maxDepartureLoad: number;
  leftBehind: number;
}

export class StationAgent {
  readonly id: string;
  readonly name: string;
  readonly order: number;
  readonly area: number;
  readonly limit: number;
  private readonly events: SimResult['events'];
  private readonly rate: [Float64Array, Float64Array];
  private readonly surges: NonNullable<SimOptions['surges']>;
  private readonly calls: { dir: Direction; arrive: number; depart: number; units: number; lf: number }[];

  constructor(private readonly ds: TwinDataset, private readonly r: SimResult, stationId: string, opts: SimOptions = {}) {
    const st = ds.line.stations.find((s) => s.id === stationId);
    if (!st) throw new Error(`İstasyon yok: ${stationId}`);
    if (st.isBoundary) throw new Error('Sanal sınır düğümü için etmen oluşturulmaz');
    this.id = st.id;
    this.name = st.name;
    this.order = st.order;
    this.area = st.platform.usableAreaM2.value;
    this.limit = ds.constraints.platformDensityLimit.value;
    this.events = r.events.filter((e) => e.stationOrder === st.order).sort((a, b) => a.t - b.t);
    const mult = opts.demandMultiplier ?? 1;
    this.rate = [new Float64Array(SLOTS.length), new Float64Array(SLOTS.length)];
    for (const c of ds.demand.cells) if (c.stationId === st.id) this.rate[c.direction === 'north' ? 0 : 1][c.slotIndex] = (c.arrivals * mult) / SLOT;
    this.surges = (opts.surges ?? []).filter((s) => s.stationId === st.id);
    const evByTrip = new Map(this.events.map((e) => [e.tripId, e]));
    this.calls = r.trips.flatMap((tr) => {
      const s = tr.stops.find((x) => x.stationOrder === st.order);
      const e = evByTrip.get(tr.id);
      if (!s || !e) return [];
      return [{ dir: tr.direction, arrive: s.t, depart: s.t + (st.isTerminal ? 0 : st.dwellSec.value), units: tr.units, lf: e.loadAfter / e.capacity }];
    }).sort((a, b) => a.arrive - b.arrive);
  }

  /** [a, b) aralığında bir yönde perona gelen yolcu */
  arrivals(dir: Direction, a: number, b: number): number {
    const d = dir === 'north' ? 0 : 1;
    let sum = 0;
    for (let x = Math.max(a, START); x < Math.min(b, END); ) {
      const k = Math.floor((x - START) / SLOT);
      const y = Math.min(b, START + (k + 1) * SLOT);
      sum += this.rate[d][k] * (y - x);
      x = y;
    }
    for (const s of this.surges) {
      if (s.direction !== dir) continue;
      const ov = Math.max(0, Math.min(b, s.endSec) - Math.max(a, s.startSec));
      sum += (s.passengers * ov) / (s.endSec - s.startSec);
    }
    return sum;
  }

  stateAt(t: number): StationState {
    let lo = 0, hi = this.events.length - 1, idx = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (this.events[mid].t <= t) { idx = mid; lo = mid + 1; } else hi = mid - 1;
    }
    const from = idx >= 0 ? this.events[idx].t : START;
    const base = idx >= 0 ? this.events[idx].queueAfter : [0, 0];
    const waiting = { north: base[0] + this.arrivals('north', from, t), south: base[1] + this.arrivals('south', from, t) };
    const total = waiting.north + waiting.south;
    const next = { north: null, south: null } as StationState['next'];
    for (const dir of DIRS) {
      const c = this.calls.find((x) => x.dir === dir && x.depart >= t);
      next[dir] = c ? { inSec: Math.max(0, c.arrive - t), units: c.units, loadFactorOnDeparture: c.lf } : null;
    }
    return { t, waiting, total, density: total / this.area, occupancy: total / (this.area * this.limit), next };
  }

  /** Belirli aralıklarla durum akışı (ör. her 60 sn) */
  *stream(fromSec: number, toSec: number, stepSec = 60): Generator<StationState> {
    for (let t = fromSec; t <= toSec; t += stepSec) yield this.stateAt(t);
  }

  /** 15 dakikalık dilimlerle KPI zaman serisi */
  timeSeries(sampleSec = 30): SlotKpi[] {
    const w = this.r.waits;
    return SLOTS.map((sl) => {
      const a = sl.startMin * 60, b = a + SLOT;
      const evs = this.events.filter((e) => e.t >= a && e.t < b);
      const entries = this.arrivals('north', a, b) + this.arrivals('south', a, b);
      const exits = evs.reduce((s, e) => s + e.alighted, 0);
      const boarded = evs.reduce((s, e) => s + e.boarded, 0);
      let pSum = 0, wSum = 0;
      const mask = (i: number) => w.stationOrder[i] === this.order && w.arrivalSec[i] >= a && w.arrivalSec[i] < b;
      for (let i = 0; i < w.length; i++) if (mask(i)) { pSum += w.passengers[i]; wSum += w.passengers[i] * w.waitSec[i]; }
      let sampleSum = 0, n = 0, pMax = 0;
      for (let t = a; t < b; t += sampleSec) {
        const s = this.stateAt(t);
        sampleSum += s.total; n++;
        pMax = Math.max(pMax, s.total);
      }
      for (const e of evs) pMax = Math.max(pMax, e.platformBefore);
      const deps = evs.filter((e) => e.capacity > 0);
      const lfs = deps.map((e) => e.loadAfter / e.capacity);
      const avg = sampleSum / n;
      return {
        slot: sl.index, label: sl.label,
        entries, exits, boarded,
        exitShare: entries + exits > 0 ? exits / (entries + exits) : 0,
        avgWaitSec: pSum ? wSum / pSum : 0,
        p90WaitSec: weightedPercentile(w.waitSec, w.passengers, 0.9, mask),
        platformAvg: avg, platformMax: pMax, densityMax: pMax / this.area,
        occupancyAvg: avg / (this.area * this.limit), occupancyMax: pMax / (this.area * this.limit),
        trains: deps.length,
        avgDepartureLoad: lfs.length ? lfs.reduce((x, y) => x + y, 0) / lfs.length : 0,
        maxDepartureLoad: lfs.length ? Math.max(...lfs) : 0,
        leftBehind: evs.reduce((s, e) => s + e.leftBehind, 0),
      };
    });
  }

  /** Bilgi kartı */
  info() {
    const st = this.ds.line.stations[this.order];
    return {
      id: st.id, name: st.name, lines: st.servedBy,
      boardingsPerDay: st.boardingsPerDay, platform: st.platform, dwellSec: st.dwellSec,
    };
  }
}

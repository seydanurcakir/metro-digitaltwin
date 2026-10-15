// Saf fonksiyonlar: simülasyon sonucundan, verilen bir t anında sahnede ne görüneceğini hesaplar.
import type { Direction, SimOptions, SimResult, TwinDataset } from '../../src/index';
import { SERVICE_START_MIN, SLOT_MINUTES } from '../../src/data/time';
import type { StationLayout } from './layout';

const DIRS: Direction[] = ['north', 'south'];

export interface StationView {
  stationId: string;
  order: number;
  area: number;
  dwell: number;
  /** Bu istasyondaki durak olayları, zamana göre sıralı */
  events: SimResult['events'];
  /** Bu istasyona uğrayan seferler */
  calls: { tripId: number; direction: Direction; arrive: number; depart: number; units: number; capacity: number; loadFactor: number; boarded: number; alighted: number; leftBehind: number }[];
  /** Dilim bazında geliş hızı (kişi/sn): rate[dir][slot] */
  rate: [Float64Array, Float64Array];
  surges: NonNullable<SimOptions['surges']>;
}

export function buildStationView(ds: TwinDataset, r: SimResult, stationId: string, opts: SimOptions): StationView {
  const st = ds.line.stations.find((s) => s.id === stationId)!;
  const events = r.events.filter((e) => e.stationId === stationId).sort((a, b) => a.t - b.t);
  const evByTrip = new Map(events.map((e) => [e.tripId, e]));
  const calls = r.trips.flatMap((tr) => {
    const stop = tr.stops.find((s) => s.stationOrder === st.order);
    const ev = evByTrip.get(tr.id);
    if (!stop || !ev) return [];
    const dwell = st.isTerminal ? 0 : st.dwellSec.value;
    return [{
      tripId: tr.id, direction: tr.direction, arrive: stop.t, depart: stop.t + dwell, units: tr.units, capacity: tr.capacity,
      loadFactor: ev.loadAfter / ev.capacity, boarded: ev.boarded, alighted: ev.alighted, leftBehind: ev.leftBehind,
    }];
  });
  const nSlots = ds.demand.profile.slots.length;
  const rate: [Float64Array, Float64Array] = [new Float64Array(nSlots), new Float64Array(nSlots)];
  const mult = opts.demandMultiplier ?? 1;
  for (const c of ds.demand.cells)
    if (c.stationId === stationId) rate[c.direction === 'north' ? 0 : 1][c.slotIndex] = (c.arrivals * mult) / (SLOT_MINUTES * 60);
  return {
    stationId, order: st.order, area: st.platform.usableAreaM2.value, dwell: st.dwellSec.value,
    events, calls, rate, surges: (opts.surges ?? []).filter((s) => s.stationId === stationId),
  };
}

const START = SERVICE_START_MIN * 60;
const SLOT = SLOT_MINUTES * 60;

/** [a, b) aralığında bir yönde perona gelen yolcu sayısı */
export function arrivalsBetween(v: StationView, d: number, a: number, b: number): number {
  let sum = 0;
  let x = Math.max(a, START);
  while (x < b) {
    const slot = Math.floor((x - START) / SLOT);
    if (slot >= v.rate[d].length) break;
    const y = Math.min(b, START + (slot + 1) * SLOT);
    sum += v.rate[d][slot] * (y - x);
    x = y;
  }
  for (const s of v.surges) {
    if ((s.direction === 'north' ? 0 : 1) !== d) continue;
    const ov = Math.max(0, Math.min(b, s.endSec) - Math.max(a, s.startSec));
    sum += (s.passengers * ov) / (s.endSec - s.startSec);
  }
  return sum;
}

export interface PlatformState {
  north: number;
  south: number;
  total: number;
  density: number;
}

/** t anında perondaki yolcu sayısı: son tren olayından sonraki kuyruk + o andan beri gelenler */
export function platformAt(v: StationView, t: number): PlatformState {
  let lo = 0, hi = v.events.length - 1, idx = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (v.events[mid].t <= t) { idx = mid; lo = mid + 1; } else hi = mid - 1;
  }
  const base: [number, number] = idx >= 0 ? [...v.events[idx].queueAfter] : [0, 0];
  const from = idx >= 0 ? v.events[idx].t : START;
  const north = base[0] + arrivalsBetween(v, 0, from, t);
  const south = base[1] + arrivalsBetween(v, 1, from, t);
  return { north, south, total: north + south, density: (north + south) / v.area };
}

export interface TrainState {
  tripId: number;
  direction: Direction;
  /** Tren merkezinin x konumu */
  x: number;
  z: number;
  units: number;
  length: number;
  doorsOpen: boolean;
  loadFactor: number;
  phase: 'arriving' | 'stopped' | 'departing';
}

export const APPROACH_SEC = 40;
const APPROACH_DIST = 170;

/** t anında istasyon çevresinde görünen trenler. Yavaşlayarak gelir, durur, hızlanarak gider. */
export function trainsAt(v: StationView, lay: StationLayout, t: number): TrainState[] {
  const out: TrainState[] = [];
  for (const c of v.calls) {
    if (t < c.arrive - APPROACH_SEC || t > c.depart + APPROACH_SEC) continue;
    const sign = c.direction === 'north' ? 1 : -1;
    const length = c.units * lay.unitLength + (c.units - 1) * 0.6;
    const stopX = sign * (lay.platformLength / 2 - length / 2 - 2);
    let x: number;
    let phase: TrainState['phase'];
    if (t < c.arrive) {
      const u = (c.arrive - t) / APPROACH_SEC; // 1 → 0
      x = stopX - sign * APPROACH_DIST * u * u;
      phase = 'arriving';
    } else if (t <= c.depart) {
      x = stopX;
      phase = 'stopped';
    } else {
      const u = (t - c.depart) / APPROACH_SEC; // 0 → 1
      x = stopX + sign * APPROACH_DIST * u * u;
      phase = 'departing';
    }
    out.push({
      tripId: c.tripId, direction: c.direction, x, z: c.direction === 'north' ? lay.trackZ.north : lay.trackZ.south,
      units: c.units, length, doorsOpen: phase === 'stopped' && t > c.arrive + 3 && t < c.depart - 3,
      loadFactor: c.loadFactor, phase,
    });
  }
  return out;
}

/** Her yön için bir sonraki trenin gelmesine kalan süre (sn) */
export function nextArrivals(v: StationView, t: number): Record<Direction, number | null> {
  const res = { north: null, south: null } as Record<Direction, number | null>;
  for (const d of DIRS) {
    const c = v.calls.find((x) => x.direction === d && x.depart >= t);
    res[d] = c ? Math.max(0, c.arrive - t) : null;
  }
  return res;
}

/** Sabit rastgele sayı üreteci */
export function rng(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/**
 * Peronun bir yarısında yolcuların duracağı yerler, öncelik sırasıyla.
 * İlk sıradakiler merdiven diplerine ve peron kenarına yakın; kalabalık arttıkça peron dolar.
 */
export function crowdSlots(lay: StationLayout, dir: Direction, max: number, seed: number): Float32Array {
  const r = rng(seed);
  const [z0, z1] = lay.sideZ[dir];
  const edgeZ = dir === 'north' ? z0 : z1;
  const half = lay.platformLength / 2 - 2;
  const cands: { x: number; z: number; score: number }[] = [];
  let guard = 0;
  while (cands.length < max && guard++ < max * 20) {
    const x = -half + r() * 2 * half;
    const z = z0 + r() * (z1 - z0);
    const onEsc = lay.escalators.some((e) => Math.abs(z) < e.width / 2 + 0.5 && x >= Math.min(e.bottomX, e.topX) - 1 && x <= Math.max(e.bottomX, e.topX) + 1);
    const onPillar = lay.pillarsX.some((p) => Math.abs(x - p) < 0.8 && Math.abs(z) < 0.8);
    if (onEsc || onPillar) continue;
    const escDist = Math.min(...lay.escalators.map((e) => Math.abs(x - e.bottomX)));
    const score = escDist * 0.012 + Math.abs(z - edgeZ) * 0.06 + r() * 0.9;
    cands.push({ x, z, score });
  }
  cands.sort((a, b) => a.score - b.score);
  const out = new Float32Array(cands.length * 2);
  cands.forEach((c, i) => { out[i * 2] = c.x; out[i * 2 + 1] = c.z; });
  return out;
}

export const fmtClock = (t: number) => {
  const s = Math.max(0, Math.floor(t)) % 86400;
  return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`;
};
export const fmtSecs = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

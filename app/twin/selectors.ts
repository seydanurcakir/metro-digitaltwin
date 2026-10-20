// Pure functions: from a simulation result, what the scene shows at time t.
import { trainAt, type Direction, type SimOptions, type SimResult, type Trip, type TwinDataset } from '../../src/index';
import { SERVICE_START_MIN, SLOT_MINUTES } from '../../src/data/time';
import type { StationLayout } from './layout';
import type { LineDef } from './world';

const DIRS: Direction[] = ['north', 'south'];

export interface StationCall {
  tripId: number;
  direction: Direction;
  arrive: number;
  depart: number;
  units: number;
  capacity: number;
  loadFactor: number;
  boarded: number;
  alighted: number;
  leftBehind: number;
}

export interface StationView {
  stationId: string;
  order: number;
  area: number;
  dwell: number;
  /** Stop events at this station, sorted by time */
  events: SimResult['events'];
  /** Trips calling at this station, sorted by arrival */
  calls: StationCall[];
  trips: Map<number, Trip>;
  /** Arrival rate per slot (passengers/s): rate[dir][slot] */
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
  }).sort((a, b) => a.arrive - b.arrive);
  const nSlots = ds.demand.profile.slots.length;
  const rate: [Float64Array, Float64Array] = [new Float64Array(nSlots), new Float64Array(nSlots)];
  const mult = opts.demandMultiplier ?? 1;
  for (const c of ds.demand.cells)
    if (c.stationId === stationId) rate[c.direction === 'north' ? 0 : 1][c.slotIndex] = (c.arrivals * mult) / (SLOT_MINUTES * 60);
  return {
    stationId, order: st.order, area: st.platform.usableAreaM2.value, dwell: st.dwellSec.value,
    events, calls, trips: new Map(r.trips.map((t) => [t.id, t])), rate, surges: (opts.surges ?? []).filter((s) => s.stationId === stationId),
  };
}

const START = SERVICE_START_MIN * 60;
const SLOT = SLOT_MINUTES * 60;

/** Passengers arriving on the platform in one direction during [a, b) */
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

/** People on the platform at t: queue after the last train event + arrivals since then */
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
  /** Train centre along the platform axis (station frame) */
  x: number;
  z: number;
  units: number;
  length: number;
  doorsOpen: boolean;
  loadFactor: number;
  phase: 'arriving' | 'stopped' | 'departing';
}

/** Used for train status wording ("approaching", "departing") */
export const APPROACH_SEC = 40;

/**
 * Trains inside a twin's own zone at time t. Positions come from the shared kinematics (src/geo/motion),
 * so a train leaving the zone continues seamlessly as a map-layer train.
 */
export function trainsAt(v: StationView, lay: StationLayout, line: LineDef, stationArc: number, t: number): TrainState[] {
  const out: TrainState[] = [];
  const calls = v.calls;
  // First call that could still be near the station
  let lo = 0, hi = calls.length;
  const from = t - 600;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (calls[mid].depart < from) lo = mid + 1; else hi = mid;
  }
  for (let k = lo; k < calls.length; k++) {
    const c = calls[k];
    if (c.arrive > t + 600) break;
    const trip = v.trips.get(c.tripId);
    if (!trip) continue;
    const p = trainAt(line.motion, trip, t);
    if (!p) continue;
    const x = p.s - stationArc;
    if (Math.abs(x) > lay.zoneHalf) continue;
    const phase: TrainState['phase'] = t >= c.arrive && t <= c.depart ? 'stopped' : t < c.arrive ? 'arriving' : 'departing';
    out.push({
      tripId: c.tripId, direction: c.direction, x, z: c.direction === 'north' ? lay.trackZ.north : lay.trackZ.south,
      units: c.units, length: p.length, doorsOpen: phase === 'stopped' && t > c.arrive + 3 && t < c.depart - 3,
      loadFactor: c.loadFactor, phase,
    });
  }
  return out;
}

/** Seconds until the next train in each direction */
export function nextArrivals(v: StationView, t: number): Record<Direction, number | null> {
  const res = { north: null, south: null } as Record<Direction, number | null>;
  for (const d of DIRS) {
    const c = v.calls.find((x) => x.direction === d && x.depart >= t);
    res[d] = c ? Math.max(0, c.arrive - t) : null;
  }
  return res;
}

/** Seeded random number generator */
export function rng(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/**
 * Standing spots on one half of the platform, in priority order.
 * The first spots are near the escalator feet and the platform edge; the platform fills up as the crowd grows.
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
export const fmtInt = (n: number) => Math.round(n).toLocaleString('en-US');
export const fmtDec = (n: number, d = 2) => n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
export const pct = (x: number) => `${Math.round(x * 100)}%`;

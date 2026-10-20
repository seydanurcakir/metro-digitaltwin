// Metro Twin — simulation engine.
// Mesoscopic and event-based: trains follow the timetable, passengers wait on the platform in a FIFO queue.
// No UI code; results are returned as plain data.

import type { Direction, OdPeriod, ServicePlan, TwinDataset } from '../types';
import { SERVICE_END_MIN, SERVICE_START_MIN, SLOT_MINUTES } from '../data/time';

export interface SimOptions {
  /** Platform arrivals are grouped into bins of this length (s) */
  binSec?: number;
  /** Demand multiplier (stress test / scenario) */
  demandMultiplier?: number;
  /** Load factor at which boarding stops (1 = physical capacity) */
  boardingLimitFactor?: number;
  /** Extra demand: additional passengers at a station/direction/time window (e.g. after a match) */
  surges?: Surge[];
}

export interface Surge {
  stationId: string;
  direction: Direction;
  startSec: number;
  endSec: number;
  passengers: number;
}

/** One train's call at one station */
export interface StopEvent {
  t: number;
  tripId: number;
  stationId: string;
  stationOrder: number;
  direction: Direction;
  /** People on the platform before the train arrives (both directions) */
  platformBefore: number;
  /** People on the platform after the train leaves (both directions) */
  platformAfter: number;
  /** Queue per direction after the train leaves [north, south] */
  queueAfter: [number, number];
  /** Platform density just before the train (people/m²) */
  densityBefore: number;
  alighted: number;
  boarded: number;
  /** Passengers left behind because the train was full (this direction) */
  leftBehind: number;
  /** Passenger load on departure */
  loadAfter: number;
  capacity: number;
}

export interface Trip {
  id: number;
  direction: Direction;
  /** Departure from the first stop (s since start of day) */
  departSec: number;
  units: number;
  capacity: number;
  /** Arrival times in stop order */
  stops: { stationOrder: number; t: number }[];
}

/** Groups of boarding passengers (for the waiting-time distribution) */
export interface WaitRecords {
  stationOrder: Int16Array;
  direction: Uint8Array; // 0 north, 1 south
  arrivalSec: Float64Array;
  waitSec: Float64Array;
  passengers: Float64Array;
  length: number;
}

export interface SimResult {
  planId: string;
  trips: Trip[];
  events: StopEvent[];
  waits: WaitRecords;
  totals: { arrived: number; boarded: number; alighted: number; unservedAtClose: number };
}

interface Cohort { t: number; n: number; slot: number }

const DIR_IDX: Record<Direction, number> = { north: 0, south: 1 };

export function simulate(ds: TwinDataset, plan: ServicePlan, opts: SimOptions = {}): SimResult {
  const binSec = opts.binSec ?? 30;
  const mult = opts.demandMultiplier ?? 1;
  const limitFactor = opts.boardingLimitFactor ?? 1;
  const { line, demand, fleet } = ds;
  const st = line.stations;
  const n = st.length;
  const unitCap = fleet.unitType.seats.value + fleet.unitType.standing.value;
  const startSec = SERVICE_START_MIN * 60;
  const endSec = SERVICE_END_MIN * 60;
  const slotSec = SLOT_MINUTES * 60;
  const slotAt = (t: number) => Math.min(plan.slots.length - 1, Math.max(0, Math.floor((t - startSec) / slotSec)));
  const idx = new Map(st.map((s) => [s.id, s.order]));

  // Arrival rate: rate[slot][station][dir] (passengers/s)
  const nSlots = demand.profile.slots.length;
  const rate = new Float64Array(nSlots * n * 2);
  for (const c of demand.cells) rate[(c.slotIndex * n + idx.get(c.stationId)!) * 2 + DIR_IDX[c.direction]] = (c.arrivals * mult) / slotSec;

  // Destination shares: od[period][origin][dir] -> Float64Array(n)
  const od = new Map<string, Float64Array>();
  for (const r of demand.od) {
    const v = new Float64Array(n);
    for (const [d, sh] of Object.entries(r.destinationShares)) v[idx.get(d)!] = sh;
    od.set(`${r.period}|${idx.get(r.originId)}|${DIR_IDX[r.direction]}`, v);
  }
  const periods: OdPeriod[] = demand.periodBySlot;

  // Timetable: departures from both terminals
  const runAfter = line.segments.map((g) => g.runTimeSec.value); // order k -> k+1
  const dwell = st.map((s) => (s.isTerminal ? 0 : s.dwellSec.value));
  const trips: Trip[] = [];
  let tripId = 0;
  // Warm-up: the first trips start one one-way trip time early, so trains are already spread along the line at 05:00.
  const oneWaySec = runAfter.reduce((a, b) => a + b, 0) + dwell.reduce((a, b) => a + b, 0);
  for (const dir of ['north', 'south'] as Direction[]) {
    const route = dir === 'north' ? st.map((s) => s.order) : st.map((s) => s.order).reverse();
    let t = startSec - oneWaySec;
    while (t < endSec) {
      const ps = plan.slots[slotAt(t)];
      const stops: Trip['stops'] = [];
      let clock = t;
      route.forEach((k, i) => {
        if (i > 0) {
          const prev = route[i - 1];
          clock += runAfter[Math.min(prev, k)];
        }
        stops.push({ stationOrder: k, t: clock });
        clock += dwell[k];
      });
      trips.push({ id: tripId++, direction: dir, departSec: t, units: ps.unitsPerTrain, capacity: ps.unitsPerTrain * unitCap, stops });
      t += ps.headwayMin * 60;
    }
  }

  // Platform queues
  const queues: Cohort[][] = Array.from({ length: n * 2 }, () => []);
  const filled = new Float64Array(n * 2).fill(startSec);
  let arrived = 0;
  const surges = (opts.surges ?? []).map((s) => ({ ...s, q: idx.get(s.stationId)! * 2 + DIR_IDX[s.direction] }));
  const fill = (q: number, Tin: number) => {
    const T = Math.min(Tin, endSec); // no arrivals after service closes
    let a = filled[q];
    while (a < T - 1e-9) {
      const b = Math.min(T, (Math.floor(a / binSec) + 1) * binSec);
      const slot = slotAt(a);
      let num = rate[(slot * n + (q >> 1)) * 2 + (q & 1)] * (b - a);
      for (const s of surges) if (s.q === q) {
        const ov = Math.max(0, Math.min(b, s.endSec) - Math.max(a, s.startSec));
        if (ov > 0) num += (s.passengers * ov) / (s.endSec - s.startSec);
      }
      if (num > 0) {
        queues[q].push({ t: (a + b) / 2, n: num, slot });
        arrived += num;
      }
      a = b;
    }
    filled[q] = Math.max(filled[q], T);
  };
  const qSize = (q: number) => queues[q].reduce((x, c) => x + c.n, 0);

  // Sort events by time
  type Ev = { t: number; trip: Trip; i: number };
  const evs: Ev[] = [];
  for (const tr of trips) tr.stops.forEach((s, i) => evs.push({ t: s.t, trip: tr, i }));
  evs.sort((x, y) => x.t - y.t || x.trip.id - y.trip.id || x.i - y.i);

  const onboard = new Map<number, Float64Array>(trips.map((tr) => [tr.id, new Float64Array(n)]));
  const events: StopEvent[] = [];
  const W = { so: [] as number[], d: [] as number[], a: [] as number[], w: [] as number[], p: [] as number[] };
  let boardedTot = 0;
  let alightedTot = 0;

  for (const ev of evs) {
    const { trip, i, t } = ev;
    const k = trip.stops[i].stationOrder;
    const d = DIR_IDX[trip.direction];
    const q = k * 2 + d;
    fill(k * 2, t);
    fill(k * 2 + 1, t);
    const ob = onboard.get(trip.id)!;

    const alighted = ob[k];
    ob[k] = 0;
    alightedTot += alighted;

    const before = qSize(k * 2) + qSize(k * 2 + 1);
    const area = st[k].platform.usableAreaM2.value;
    let boarded = 0;
    const isLast = i === trip.stops.length - 1;
    if (!isLast) {
      let load = ob.reduce((x, y) => x + y, 0);
      let space = Math.max(0, trip.capacity * limitFactor - load);
      const queue = queues[q];
      while (queue.length && space > 1e-9) {
        const c = queue[0];
        const m = Math.min(c.n, space);
        const shares = od.get(`${periods[c.slot]}|${k}|${d}`);
        if (shares) for (let j = 0; j < n; j++) ob[j] += m * shares[j];
        W.so.push(k); W.d.push(d); W.a.push(c.t); W.w.push(t - c.t); W.p.push(m);
        boarded += m;
        space -= m;
        c.n -= m;
        if (c.n <= 1e-9) queue.shift();
      }
      boardedTot += boarded;
    }
    const loadAfter = ob.reduce((x, y) => x + y, 0);
    const qN = qSize(k * 2);
    const qS = qSize(k * 2 + 1);
    const after = qN + qS;
    events.push({
      t, tripId: trip.id, stationId: st[k].id, stationOrder: k, direction: trip.direction,
      platformBefore: before, platformAfter: after, queueAfter: [qN, qS], densityBefore: before / area,
      alighted, boarded, leftBehind: isLast ? 0 : qSize(q), loadAfter, capacity: trip.capacity,
    });
  }

  for (let q = 0; q < n * 2; q++) fill(q, endSec);
  const unservedAtClose = queues.reduce((x, qu) => x + qu.reduce((y, c) => y + c.n, 0), 0);

  const len = W.p.length;
  return {
    planId: plan.id,
    trips,
    events,
    waits: {
      stationOrder: Int16Array.from(W.so), direction: Uint8Array.from(W.d), arrivalSec: Float64Array.from(W.a),
      waitSec: Float64Array.from(W.w), passengers: Float64Array.from(W.p), length: len,
    },
    totals: { arrived, boarded: boardedTot, alighted: alightedTot, unservedAtClose },
  };
}

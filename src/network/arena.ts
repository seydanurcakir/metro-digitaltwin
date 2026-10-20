// Event crowd flow from Strawberry Arena to Solna station (Scenario 2).
// After the event, visitors leave the bowl following an egress curve. The rail-bound share walks to the
// station along one pedestrian route whose width caps the flow: excess people queue at the arena end.
// After the walking time they arrive on the Solna platforms, split by direction, as simulation surges.

import type { Direction } from '../types';
import type { Surge } from '../sim/engine';
import type { Arena, ArenaEvent } from '../data/arena';
import { hhmmToSec } from '../sim/kpi';

export const ARENA_BIN_SEC = 60;
/** Minutes after the end that the egress curve covers */
const EGRESS_SPAN_MIN = 90;

export interface ArenaFlow {
  endSec: number;
  binSec: number;
  attendance: number;
  /** Visitors leaving the bowl in each bin after the end */
  released: Float64Array;
  /** Rail-bound visitors leaving the bowl in each bin */
  railReleased: Float64Array;
  /** Rail-bound visitors entering the walkway in each bin (capped by its capacity) */
  walkIn: Float64Array;
  /** Queue at the arena end of the walkway at the end of each bin */
  queue: Float64Array;
  /** Rail-bound visitors arriving at the station in each bin */
  arrivals: Float64Array;
  railFans: number;
  /** People per bin the walkway can carry */
  capacityPerBin: number;
  walkSec: number;
}

/**
 * Share of visitors leaving in each minute after the end: gamma-shaped (shape 2), scaled so that
 * 90% have left after p90 minutes.
 */
export function egressShares(p90Min: number, spanMin = EGRESS_SPAN_MIN): Float64Array {
  // For shape 2 the CDF is 1 − e^(−x)(1 + x); its 90% point is x ≈ 3.8897
  const theta = p90Min / 3.8897;
  const cdf = (m: number) => 1 - Math.exp(-m / theta) * (1 + m / theta);
  const w = new Float64Array(spanMin);
  for (let k = 0; k < spanMin; k++) w[k] = cdf(k + 1) - cdf(k);
  const total = w.reduce((a, b) => a + b, 0);
  for (let k = 0; k < spanMin; k++) w[k] /= total;
  return w;
}

export function buildArenaFlow(arena: Arena, event: ArenaEvent): ArenaFlow {
  const binSec = ARENA_BIN_SEC;
  const shares = egressShares(arena.egressP90Min.value);
  const n = shares.length + 120; // room for the queue to drain and the walk
  const attendance = event.attendance.value;
  const released = new Float64Array(n), railReleased = new Float64Array(n);
  for (let k = 0; k < shares.length; k++) {
    released[k] = attendance * shares[k];
    railReleased[k] = released[k] * arena.railShare.value;
  }
  const capacityPerBin = arena.walkway.widthM.value * arena.walkway.flowPerMetrePerMin.value * (binSec / 60);
  const walkSec = arena.walkway.lengthM.value / arena.walkway.speedMs.value;
  const walkBins = Math.round(walkSec / binSec);
  const walkIn = new Float64Array(n), queue = new Float64Array(n), arrivals = new Float64Array(n);
  let q = 0;
  for (let k = 0; k < n; k++) {
    q += railReleased[k];
    const go = Math.min(q, capacityPerBin);
    q -= go;
    walkIn[k] = go;
    queue[k] = q;
    if (k + walkBins < n) arrivals[k + walkBins] += go;
  }
  return {
    endSec: hhmmToSec(event.end), binSec, attendance, released, railReleased, walkIn, queue, arrivals,
    railFans: railReleased.reduce((a, b) => a + b, 0), capacityPerBin, walkSec,
  };
}

/** The station-side arrivals as simulation surges at Solna, one per minute and direction */
export function arenaSurges(flow: ArenaFlow, southShare: number, stationId = 'solna'): Surge[] {
  const out: Surge[] = [];
  flow.arrivals.forEach((a, k) => {
    if (a <= 0) return;
    const startSec = flow.endSec + k * flow.binSec;
    for (const [dir, share] of [['south', southShare], ['north', 1 - southShare]] as [Direction, number][])
      if (share > 0) out.push({ stationId, direction: dir, startSec, endSec: startSec + flow.binSec, passengers: a * share });
  });
  return out;
}

export type ArenaPhase = 'before gates open' | 'gates open' | 'event in progress' | 'egress' | 'cleared';

export interface ArenaState {
  phase: ArenaPhase;
  /** Visitors inside the bowl */
  inside: number;
  /** Rail-bound visitors waiting to enter the walkway */
  queue: number;
  /** Rail-bound visitors walking to the station */
  onWalkway: number;
  /** Rail-bound visitors who have reached the station */
  atStation: number;
  /** Visitors who have left the bowl (all modes) */
  left: number;
}

const cumAt = (a: Float64Array, bins: number) => {
  let s = 0;
  const whole = Math.floor(bins);
  for (let k = 0; k < Math.min(whole, a.length); k++) s += a[k];
  if (whole < a.length && bins > whole) s += a[whole] * (bins - whole);
  return s;
};

export function arenaStateAt(flow: ArenaFlow, event: ArenaEvent, t: number): ArenaState {
  const gates = hhmmToSec(event.gatesOpen), start = hhmmToSec(event.start);
  if (t < gates) return { phase: 'before gates open', inside: 0, queue: 0, onWalkway: 0, atStation: 0, left: 0 };
  if (t < flow.endSec) {
    // Visitors arrive between gate opening and kick-off (smooth S-curve)
    const u = Math.min(1, (t - gates) / (start - gates));
    const inside = flow.attendance * u * u * (3 - 2 * u);
    return { phase: t < start ? 'gates open' : 'event in progress', inside, queue: 0, onWalkway: 0, atStation: 0, left: 0 };
  }
  const bins = (t - flow.endSec) / flow.binSec;
  const left = cumAt(flow.released, bins);
  const walked = cumAt(flow.walkIn, bins);
  const atStation = cumAt(flow.arrivals, bins);
  const railLeft = cumAt(flow.railReleased, bins);
  const queue = Math.max(0, railLeft - walked);
  const onWalkway = Math.max(0, walked - atStation);
  const inside = Math.max(0, flow.attendance - left);
  const cleared = inside < 1 && queue < 1 && onWalkway < 1;
  return { phase: cleared ? 'cleared' : 'egress', inside, queue, onWalkway, atStation, left };
}

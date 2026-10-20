// Match-day metrics for the Strawberry Arena twin, computed from the corridor simulation: how fast the
// event crowd clears through Solna station, compared with the same day without the event.
import { SOLNA_ID } from '../../src/index';
import { SIMULATED_EVENT, STRAWBERRY_ARENA } from '../../src/data/arena';
import { getArenaFlow, getCorridor } from './network';
import type { ScenarioId } from './model';

export interface EventMetrics {
  railFans: number;
  /** Seconds from the final whistle until 90% of the rail-bound crowd has boarded at Solna (null: not by close) */
  dispersionSec: number | null;
  /** Seconds from the final whistle until the walkway queue at the arena is gone */
  walkwayQueueClearSec: number;
  walkwayPeakQueue: number;
  /** Highest platform count and density at Solna in the three hours after the event */
  peakPlatform: number;
  peakDensity: number;
  densityLimit: number;
  leftBehind: number;
  maxDepartureLoad: number;
  loadLimit: number;
  /** Trains calling at Solna in the two hours after the event */
  trains: number;
}

const cache = new Map<string, EventMetrics>();

export function eventMetrics(planId: string, scenario: ScenarioId): EventMetrics | null {
  const key = `${planId}|${scenario}`;
  if (cache.has(key)) return cache.get(key)!;
  const ev = getCorridor(planId, scenario);
  if (!ev.arena) return null;
  const base = getCorridor(planId, 'normal');
  const flow = getArenaFlow();
  const ds = ev.corridor.ds;
  const order = ds.line.stations.find((s) => s.id === SOLNA_ID)!.order;
  const area = ds.line.stations[order].platform.usableAreaM2.value;
  const t0 = flow.endSec, t1 = t0 + 3 * 3600;
  const at = (r: typeof ev.result) => r.events.filter((e) => e.stationOrder === order && e.t >= t0 && e.t < t1);
  const evE = at(ev.result), baseE = at(base.result);

  // Extra boardings caused by the event, minute by minute
  let dispersionSec: number | null = null;
  for (let m = 0; m <= 180; m++) {
    const tt = t0 + m * 60;
    const extra = evE.filter((e) => e.t <= tt).reduce((a, e) => a + e.boarded, 0) - baseE.filter((e) => e.t <= tt).reduce((a, e) => a + e.boarded, 0);
    if (extra >= 0.9 * flow.railFans) { dispersionSec = m * 60; break; }
  }
  let lastQ = 0;
  flow.queue.forEach((q, k) => { if (q > 0.5) lastQ = k + 1; });
  const m: EventMetrics = {
    railFans: flow.railFans,
    dispersionSec,
    walkwayQueueClearSec: lastQ * flow.binSec,
    walkwayPeakQueue: Math.max(...flow.queue),
    peakPlatform: Math.max(0, ...evE.map((e) => e.platformBefore)),
    peakDensity: Math.max(0, ...evE.map((e) => e.platformBefore)) / area,
    densityLimit: ds.constraints.platformDensityLimit.value,
    leftBehind: evE.reduce((a, e) => a + e.leftBehind, 0),
    maxDepartureLoad: Math.max(0, ...evE.filter((e) => e.capacity > 0).map((e) => e.loadAfter / e.capacity)),
    loadLimit: ds.constraints.maxLoadFactor.value,
    trains: evE.filter((e) => e.t < t0 + 7200).length,
  };
  cache.set(key, m);
  return m;
}

export const ARENA_INFO = { arena: STRAWBERRY_ARENA, event: SIMULATED_EVENT };

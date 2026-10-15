import type { Line, ServicePlan, TwinDataset } from './types';
import { LINE_T14 } from './data/line-t14';
import { FLEET } from './data/fleet';
import { buildWeekdayProfile, SLOT_MINUTES } from './data/time';
import { buildDemand } from './data/demand';
import { CONSTRAINTS, CURRENT_PLAN, SAMPLE_CANDIDATE, T13_ON_TRUNK } from './data/plans';
import { SOURCES } from './data/sources';
import optimizedPlans from './data/optimized-plans.json';

export * from './types';
export { trainCapacity, unitCapacity } from './data/fleet';
export { SLOTS, slotIndexAt, minToLabel } from './data/time';

/** Tüm veri setini kurar. Simülasyon ve 3D sahne yalnızca bunu okur. */
export function buildDataset(): TwinDataset {
  const profile = buildWeekdayProfile();
  return {
    line: LINE_T14,
    fleet: FLEET,
    demand: buildDemand(LINE_T14, profile),
    // Önerilen planlar scripts/optimize.ts ile üretilir (npm run optimize)
    plans: [CURRENT_PLAN, SAMPLE_CANDIDATE, ...(optimizedPlans as ServicePlan[])],
    otherLine: T13_ON_TRUNK,
    constraints: CONSTRAINTS,
    sources: SOURCES,
  };
}

/** Bir turun süresi (dk): iki yön yolculuk + bekleme + iki son durak dönüşü */
export function cycleTimeMin(line: Line): number {
  const run = line.segments.reduce((a, s) => a + s.runTimeSec.value, 0);
  const dwell = line.stations.filter((s) => !s.isTerminal).reduce((a, s) => a + s.dwellSec.value, 0);
  return (2 * (run + dwell) + 2 * line.turnaroundSec.value) / 60;
}

/** Planın bir dilimde gerektirdiği ünite sayısı */
export function unitsRequired(line: Line, plan: ServicePlan, slotIndex: number): number {
  const p = plan.slots[slotIndex];
  return Math.ceil(cycleTimeMin(line) / p.headwayMin) * p.unitsPerTrain;
}

export { SLOT_MINUTES };
export { simulate } from './sim/engine';
export type { SimOptions, SimResult, StopEvent, Trip, Surge } from './sim/engine';
export { computeKpis, slotSeries, platformTrace, weightedPercentile, hhmmToSec } from './sim/kpi';

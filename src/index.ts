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

/** Builds the full dataset. The simulation and the 3D scene only read this. */
export function buildDataset(): TwinDataset {
  const profile = buildWeekdayProfile();
  return {
    line: LINE_T14,
    fleet: FLEET,
    demand: buildDemand(LINE_T14, profile),
    // Recommended plans are produced by scripts/optimize.ts (npm run optimize)
    plans: [CURRENT_PLAN, SAMPLE_CANDIDATE, ...(optimizedPlans as ServicePlan[])],
    otherLine: T13_ON_TRUNK,
    constraints: CONSTRAINTS,
    sources: SOURCES,
  };
}

/** Duration of one round trip (min): both directions incl. dwell + turnaround at both terminals */
export function cycleTimeMin(line: Line): number {
  const run = line.segments.reduce((a, s) => a + s.runTimeSec.value, 0);
  const dwell = line.stations.filter((s) => !s.isTerminal).reduce((a, s) => a + s.dwellSec.value, 0);
  return (2 * (run + dwell) + 2 * line.turnaroundSec.value) / 60;
}

/** Units a plan needs in one slot */
export function unitsRequired(line: Line, plan: ServicePlan, slotIndex: number): number {
  const p = plan.slots[slotIndex];
  return Math.ceil(cycleTimeMin(line) / p.headwayMin) * p.unitsPerTrain;
}

export { SLOT_MINUTES };
export { simulate } from './sim/engine';
export type { SimOptions, SimResult, StopEvent, Trip, Surge } from './sim/engine';
export { computeKpis, slotSeries, platformTrace, weightedPercentile, hhmmToSec } from './sim/kpi';
export { buildNetwork, route, headwayAt } from './network/network';
export type { Network, NetworkNode, NetworkEdge, Route, RouteLeg, LineEntry } from './network/network';
export { buildCorridor, buildStockholmNetwork, transferStream, TC_ID, CITY_ID, SOLNA_ID } from './network/integration';
export type { Corridor, TransferStream } from './network/integration';
export { StationAgent } from './network/station-agent';
export type { StationState, SlotKpi } from './network/station-agent';
export { ORIGIN, toLocal, toLatLon, tileSizeM, localToTile, tileOrigin, bearingToVec, haversine } from './geo/projection';
export type { LatLon, XZ } from './geo/projection';
export { STATION_GEO, PLATFORM_AXIS, SHAPE_POINTS } from './geo/geodata';
export { buildAlignment, poseAt, slice } from './geo/alignment';
export type { Alignment, Pose } from './geo/alignment';
export { motionModel, trainAt, trainLength, stopOffset, runProfile } from './geo/motion';
export type { MotionModel, TrainAt } from './geo/motion';

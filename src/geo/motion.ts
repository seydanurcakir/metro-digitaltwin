// Train kinematics along an alignment, driven only by the simulated timetable (Trip.stops).
// Between two stops a train follows a trapezoidal speed profile (accelerate, cruise, brake),
// so the map layer and the 3D station twins compute exactly the same position at any time t.

import type { Direction, Fleet, Line } from '../types';
import type { Trip } from '../sim/engine';
import type { Alignment } from './alignment';

/** Share of a run spent accelerating (and the same share braking) */
export const ACCEL_SHARE = 0.25;
export const UNIT_GAP_M = 0.6;

export interface MotionModel {
  al: Alignment;
  dwell: number[];
  halfPlatform: number[];
  isBoundary: boolean[];
  unitLength: number;
}

export function motionModel(line: Line, fleet: Fleet, al: Alignment): MotionModel {
  const st = line.stations;
  return {
    al,
    dwell: st.map((s) => (s.isTerminal ? 0 : s.dwellSec.value)),
    halfPlatform: st.map((s) => s.platform.lengthM.value / 2),
    isBoundary: st.map((s) => !!s.isBoundary),
    unitLength: fleet.unitType.lengthM.value,
  };
}

export const trainLength = (m: MotionModel, units: number) => units * m.unitLength + (units - 1) * UNIT_GAP_M;

/** Offset of the train centre from the station centre while stopped: the train stops at the far end of the platform */
export function stopOffset(m: MotionModel, order: number, dir: Direction, len: number): number {
  if (m.isBoundary[order]) return 0;
  const sign = dir === 'north' ? 1 : -1;
  return sign * Math.max(0, m.halfPlatform[order] - len / 2 - 2);
}

/** Fraction of the distance covered after fraction tau of the run time */
export function runProfile(tau: number): number {
  const p = ACCEL_SHARE;
  const x = Math.max(0, Math.min(1, tau));
  const k = 2 * p * (1 - p);
  if (x < p) return (x * x) / k;
  if (x > 1 - p) return 1 - ((1 - x) * (1 - x)) / k;
  return (x - p / 2) / (1 - p);
}

export interface TrainAt {
  /** Arc position of the train centre */
  s: number;
  phase: 'dwell' | 'run';
  /** Index in trip.stops of the last stop reached */
  i: number;
  /** Progress of the current run, 0–1 (0 while dwelling) */
  progress: number;
  length: number;
}

/** Where a trip is at time t, or null before its first departure / after its last arrival */
export function trainAt(m: MotionModel, trip: Trip, t: number): TrainAt | null {
  const stops = trip.stops;
  const last = stops.length - 1;
  if (t < stops[0].t || t > stops[last].t) return null;
  let lo = 0, hi = last;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (stops[mid].t <= t) lo = mid; else hi = mid - 1;
  }
  const len = trainLength(m, trip.units);
  const arcAt = (k: number) => {
    const o = stops[k].stationOrder;
    return m.al.stationArc[o] + stopOffset(m, o, trip.direction, len);
  };
  const a = stops[lo];
  const depart = a.t + m.dwell[a.stationOrder];
  if (lo === last || t <= depart) return { s: arcAt(lo), phase: 'dwell', i: lo, progress: 0, length: len };
  const b = stops[lo + 1];
  const tau = (t - depart) / Math.max(1, b.t - depart);
  const s0 = arcAt(lo), s1 = arcAt(lo + 1);
  return { s: s0 + (s1 - s0) * runProfile(tau), phase: 'run', i: lo, progress: tau, length: len };
}

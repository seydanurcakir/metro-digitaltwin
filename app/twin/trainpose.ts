// World pose of a simulated train on the map (pure). Shared by the map train layer, camera follow and panels.
import { poseAt, trainAt, type Pose, type Trip } from '../../src/index';
import { LINES, TWINS, type LineKey } from './world';

/** Lateral distance of each track from the line centre on the map (m) */
export const TRACK_OFFSET_M = 6;

export interface TrainPose {
  x: number;
  z: number;
  /** Rotation about y that aligns the train's long axis with the line */
  yaw: number;
  length: number;
  /** Arc position along the line */
  s: number;
  /** True while the train is inside its line's 3D twin zone (drawn by the twin, not the map layer) */
  inTwin: boolean;
  phase: 'dwell' | 'run';
}

const tmp: Pose = { x: 0, z: 0, dx: 1, dz: 0 };

export function trainPose(line: LineKey, trip: Trip, t: number): TrainPose | null {
  const L = LINES[line];
  const p = trainAt(L.motion, trip, t);
  if (!p) return null;
  poseAt(L.al, p.s, tmp);
  // Northbound trains run on the left of the line direction, southbound on the right (as in the station twins)
  const side = trip.direction === 'north' ? 1 : -1;
  const tw = TWINS[L.twin];
  return {
    x: tmp.x + tmp.dz * TRACK_OFFSET_M * side,
    z: tmp.z - tmp.dx * TRACK_OFFSET_M * side,
    yaw: Math.atan2(-tmp.dz, tmp.dx),
    length: p.length,
    s: p.s,
    inTwin: Math.abs(p.s - tw.arc) < tw.layout.zoneHalf,
    phase: p.phase,
  };
}

export interface CarPose {
  x: number;
  z: number;
  yaw: number;
}

/**
 * The train split into `n` equal cars, each placed and turned on the line at its own arc position,
 * so the whole train bends with the track. `drawLength` may exceed the real length (minimum on-screen size).
 */
export function trainCars(line: LineKey, trip: Trip, centreS: number, drawLength: number, n: number, out: CarPose[]): number {
  const L = LINES[line];
  const side = trip.direction === 'north' ? 1 : -1;
  // Cars ordered from the train's front to its back, in its direction of travel
  const fwd = trip.direction === 'north' ? 1 : -1;
  const car = drawLength / n;
  for (let i = 0; i < n; i++) {
    const s = centreS + fwd * (drawLength / 2 - car * (i + 0.5));
    // Past either end of the line, continue straight along the end direction instead of piling up
    const sc = Math.max(0, Math.min(L.al.length, s));
    poseAt(L.al, sc, tmp);
    const c = out[i] ?? (out[i] = { x: 0, z: 0, yaw: 0 });
    c.x = tmp.x + tmp.dx * (s - sc) + tmp.dz * TRACK_OFFSET_M * side;
    c.z = tmp.z + tmp.dz * (s - sc) - tmp.dx * TRACK_OFFSET_M * side;
    c.yaw = Math.atan2(-tmp.dz, tmp.dx);
  }
  return car;
}

/** Trips of a result that are on the line at t (between first departure and last arrival) */
export function activeTrips(trips: Trip[], t: number): Trip[] {
  return trips.filter((tr) => t >= tr.stops[0].t && t <= tr.stops[tr.stops.length - 1].t);
}

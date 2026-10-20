// Pure calculations for the inspector panel. Every number comes from a simulation result or the data model.
import type { Direction, Provenance, SimResult, TwinDataset } from '../../src/index';
import { APPROACH_SEC, arrivalsBetween, fmtInt, platformAt, type StationView } from './selectors';
import type { LineDef } from './world';

export interface TripStop {
  order: number;
  name: string;
  arrive: number;
  depart: number;
  loadFactor: number;
  boarded: number;
  alighted: number;
  /** Virtual boundary node of the corridor (not a real stop) */
  virtual: boolean;
}

export type TrainStatus = 'en route' | 'approaching' | 'at the platform' | 'departing' | 'passed';

export interface TripDetail {
  code: string;
  direction: Direction;
  units: number;
  capacity: number;
  stops: TripStop[];
  /** Where the train is at t: at a stop (index) or between two stops (fromIndex → fromIndex+1) */
  where: { kind: 'before' } | { kind: 'at'; index: number } | { kind: 'between'; fromIndex: number; progress: number } | { kind: 'done' };
  /** Status relative to the line's 3D twin station */
  focus: { status: TrainStatus; stop: TripStop } | null;
  /** Next real stop and seconds until arrival */
  next: { stop: TripStop; inSec: number } | null;
  peak: TripStop;
}

export function tripDetail(line: LineDef, ds: TwinDataset, r: SimResult, tripId: number, t: number, focusStationId?: string): TripDetail | null {
  const trip = r.trips.find((x) => x.id === tripId);
  if (!trip) return null;
  const evs = new Map(r.events.filter((e) => e.tripId === tripId).map((e) => [e.stationOrder, e]));
  const stops: TripStop[] = trip.stops.map((s) => {
    const st = ds.line.stations[s.stationOrder];
    const e = evs.get(s.stationOrder)!;
    return {
      order: s.stationOrder, name: st.name, arrive: s.t, depart: s.t + (st.isTerminal ? 0 : st.dwellSec.value),
      loadFactor: e.loadAfter / e.capacity, boarded: e.boarded, alighted: e.alighted, virtual: !!st.isBoundary,
    };
  });
  let where: TripDetail['where'];
  if (t < stops[0].arrive) where = { kind: 'before' };
  else if (t > stops[stops.length - 1].arrive) where = { kind: 'done' };
  else {
    const i = stops.findIndex((s) => t >= s.arrive && t <= s.depart);
    if (i >= 0) where = { kind: 'at', index: i };
    else {
      const j = stops.findIndex((s, k) => k < stops.length - 1 && t > s.depart && t < stops[k + 1].arrive);
      where = { kind: 'between', fromIndex: j, progress: (t - stops[j].depart) / (stops[j + 1].arrive - stops[j].depart) };
    }
  }
  let focus: TripDetail['focus'] = null;
  const focusOrder = focusStationId != null ? ds.line.stations.find((s) => s.id === focusStationId)?.order : undefined;
  const fs = stops.find((s) => s.order === focusOrder);
  if (fs) {
    const status: TrainStatus =
      t < fs.arrive - APPROACH_SEC ? 'en route' : t < fs.arrive ? 'approaching' : t <= fs.depart ? 'at the platform' : t <= fs.depart + APPROACH_SEC ? 'departing' : 'passed';
    focus = { status, stop: fs };
  }
  const nextStop = stops.find((s) => !s.virtual && s.arrive > t);
  const real = stops.filter((s) => !s.virtual);
  const peak = real.slice(0, -1).reduce((a, b) => (b.loadFactor > a.loadFactor ? b : a), real[0]);
  return {
    code: line.code(trip.id), direction: trip.direction, units: trip.units, capacity: trip.capacity, stops, where, focus,
    next: nextStop ? { stop: nextStop, inSec: nextStop.arrive - t } : null, peak,
  };
}

/** Short text for where a train is, e.g. "Odenplan → Solna" or "at Solna" */
export function whereText(d: TripDetail): string {
  const w = d.where;
  const nm = (i: number) => d.stops[i].name.replace(/^(South|North) boundary.*$/, (m) => (m.startsWith('South') ? 'south of City' : 'north of Ulriksdal'));
  if (w.kind === 'before') return 'not yet departed';
  if (w.kind === 'done') return 'arrived';
  if (w.kind === 'at') return `at ${nm(w.index)}`;
  return `${nm(w.fromIndex)} → ${nm(w.fromIndex + 1)}`;
}

export interface SideDetail {
  direction: Direction;
  count: number;
  /** Density over the platform area assigned to this direction */
  density: number;
  areaM2: number;
  next: { tripId: number; code: string; eta: number; units: number; capacity: number; loadFactor: number; boarded: number; leftBehind: number }[];
  series: number[];
  seriesStepSec: number;
}

export function sideDetail(ds: TwinDataset, line: LineDef, view: StationView, dir: Direction, t: number): SideDetail {
  const st = ds.line.stations[view.order];
  const area = st.platform.usableAreaM2.value * st.platform.areaShareByDirection.value;
  const p = platformAt(view, t);
  const count = dir === 'north' ? p.north : p.south;
  const next = view.calls
    .filter((c) => c.direction === dir && c.depart >= t)
    .slice(0, 3)
    .map((c) => ({ tripId: c.tripId, code: line.code(c.tripId), eta: Math.max(0, c.arrive - t), units: c.units, capacity: c.capacity, loadFactor: c.loadFactor, boarded: c.boarded, leftBehind: c.leftBehind }));
  const step = 30;
  const n = 60; // last 30 minutes
  const series = Array.from({ length: n + 1 }, (_, i) => {
    const q = platformAt(view, t - (n - i) * step);
    return dir === 'north' ? q.north : q.south;
  });
  return { direction: dir, count, density: count / area, areaM2: area, next, series, seriesStepSec: step };
}

export interface EscalatorDetail {
  name: string;
  /** People going down to the platform (per minute) */
  downPerMin: number;
  /** People leaving the platform (per minute), average of the last 5 minutes */
  upPerMin: number;
  share: number;
}

export function escalatorDetail(view: StationView, name: string, count: number, t: number): EscalatorDetail {
  const share = 1 / count;
  const down = (arrivalsBetween(view, 0, t - 60, t) + arrivalsBetween(view, 1, t - 60, t)) * share;
  const alighted = view.calls.filter((c) => c.arrive <= t && c.arrive > t - 300).reduce((a, c) => a + c.alighted, 0);
  return { name, downPerMin: down, upPerMin: (alighted / 5) * share, share };
}

export interface FactRow {
  label: string;
  value: string;
  src: Provenance;
}

export function stationFacts(ds: TwinDataset, stationId: string, mode: 'metro' | 'commuter'): FactRow[] {
  const st = ds.line.stations.find((s) => s.id === stationId)!;
  return [
    { label: mode === 'metro' ? 'Red line boardings per day' : 'Commuter rail boardings per day', value: fmtInt(st.boardingsPerDay.value), src: st.boardingsPerDay.src },
    { label: mode === 'metro' ? 'Share on T14' : 'Share on J40/J41/42X', value: `${Math.round(st.lineShare.value * 100)}%`, src: st.lineShare.src },
    { label: 'Platform length', value: `${st.platform.lengthM.value} m`, src: st.platform.lengthM.src },
    { label: 'Waiting area', value: `${fmtInt(st.platform.usableAreaM2.value)} m²`, src: st.platform.usableAreaM2.src },
    { label: 'Dwell time (doors open)', value: `${st.dwellSec.value} s`, src: st.dwellSec.src },
    { label: 'Safe density limit', value: `${ds.constraints.platformDensityLimit.value.toFixed(1)} people/m²`, src: ds.constraints.platformDensityLimit.src },
  ];
}

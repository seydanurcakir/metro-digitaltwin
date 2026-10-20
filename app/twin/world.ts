// The geographic world of the twin: line alignments on the map, train kinematics per line and the two
// stations that have a full 3D twin. Everything here is static (independent of plan and time).
import { STRAWBERRY_ARENA } from '../../src/data/arena';
import {
  bearingToVec, buildAlignment, motionModel, poseAt, toLocal, PLATFORM_AXIS, STATION_GEO,
  type Alignment, type Direction, type Fleet, type Line, type MotionModel, type Station, type XZ,
} from '../../src/index';
import { LINE_T14 } from '../../src/data/line-t14';
import { FLEET } from '../../src/data/fleet';
import { CORRIDOR_SOLNA, FLEET_X60 } from '../../src/data/corridor-solna';
import { buildLayout, type StationKind, type StationLayout } from './layout';

export type LineKey = 'T14' | 'PENDEL';
export type TwinId = 'tc' | 'solna';

export interface LineDef {
  key: LineKey;
  line: Line;
  fleet: Fleet;
  name: string;
  short: string;
  color: string;
  /** Unit type label, e.g. "C20" */
  unit: string;
  al: Alignment;
  motion: MotionModel;
  dirName: Record<Direction, string>;
  code: (tripId: number) => string;
  /** Station with a 3D twin on this line */
  twin: TwinId;
}

const pad3 = (n: number) => String(n).padStart(3, '0');

const alT14 = buildAlignment('T14', LINE_T14);
const alPendel = buildAlignment('PENDEL', CORRIDOR_SOLNA);

export const LINES: Record<LineKey, LineDef> = {
  T14: {
    key: 'T14', line: LINE_T14, fleet: FLEET, name: 'Red line T14', short: 'T14', color: LINE_T14.color, unit: 'C20',
    al: alT14, motion: motionModel(LINE_T14, FLEET, alT14),
    dirName: { north: 'Mörby centrum', south: 'Fruängen' },
    code: (id) => `14-${pad3(id + 1)}`,
    twin: 'tc',
  },
  PENDEL: {
    key: 'PENDEL', line: CORRIDOR_SOLNA, fleet: FLEET_X60, name: 'Commuter rail J40 · J41 · 42X', short: 'J40/41', color: CORRIDOR_SOLNA.color, unit: 'X60',
    al: alPendel, motion: motionModel(CORRIDOR_SOLNA, FLEET_X60, alPendel),
    dirName: { north: 'Ulriksdal · Märsta', south: 'Stockholm City · Södertälje' },
    code: (id) => `J-${pad3(id + 1)}`,
    twin: 'solna',
  },
};
export const LINE_KEYS: LineKey[] = ['T14', 'PENDEL'];

export interface TwinDef {
  id: TwinId;
  stationId: string;
  line: LineKey;
  name: string;
  subtitle: string;
  kind: StationKind;
  station: Station;
  layout: StationLayout;
  signLetter: string;
  /** Station centre on the map */
  pos: XZ;
  /** Rotation about y that maps the station's local +x onto the line direction */
  rotY: number;
  /** Arc position of the station centre on its line */
  arc: number;
  escalatorNames: [string, string];
  /** Default camera azimuth so the open side of the model faces the viewer */
  viewAzimuth: number;
}

function makeTwin(id: TwinId, line: LineKey, stationId: string, o: Pick<TwinDef, 'name' | 'subtitle' | 'kind' | 'signLetter' | 'escalatorNames'>, style: StationLayout['train']): TwinDef {
  const L = LINES[line];
  const station = L.line.stations.find((s) => s.id === stationId)!;
  const arc = L.al.arcOf[stationId];
  const p = poseAt(L.al, arc);
  const rotY = Math.atan2(-p.dz, p.dx);
  return {
    id, line, stationId, station, arc, rotY, pos: toLocal(STATION_GEO[stationId]),
    layout: buildLayout(L.fleet, station, o.kind, style, PLATFORM_AXIS[stationId].straightHalfM),
    viewAzimuth: rotY + 0.52,
    ...o,
  };
}

export const TWINS: Record<TwinId, TwinDef> = {
  tc: makeTwin('tc', 'T14', 't-centralen', {
    name: 'T-Centralen', subtitle: 'Red line · Fruängen – Mörby centrum', kind: 'underground', signLetter: 'T',
    escalatorNames: ['South end · towards Gamla stan', 'North end · towards Östermalmstorg'],
  }, { carsPerUnit: 3, maxUnits: 3, carWidth: 2.9, carHeight: 3.6, body: '#E6E9EC', stripe: '#2A5DB0', front: '#222B34' }),
  solna: makeTwin('solna', 'PENDEL', 'solna', {
    name: 'Solna', subtitle: 'Commuter rail · J40 · J41 · 42X', kind: 'surface', signLetter: 'J',
    escalatorNames: ['South end · towards Stockholm City', 'North end · towards Ulriksdal'],
  }, { carsPerUnit: 6, maxUnits: 2, carWidth: 3.3, carHeight: 4.0, body: '#E3E6E9', stripe: '#24324D', front: '#1C2533' }),
};
export const TWIN_IDS: TwinId[] = ['tc', 'solna'];
export const twinOfStation = (stationId: string): TwinId | null => TWIN_IDS.find((k) => TWINS[k].stationId === stationId) ?? null;

export interface MapStation {
  id: string;
  line: LineKey;
  name: string;
  pos: XZ;
  /** Show the label already at wide zoom */
  major: boolean;
  boundary: boolean;
  twin: TwinId | null;
  /** Put the name on the left of the marker (avoids clashes with a close neighbour) */
  left: boolean;
}

export const MAP_STATIONS: MapStation[] = LINE_KEYS.flatMap((k) =>
  LINES[k].line.stations.map((s) => ({
    id: s.id,
    line: k,
    name: s.isBoundary ? (s.order === 0 ? 'Stockholms södra ›' : 'Helenelund ›') : s.name,
    pos: toLocal(STATION_GEO[s.id]),
    major: !s.isBoundary && (s.boardingsPerDay.value >= 25_000 || !!twinOfStation(s.id) || s.isTerminal),
    boundary: !!s.isBoundary,
    twin: twinOfStation(s.id),
    left: s.id === 'stockholm-city' || s.id === 'boundary-south' || s.id === 'gamla-stan',
  })),
);

/** Camera presets: a twin up close, or the whole T-Centralen ⇄ Solna corridor */
export const OVERVIEW = (() => {
  const a = TWINS.tc.pos, b = toLocal(STATION_GEO.ulriksdal);
  return { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 + 250, zoom: 0.088 };
})();

/** Pan limits of the map (local metres) */
export const BOUNDS = (() => {
  const xs = MAP_STATIONS.map((s) => s.pos.x), zs = MAP_STATIONS.map((s) => s.pos.z);
  const m = 4000;
  return { x0: Math.min(...xs) - m, x1: Math.max(...xs) + m, z0: Math.min(...zs) - m, z1: Math.max(...zs) + m };
})();

// ——— Strawberry Arena and its walkway to Solna station ———

/** Station-frame point of a twin → world */
export function twinToWorld(tw: TwinDef, x: number, z: number): XZ {
  const c = Math.cos(tw.rotY), s = Math.sin(tw.rotY);
  return { x: tw.pos.x + x * c + z * s, z: tw.pos.z - x * s + z * c };
}

export interface ArenaDef {
  pos: XZ;
  /** Rotation about y that maps the arena's local +x onto the pitch's long axis */
  rotY: number;
  /** Half axes of the outer ellipse (m) along and across the pitch, and roof height */
  a: number;
  b: number;
  h: number;
  pitch: { l: number; w: number };
}

export const ARENA: ArenaDef = (() => {
  const A = STRAWBERRY_ARENA;
  const u = bearingToVec(A.axisBearingDeg.value);
  return {
    pos: toLocal(A.geo.value),
    rotY: Math.atan2(-u.z, u.x),
    a: A.footprint.lengthM.value / 2,
    b: A.footprint.widthM.value / 2,
    h: A.footprint.heightM.value,
    pitch: { l: A.pitch.lengthM.value, w: A.pitch.widthM.value },
  };
})();

/**
 * Pedestrian route from the arena's east gate through Arenastaden to the west stair tower of Solna's
 * north footbridge. Schematic: the intermediate points are approximate.
 */
export const WALKWAY: XZ[] = (() => {
  const sol = TWINS.solna;
  const L = sol.layout;
  const gateDir = bearingToVec(100); // east-south-east side of the bowl
  const r = Math.max(ARENA.a, ARENA.b) * 0.92;
  const gate = { x: ARENA.pos.x + gateDir.x * r, z: ARENA.pos.z + gateDir.z * r };
  const mid1 = toLocal({ lat: 59.3713, lon: 18.0058 });
  const mid2 = toLocal({ lat: 59.3694, lon: 18.0078 });
  const end = twinToWorld(sol, L.platformLength / 2 - 4, L.wallZ - 10);
  return [gate, mid1, mid2, end];
})();

export const WALKWAY_LENGTH_M = WALKWAY.slice(1).reduce((a, p, i) => a + Math.hypot(p.x - WALKWAY[i].x, p.z - WALKWAY[i].z), 0);

/** Camera preset showing the arena, the walkway and Solna station together: looking north-west from
 * behind the station, so the arena sits at the top of the screen and the station at the bottom */
export const ARENA_VIEW = (() => {
  const s = TWINS.solna.pos;
  return {
    x: ARENA.pos.x * 0.5 + s.x * 0.5,
    z: ARENA.pos.z * 0.5 + s.z * 0.5,
    zoom: 0.68,
    azimuth: Math.atan2(s.x - ARENA.pos.x, s.z - ARENA.pos.z),
  };
})();

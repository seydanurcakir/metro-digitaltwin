// Station layout in the station's local frame (metres), derived from the data model.
// x: along the line (+x = increasing station order, i.e. "north"), z: across the line (−z = northbound track side), y: up.
// The scene places this frame on the map by rotating +x onto the line's alignment at the station.
import type { Fleet, Station } from '../../src/index';

export type StationKind = 'underground' | 'surface';

export interface TrainStyle {
  carsPerUnit: number;
  maxUnits: number;
  carWidth: number;
  carHeight: number;
  body: string;
  stripe: string;
  front: string;
}

export interface StationLayout {
  kind: StationKind;
  platformLength: number;
  platformWidth: number;
  platformTop: number;
  trackZ: { north: number; south: number };
  /** Back wall (underground) or outer fence line (surface) on the northbound side */
  wallZ: number;
  frontZ: number;
  /** Half length of the station hall / footbridge area */
  hallHalfX: number;
  /** Half length of the zone in which this model draws its own trains; outside it the map layer takes over */
  zoneHalf: number;
  unitLength: number;
  train: TrainStyle;
  /** Escalators: bottom end on the platform, top end on the concourse or footbridge */
  escalators: { bottomX: number; topX: number; width: number }[];
  concourseY: number;
  pillarsX: number[];
  /** One direction's half of the island platform [zMin, zMax] */
  sideZ: { north: [number, number]; south: [number, number] };
}

/** Scene constants that are not in the data model (visual scale) */
export const SCENE = {
  edgeZone: 1.0, // platform-edge safety strip (m)
  trackFromEdge: 1.75, // platform edge to track centre line
  platformTop: 1.1,
  concourseY: 7.6,
  tunnelLen: 50,
} as const;

export function buildLayout(fleet: Fleet, station: Station, kind: StationKind, train: TrainStyle, straightHalfM: number): StationLayout {
  const L = station.platform.lengthM.value;
  const usableW = station.platform.usableAreaM2.value / L;
  const W = usableW + 2 * SCENE.edgeZone;
  const north = -(W / 2 + SCENE.trackFromEdge);
  const south = W / 2 + SCENE.trackFromEdge;
  const pillarsX: number[] = [];
  const step = kind === 'surface' ? 12 : 11.5;
  for (let x = -L / 2 + 38; x <= L / 2 - 38 + 1e-6; x += step) pillarsX.push(x);
  const hallHalfX = L / 2 + 14;
  const escalators = kind === 'surface'
    ? [
      { bottomX: -L / 2 + 26, topX: -L / 2 + 8, width: 2.6 },
      { bottomX: L / 2 - 26, topX: L / 2 - 8, width: 2.6 },
    ]
    : [
      { bottomX: -L / 2 + 30, topX: -L / 2 + 10, width: 2.6 },
      { bottomX: L / 2 - 30, topX: L / 2 - 10, width: 2.6 },
    ];
  return {
    kind,
    platformLength: L,
    platformWidth: W,
    platformTop: SCENE.platformTop,
    trackZ: { north, south },
    wallZ: north - (kind === 'surface' ? 4.2 : 3.4),
    frontZ: south + (kind === 'surface' ? 4.2 : 3.4),
    hallHalfX,
    zoneHalf: kind === 'surface' ? Math.min(straightHalfM - 10, L / 2 + 170) : hallHalfX + SCENE.tunnelLen,
    unitLength: fleet.unitType.lengthM.value,
    train,
    escalators,
    concourseY: SCENE.concourseY,
    pillarsX,
    sideZ: { north: [-W / 2 + 0.5, -0.4], south: [0.4, W / 2 - 0.5] },
  };
}

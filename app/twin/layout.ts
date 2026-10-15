// İstasyon yerleşimi: ölçüler veri modelinden türetilir (metre).
// x: hat boyunca (+x kuzey/Mörby centrum yönü), z: hatta dik (−z arka duvar), y: yukarı.
import type { Station, TwinDataset } from '../../src/index';

export interface StationLayout {
  platformLength: number;
  platformWidth: number;
  platformTop: number;
  trackZ: { north: number; south: number };
  wallZ: number;
  frontZ: number;
  hallHalfX: number;
  unitLength: number;
  carWidth: number;
  /** Yürüyen merdivenler: alt ucu peronda, üst ucu asma katta */
  escalators: { bottomX: number; topX: number; width: number }[];
  concourseY: number;
  pillarsX: number[];
  /** Bir yönün peron yarısı [zMin, zMax] */
  sideZ: { north: [number, number]; south: [number, number] };
}

/** Sahneye özgü sabitler (veri modelinde yok, görsel ölçek) */
export const SCENE = {
  edgeZone: 1.0, // peron kenarı güvenlik bandı (m)
  trackFromEdge: 1.75, // peron kenarından ray eksenine
  carWidth: 2.9,
  carHeight: 3.6,
  platformTop: 1.1,
  concourseY: 7.6,
} as const;

export function buildLayout(ds: TwinDataset, station: Station): StationLayout {
  const L = station.platform.lengthM.value;
  const usableW = station.platform.usableAreaM2.value / L;
  const W = usableW + 2 * SCENE.edgeZone;
  const north = -(W / 2 + SCENE.trackFromEdge);
  const south = W / 2 + SCENE.trackFromEdge;
  const pillarsX: number[] = [];
  for (let x = -L / 2 + 38; x <= L / 2 - 38 + 1e-6; x += 11.5) pillarsX.push(x);
  return {
    platformLength: L,
    platformWidth: W,
    platformTop: SCENE.platformTop,
    trackZ: { north, south },
    wallZ: north - 3.4,
    frontZ: south + 3.4,
    hallHalfX: L / 2 + 14,
    unitLength: ds.fleet.unitType.lengthM.value,
    carWidth: SCENE.carWidth,
    escalators: [
      { bottomX: -L / 2 + 30, topX: -L / 2 + 10, width: 2.6 },
      { bottomX: L / 2 - 30, topX: L / 2 - 10, width: 2.6 },
    ],
    concourseY: SCENE.concourseY,
    pillarsX,
    sideZ: { north: [-W / 2 + 0.5, -0.4], south: [0.4, W / 2 - 0.5] },
  };
}

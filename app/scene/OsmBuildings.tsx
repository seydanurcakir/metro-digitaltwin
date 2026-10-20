// Real 3D buildings around Solna, extruded from the street map's OpenStreetMap footprints and kept clear of
// the railway, the station twins, the arena and the walkway (app/map/buildings.ts). Named places (Mall of
// Scandinavia, Filmstaden, hotels) are tinted. Static context: not interactive, no live data.
import { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useTwin } from '../twin/store';
import { LANDMARKS } from '../twin/context';
import { dataTile } from '../map/vector';
import { BUILDING_Z, ZONE, tileBuildings, tintLandmarks, zoneTiles, type BuildingInput, type DropReason, type Prism } from '../map/buildings';
import { buildingGeometry } from '../map/mesh';
import type { Pt } from '../map/clearance';
import { CAM } from './cam';

const GROUND_Y = -0.6;
const TINT_MARKS = LANDMARKS.filter((l) => l.building).map((l) => ({ pos: l.pos, kind: l.kind }));

export function OsmBuildings() {
  const status = useTwin((s) => s.basemap);
  const [geo, setGeo] = useState<THREE.BufferGeometry | null>(null);
  const started = useRef(false);

  // Load when the view first comes near the zone (the map opens at T-Centralen, 6 km away)
  useFrame(() => {
    if (started.current || status === 'off' || status === 'unavailable') return;
    if (CAM.zoom < 0.12 || Math.hypot(CAM.x - ZONE.cx, CAM.z - ZONE.cz) > 6000) return;
    started.current = true;
    const tiles = zoneTiles();
    Promise.all(tiles.map(({ x, y }) => dataTile(BUILDING_Z, x, y).then((t) => ({ x, y, t })))).then((res) => {
      const all: Prism[] = [];
      const dropped: Record<string, number> = {};
      for (const { x, y, t } of res) {
        const layer = t?.layers.building;
        if (!layer) continue;
        const feats: BuildingInput[] = [];
        for (let i = 0; i < layer.length; i++) {
          const f = layer.feature(i);
          if (f.type !== 3) continue;
          feats.push({ rings: f.loadGeometry().map((r) => r.map((p) => [p.x, p.y] as Pt)), props: f.properties });
        }
        const out = tileBuildings(feats, x, y, layer.extent);
        all.push(...out.kept);
        for (const [k, v] of Object.entries(out.dropped)) dropped[k] = (dropped[k] ?? 0) + v;
      }
      const tinted = tintLandmarks(all, TINT_MARKS);
      if (new URLSearchParams(window.location.search).has('debug'))
        (window as unknown as Record<string, unknown>).__buildings = { kept: all.length, tinted, dropped: dropped as Record<DropReason, number>, tiles: tiles.length, loaded: res.filter((r) => r.t).length };
      if (all.length) setGeo(buildingGeometry(all, GROUND_Y));
    });
  });

  useEffect(() => () => geo?.dispose(), [geo]);

  if (!geo || status === 'off' || status === 'unavailable') return null;
  return (
    <mesh geometry={geo} castShadow receiveShadow raycast={() => null}>
      <meshStandardMaterial vertexColors roughness={0.85} metalness={0.05} />
    </mesh>
  );
}

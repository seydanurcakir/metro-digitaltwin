// Every simulated train on the map, moving in real time along its line. Each train is drawn as a chain of
// cars, every car placed and turned on the curved track at its own position, so trains bend with the line.
// Inside a station twin's zone the twin draws the detailed train instead, at the same position. Trains keep
// a minimum on-screen size so they stay visible when zoomed out to the whole network.
import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { useTwin } from '../twin/store';
import { LINES, LINE_KEYS, type LineKey } from '../twin/world';
import { trainCars, trainPose, type CarPose } from '../twin/trainpose';
import { clickable, HIGHLIGHT } from './interaction';
import { CAM } from './cam';

const MAX_TRAINS = 160;
/** Cars drawn per train on the map */
const CARS = 6;
const MAX = MAX_TRAINS * CARS;
const BASE_Y = -0.8;

const boxGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);

export function NetworkTrains() {
  const mesh = useRef<THREE.InstancedMesh>(null!);
  const roof = useRef<THREE.InstancedMesh>(null!);
  const halo = useRef<THREE.Mesh>(null!);
  const slots = useMemo(() => new Array<{ line: LineKey; tripId: number } | null>(MAX).fill(null), []);
  const cars = useMemo<CarPose[]>(() => [], []);
  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), q: new THREE.Quaternion(), p: new THREE.Vector3(), s: new THREE.Vector3(), c: new THREE.Color(), up: new THREE.Vector3(0, 1, 0) }), []);
  const colors = useMemo(() => ({ T14: new THREE.Color(LINES.T14.color), PENDEL: new THREE.Color(LINES.PENDEL.color) }), []);

  // Create the per-instance colour buffer before the material compiles
  useLayoutEffect(() => {
    for (let i = 0; i < MAX; i++) roof.current.setColorAt(i, colors.T14);
    mesh.current.count = 0;
    roof.current.count = 0;
  }, [colors]);

  useFrame(() => {
    const st = useTwin.getState();
    const { t, selection } = st;
    const zoom = CAM.zoom;
    const minLen = 18 / zoom, width = Math.max(3.2, 7 / zoom), height = Math.max(3.6, 4 / zoom);
    let n = 0;
    halo.current.visible = false;
    for (const key of LINE_KEYS) {
      const trips = key === 'T14' ? st.result.trips : st.corridor.result.trips;
      for (const trip of trips) {
        if (n + CARS > MAX) break;
        if (t < trip.stops[0].t || t > trip.stops[trip.stops.length - 1].t) continue;
        const p = trainPose(key, trip, t);
        if (!p || p.inTwin) continue;
        const len = Math.max(p.length, minLen);
        const carLen = trainCars(key, trip, p.s, len, CARS, cars);
        const id = { line: key, tripId: trip.id };
        for (let i = 0; i < CARS; i++) {
          const c = cars[i];
          tmp.q.setFromAxisAngle(tmp.up, c.yaw);
          // Light body with a roof in the line colour: reads as a train up close and as a line-coloured mark from afar
          tmp.p.set(c.x, BASE_Y, c.z);
          tmp.s.set(carLen * 0.94, height, width);
          tmp.m.compose(tmp.p, tmp.q, tmp.s);
          mesh.current.setMatrixAt(n, tmp.m);
          tmp.p.y = BASE_Y + height;
          tmp.s.set(carLen * 0.9, Math.max(0.25, height * 0.12), width * 0.8);
          tmp.m.compose(tmp.p, tmp.q, tmp.s);
          roof.current.setMatrixAt(n, tmp.m);
          roof.current.setColorAt(n, colors[key]);
          slots[n] = id;
          n++;
        }
        if (selection?.kind === 'train' && selection.line === key && selection.tripId === trip.id) {
          // Halo on the middle of the train, turned with the track there
          const c = cars[CARS >> 1];
          halo.current.visible = true;
          halo.current.position.set(p.x, BASE_Y, p.z);
          halo.current.quaternion.setFromAxisAngle(tmp.up, c.yaw);
          halo.current.scale.set(len + 4 / zoom, height + 3 / zoom, width + 6 / zoom);
        }
      }
    }
    mesh.current.count = n;
    roof.current.count = n;
    mesh.current.instanceMatrix.needsUpdate = true;
    roof.current.instanceMatrix.needsUpdate = true;
    if (roof.current.instanceColor) roof.current.instanceColor.needsUpdate = true;
  });

  const pick = (e: ThreeEvent<MouseEvent>) => {
    const s = e.instanceId != null ? slots[e.instanceId] : null;
    return s ? { kind: 'train' as const, line: s.line, tripId: s.tripId } : null;
  };

  return (
    <group>
      <instancedMesh ref={mesh} args={[boxGeo, undefined, MAX]} frustumCulled={false} castShadow {...clickable(pick)}>
        <meshStandardMaterial color="#E4E8EC" roughness={0.5} metalness={0.1} />
      </instancedMesh>
      <instancedMesh ref={roof} args={[boxGeo, undefined, MAX]} frustumCulled={false} {...clickable(pick)}>
        <meshStandardMaterial roughness={0.6} />
      </instancedMesh>
      <mesh ref={halo} geometry={boxGeo} visible={false} raycast={() => null}>
        <meshBasicMaterial color={HIGHLIGHT} transparent opacity={0.3} depthWrite={false} />
      </mesh>
    </group>
  );
}

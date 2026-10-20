// Detailed trains inside a station twin's zone. Positions come from the shared kinematics (selectors.trainsAt);
// this component only draws: cars, doors, load bar on the roof and the selection halo.
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useTwin } from '../twin/store';
import { trainsAt } from '../twin/selectors';
import { LINES, type TwinDef } from '../twin/world';
import { C, loadColor } from './palette';
import { clickable, HIGHLIGHT } from './interaction';

const POOL = 6;
const UNIT_GAP = 0.6;

function Car({ tw, length, isCab, cabSign, doorsRef }: { tw: TwinDef; length: number; isCab: boolean; cabSign: 1 | -1; doorsRef: (m: THREE.Group | null) => void }) {
  const st = tw.layout.train;
  const w = st.carWidth;
  const h = st.carHeight;
  const y0 = tw.layout.platformTop - 0.75;
  const doorX = st.carsPerUnit > 3 ? [-length * 0.25, length * 0.25] : [-length * 0.28, length * 0.28];
  return (
    <group>
      <mesh position={[0, y0 + h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[length - 0.3, h, w]} />
        <meshStandardMaterial color={st.body} roughness={0.45} metalness={0.15} />
      </mesh>
      <mesh position={[0, y0 + h + 0.06, 0]}>
        <boxGeometry args={[length - 0.5, 0.12, w - 0.3]} />
        <meshStandardMaterial color={C.carRoof} />
      </mesh>
      <mesh position={[0, y0 + 1.15, 0]}>
        <boxGeometry args={[length - 0.28, 0.28, w + 0.02]} />
        <meshStandardMaterial color={st.stripe} />
      </mesh>
      <mesh position={[0, y0 + 2.35, 0]}>
        <boxGeometry args={[length - 1.2, 0.95, w + 0.03]} />
        <meshStandardMaterial color={C.carWindow} roughness={0.2} metalness={0.3} />
      </mesh>
      <group ref={doorsRef} visible={false}>
        {doorX.map((x) => (
          <mesh key={x} position={[x, y0 + 1.55, 0]}>
            <boxGeometry args={[1.35, 2.3, w + 0.05]} />
            <meshStandardMaterial color={C.carDoorOpen} />
          </mesh>
        ))}
      </group>
      {isCab && (
        <mesh position={[cabSign * (length / 2 - 0.15), y0 + h * 0.62, 0]}>
          <boxGeometry args={[0.06, h * 0.55, w - 0.3]} />
          <meshStandardMaterial color={st.front} />
        </mesh>
      )}
    </group>
  );
}

interface PoolSlot {
  group: THREE.Group | null;
  units: (THREE.Group | null)[];
  doors: (THREE.Group | null)[];
  loadMat: THREE.MeshStandardMaterial;
  loadBar: THREE.Mesh | null;
  halo: THREE.Mesh | null;
  /** Trip currently shown in this slot */
  tripId: number | null;
}

export function Trains({ tw }: { tw: TwinDef }) {
  const L = tw.layout;
  const st = L.train;
  const line = LINES[tw.line];
  const unitLen = L.unitLength;
  const carLen = unitLen / st.carsPerUnit;
  const slots = useMemo<PoolSlot[]>(
    () => Array.from({ length: POOL }, () => ({ group: null, units: [], doors: [], loadMat: new THREE.MeshStandardMaterial({ color: C.load.ok, emissive: C.load.ok, emissiveIntensity: 0.35 }), loadBar: null, halo: null, tripId: null })),
    [],
  );
  const color = useRef(new THREE.Color());
  const y0 = L.platformTop - 0.75;

  useFrame(() => {
    const { t, views, selection } = useTwin.getState();
    const trains = trainsAt(views[tw.id], L, line, tw.arc, t).sort((a, b) => a.tripId - b.tripId).slice(0, POOL);
    slots.forEach((s, i) => {
      const tr = trains[i];
      if (!s.group) return;
      s.group.visible = !!tr;
      s.tripId = tr ? tr.tripId : null;
      if (!tr) return;
      s.group.position.set(tr.x, 0, tr.z);
      if (s.halo) {
        s.halo.visible = selection?.kind === 'train' && selection.line === tw.line && selection.tripId === tr.tripId;
        s.halo.scale.x = tr.length + 1.2;
      }
      for (let u = 0; u < st.maxUnits; u++) {
        const g = s.units[u];
        if (!g) continue;
        g.visible = u < tr.units;
        g.position.x = -tr.length / 2 + u * (unitLen + UNIT_GAP) + unitLen / 2;
      }
      s.doors.forEach((d, k) => { if (d) d.visible = tr.doorsOpen && Math.floor(k / st.carsPerUnit) < tr.units; });
      color.current.set(loadColor(tr.loadFactor));
      s.loadMat.color.copy(color.current);
      s.loadMat.emissive.copy(color.current);
      if (s.loadBar) {
        s.loadBar.scale.x = Math.max(0.02, Math.min(1, tr.loadFactor)) * tr.length;
        s.loadBar.position.x = -tr.length / 2 + s.loadBar.scale.x / 2;
      }
    });
  });

  return (
    <group>
      {slots.map((s, i) => (
        <group
          key={i}
          ref={(g) => { s.group = g; }}
          visible={false}
          {...clickable(() => (s.tripId == null ? null : { kind: 'train', line: tw.line, tripId: s.tripId }))}
        >
          {/* Selection halo */}
          <mesh ref={(m) => { s.halo = m; }} visible={false} position={[0, y0 + st.carHeight / 2, 0]} raycast={() => null}>
            <boxGeometry args={[1, st.carHeight + 1.2, st.carWidth + 1.2]} />
            <meshBasicMaterial color={HIGHLIGHT} transparent opacity={0.22} depthWrite={false} />
          </mesh>
          {Array.from({ length: st.maxUnits }, (_, u) => (
            <group key={u} ref={(g) => { s.units[u] = g; }}>
              {Array.from({ length: st.carsPerUnit }, (_, c) => (
                <group key={c} position={[-unitLen / 2 + carLen * (c + 0.5), 0, 0]}>
                  <Car tw={tw} length={carLen} isCab={c === 0 || c === st.carsPerUnit - 1} cabSign={c === 0 ? -1 : 1} doorsRef={(m) => { s.doors[u * st.carsPerUnit + c] = m; }} />
                </group>
              ))}
            </group>
          ))}
          {/* Roof load bar: length = load factor, colour = threshold */}
          <mesh ref={(m) => { s.loadBar = m; }} position={[0, y0 + st.carHeight + 0.2, 0]} material={s.loadMat}>
            <boxGeometry args={[1, 0.14, 0.7]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

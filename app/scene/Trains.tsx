// Trenler: simülasyondaki seferlerden. Her karede konum, kapı ve doluluk store'daki zamandan hesaplanır.
// Bileşen yalnızca çizer; konum hesabı selectors.trainsAt içinde.
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { LAYOUT, useTwin } from '../twin/store';
import { trainsAt } from '../twin/selectors';
import { SCENE } from '../twin/layout';
import { C, loadColor } from './palette';
import { clickable, HIGHLIGHT } from './interaction';

const POOL = 6;
const MAX_UNITS = 3;
const CARS_PER_UNIT = 3;
const UNIT_GAP = 0.6;

function Car({ length, isCab, cabSign, doorsRef }: { length: number; isCab: boolean; cabSign: 1 | -1; doorsRef: (m: THREE.Group | null) => void }) {
  const w = SCENE.carWidth;
  const h = SCENE.carHeight;
  const y0 = LAYOUT.platformTop - 0.75;
  const doorX = [-length * 0.28, length * 0.28];
  return (
    <group>
      <mesh position={[0, y0 + h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[length - 0.3, h, w]} />
        <meshStandardMaterial color={C.carBody} roughness={0.45} metalness={0.15} />
      </mesh>
      <mesh position={[0, y0 + h + 0.06, 0]}>
        <boxGeometry args={[length - 0.5, 0.12, w - 0.3]} />
        <meshStandardMaterial color={C.carRoof} />
      </mesh>
      <mesh position={[0, y0 + 1.15, 0]}>
        <boxGeometry args={[length - 0.28, 0.28, w + 0.02]} />
        <meshStandardMaterial color={C.carStripe} />
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
        <mesh position={[cabSign * (length / 2 - 0.15), y0 + 2.3, 0]}>
          <boxGeometry args={[0.04, 1.2, w - 0.5]} />
          <meshStandardMaterial color={C.cab} />
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
  /** Bu havuz yuvasında şu an gösterilen sefer */
  tripId: number | null;
}

export function Trains() {
  const unitLen = LAYOUT.unitLength;
  const carLen = unitLen / CARS_PER_UNIT;
  const slots = useMemo<PoolSlot[]>(
    () => Array.from({ length: POOL }, () => ({ group: null, units: [], doors: [], loadMat: new THREE.MeshStandardMaterial({ color: C.load.ok, emissive: C.load.ok, emissiveIntensity: 0.35 }), loadBar: null, halo: null, tripId: null })),
    [],
  );
  const color = useRef(new THREE.Color());

  useFrame(() => {
    const { t, view, selection } = useTwin.getState();
    const trains = trainsAt(view, LAYOUT, t).sort((a, b) => a.tripId - b.tripId).slice(0, POOL);
    slots.forEach((s, i) => {
      const tr = trains[i];
      if (!s.group) return;
      s.group.visible = !!tr;
      s.tripId = tr ? tr.tripId : null;
      if (!tr) return;
      s.group.position.set(tr.x, 0, tr.z);
      if (s.halo) {
        s.halo.visible = selection?.kind === 'train' && selection.tripId === tr.tripId;
        s.halo.scale.x = tr.length + 1.2;
      }
      for (let u = 0; u < MAX_UNITS; u++) {
        const g = s.units[u];
        if (!g) continue;
        g.visible = u < tr.units;
        g.position.x = -tr.length / 2 + u * (unitLen + UNIT_GAP) + unitLen / 2;
      }
      s.doors.forEach((d, k) => { if (d) d.visible = tr.doorsOpen && Math.floor(k / CARS_PER_UNIT) < tr.units; });
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
          {...clickable(() => (s.tripId == null ? null : { kind: 'train', tripId: s.tripId }))}
        >
          {/* Seçim vurgusu */}
          <mesh ref={(m) => { s.halo = m; }} visible={false} position={[0, LAYOUT.platformTop - 0.75 + SCENE.carHeight / 2, 0]} raycast={() => null}>
            <boxGeometry args={[1, SCENE.carHeight + 1.2, SCENE.carWidth + 1.2]} />
            <meshBasicMaterial color={HIGHLIGHT} transparent opacity={0.22} depthWrite={false} />
          </mesh>
          {Array.from({ length: MAX_UNITS }, (_, u) => (
            <group key={u} ref={(g) => { s.units[u] = g; }}>
              {Array.from({ length: CARS_PER_UNIT }, (_, c) => (
                <group key={c} position={[-unitLen / 2 + carLen * (c + 0.5), 0, 0]}>
                  <Car length={carLen} isCab={c === 0 || c === CARS_PER_UNIT - 1} cabSign={c === 0 ? -1 : 1} doorsRef={(m) => { s.doors[u * CARS_PER_UNIT + c] = m; }} />
                </group>
              ))}
            </group>
          ))}
          {/* Çatıda doluluk çubuğu: uzunluğu doluluk oranı, rengi eşik */}
          <mesh ref={(m) => { s.loadBar = m; }} position={[0, LAYOUT.platformTop - 0.75 + SCENE.carHeight + 0.2, 0]} material={s.loadMat}>
            <boxGeometry args={[1, 0.14, 0.7]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

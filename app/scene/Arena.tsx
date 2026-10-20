// Strawberry Arena: a low-poly bowl with an open retractable roof, pitch and stands. The stands fill with
// colour as visitors arrive and empty during egress; a light band on the facade shows the event phase.
// Clicking the arena opens its panel. Numbers come from the arena flow model (src/network/arena.ts).
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useTwin } from '../twin/store';
import { ARENA } from '../twin/world';
import { getArenaFlow } from '../twin/network';
import { SCENARIOS } from '../twin/model';
import { SIMULATED_EVENT, STRAWBERRY_ARENA } from '../../src/data/arena';
import { arenaStateAt } from '../../src/network/arena';
import { clickable, HIGHLIGHT } from './interaction';

const lathe = (pts: [number, number][], seg = 64) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);

export const PHASE_COLOR: Record<string, string> = {
  'before gates open': '#5B6B7C',
  'gates open': '#3FA7D6',
  'event in progress': '#4CC38A',
  egress: '#F2B441',
  cleared: '#5B6B7C',
  'no event': '#5B6B7C',
};

export function Arena() {
  const { a, b, h, pitch } = ARENA;
  const geo = useMemo(() => ({
    facade: lathe([[0.97, 0], [1, h * 0.06], [1, h * 0.62], [0.96, h * 0.88], [0.9, h]]),
    band: lathe([[1.006, h * 0.5], [1.006, h * 0.57]]),
    roof: lathe([[0.9, h], [0.72, h * 1.01], [0.52, h * 0.97]]),
    stands: lathe([[0.5, 2], [0.62, h * 0.3], [0.78, h * 0.6], [0.89, h * 0.86]]),
    base: new THREE.CircleGeometry(1.18, 64).rotateX(-Math.PI / 2),
  }), [h]);
  const standMat = useRef<THREE.MeshStandardMaterial>(null!);
  const bandMat = useRef<THREE.MeshStandardMaterial>(null!);
  const halo = useRef<THREE.Mesh>(null!);
  const tmp = useMemo(() => ({ empty: new THREE.Color('#2C3744'), full: new THREE.Color('#D9A441'), c: new THREE.Color() }), []);

  useFrame(() => {
    const { t, scenario, selection } = useTwin.getState();
    const event = !!SCENARIOS[scenario].corridor?.arenaEvent;
    const st = event ? arenaStateAt(getArenaFlow(), SIMULATED_EVENT, t) : null;
    const fill = st ? st.inside / STRAWBERRY_ARENA.capacity.football.value : 0;
    standMat.current.color.copy(tmp.c.copy(tmp.empty).lerp(tmp.full, Math.min(1, fill)));
    const phase = st ? st.phase : 'no event';
    bandMat.current.color.set(PHASE_COLOR[phase]);
    bandMat.current.emissive.set(PHASE_COLOR[phase]);
    halo.current.visible = selection?.kind === 'arena';
  });

  return (
    <group position={[ARENA.pos.x, 0, ARENA.pos.z]} rotation={[0, ARENA.rotY, 0]} {...clickable(() => ({ kind: 'arena' }))}>
      <group scale={[a, 1, b]}>
        <mesh geometry={geo.base} position={[0, -0.6, 0]} receiveShadow>
          <meshStandardMaterial color="#1C2733" roughness={0.95} />
        </mesh>
        <mesh geometry={geo.facade} castShadow receiveShadow>
          <meshStandardMaterial color="#AEB9C5" roughness={0.55} metalness={0.2} side={THREE.DoubleSide} />
        </mesh>
        <mesh geometry={geo.band}>
          <meshStandardMaterial ref={bandMat} color="#5B6B7C" emissive="#5B6B7C" emissiveIntensity={0.9} side={THREE.DoubleSide} toneMapped={false} />
        </mesh>
        <mesh geometry={geo.roof} castShadow>
          <meshStandardMaterial color="#7F8C99" roughness={0.6} metalness={0.3} side={THREE.DoubleSide} />
        </mesh>
        <mesh geometry={geo.stands} receiveShadow>
          <meshStandardMaterial ref={standMat} color="#2C3744" roughness={0.9} side={THREE.DoubleSide} />
        </mesh>
        <mesh ref={halo} geometry={geo.facade} scale={[1.04, 1.06, 1.04]} visible={false} raycast={() => null}>
          <meshBasicMaterial color={HIGHLIGHT} transparent opacity={0.22} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      </group>
      {/* Pitch with a simple line marking */}
      <mesh position={[0, 1.2, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[pitch.l + 8, pitch.w + 8]} />
        <meshStandardMaterial color="#2F7A45" roughness={0.9} />
      </mesh>
      <mesh position={[0, 1.25, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[8.6, 9.15, 48]} />
        <meshBasicMaterial color="#DCE8DF" />
      </mesh>
      <mesh position={[0, 1.25, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.5, pitch.w]} />
        <meshBasicMaterial color="#DCE8DF" />
      </mesh>
    </group>
  );
}

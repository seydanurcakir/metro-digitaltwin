// Peron kalabalığı ve ısı haritası. Kişi sayısı simülasyondan (platformAt), yerleri sabit öncelik sırasından gelir.
import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { Direction } from '../../src/index';
import { LAYOUT, useTwin } from '../twin/store';
import { crowdSlots, platformAt, rng } from '../twin/selectors';
import { C } from './palette';
import { clickable, HIGHLIGHT } from './interaction';

const MAX_PER_SIDE = 2600;
const TILE_X = 3;
/** Yerel yoğunluk eşikleri (kişi/m²) */
export const HEAT_STEPS = [0.75, 1.5, 2.5] as const;

const bodyGeo = new THREE.CylinderGeometry(0.2, 0.24, 1.2, 6).translate(0, 0.6, 0);
const headGeo = new THREE.SphereGeometry(0.15, 8, 6).translate(0, 1.38, 0);
const tileGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

function Side({ dir, seed }: { dir: Direction; seed: number }) {
  const bodies = useRef<THREE.InstancedMesh>(null!);
  const heads = useRef<THREE.InstancedMesh>(null!);
  const tiles = useRef<THREE.InstancedMesh>(null!);
  const pick = useRef<THREE.MeshBasicMaterial>(null!);
  const pos = useMemo(() => crowdSlots(LAYOUT, dir, MAX_PER_SIDE, seed), [dir, seed]);
  const n = pos.length / 2;
  const [z0, z1] = LAYOUT.sideZ[dir];
  const half = LAYOUT.platformLength / 2;
  const nTiles = Math.ceil(LAYOUT.platformLength / TILE_X);
  const tileArea = TILE_X * (z1 - z0);
  const tileOf = useMemo(() => {
    const a = new Int16Array(n);
    for (let i = 0; i < n; i++) a[i] = Math.min(nTiles - 1, Math.floor((pos[i * 2] + half) / TILE_X));
    return a;
  }, [pos, n, nTiles, half]);
  const counts = useMemo(() => new Float32Array(nTiles), [nTiles]);
  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), c: new THREE.Color(), q: new THREE.Quaternion(), s: new THREE.Vector3(), p: new THREE.Vector3() }), []);

  useLayoutEffect(() => {
    const r = rng(seed * 7 + 3);
    for (let i = 0; i < n; i++) {
      const sc = 0.88 + r() * 0.24;
      tmp.p.set(pos[i * 2], LAYOUT.platformTop, pos[i * 2 + 1]);
      tmp.s.set(1, sc, 1);
      tmp.m.compose(tmp.p, tmp.q, tmp.s);
      bodies.current.setMatrixAt(i, tmp.m);
      heads.current.setMatrixAt(i, tmp.m);
      bodies.current.setColorAt(i, tmp.c.set(C.clothes[Math.floor(r() * C.clothes.length)]));
      heads.current.setColorAt(i, tmp.c.set(C.skin[Math.floor(r() * C.skin.length)]));
    }
    for (let k = 0; k < nTiles; k++) {
      tmp.p.set(-half + (k + 0.5) * TILE_X, LAYOUT.platformTop + 0.015, (z0 + z1) / 2);
      tmp.s.set(TILE_X - 0.15, 1, z1 - z0 - 0.1);
      tmp.m.compose(tmp.p, tmp.q, tmp.s);
      tiles.current.setMatrixAt(k, tmp.m);
      tiles.current.setColorAt(k, tmp.c.set(C.heat.low));
    }
    [bodies, heads, tiles].forEach((ref) => {
      ref.current.instanceMatrix.needsUpdate = true;
      if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
    });
  }, [pos, n, seed, nTiles, half, z0, z1, tmp]);

  useFrame(() => {
    const { t, view, selection } = useTwin.getState();
    const p = platformAt(view, t);
    pick.current.opacity = selection?.kind === 'platform' && selection.direction === dir ? 0.2 : 0;
    const count = Math.min(n, Math.round(dir === 'north' ? p.north : p.south));
    bodies.current.count = count;
    heads.current.count = count;
    counts.fill(0);
    for (let i = 0; i < count; i++) counts[tileOf[i]]++;
    let visible = 0;
    for (let k = 0; k < nTiles; k++) {
      const d = counts[k] / tileArea;
      if (d < HEAT_STEPS[0]) continue;
      tmp.c.set(d < HEAT_STEPS[1] ? C.heat.low : d < HEAT_STEPS[2] ? C.heat.mid : C.heat.high);
      tmp.p.set(-half + (k + 0.5) * TILE_X, LAYOUT.platformTop + 0.015, (z0 + z1) / 2);
      tmp.s.set(TILE_X - 0.15, 1, z1 - z0 - 0.1);
      tmp.m.compose(tmp.p, tmp.q, tmp.s);
      tiles.current.setMatrixAt(visible, tmp.m);
      tiles.current.setColorAt(visible, tmp.c);
      visible++;
    }
    tiles.current.count = visible;
    tiles.current.instanceMatrix.needsUpdate = true;
    if (tiles.current.instanceColor) tiles.current.instanceColor.needsUpdate = true;
  });

  return (
    <group {...clickable(() => ({ kind: 'platform', direction: dir }))}>
      {/* Tıklama alanı ve seçim vurgusu: peronun bu yarısı */}
      <mesh position={[0, LAYOUT.platformTop + 0.03, (dir === 'north' ? -1 : 1) * LAYOUT.platformWidth / 4]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[LAYOUT.platformLength - 1, LAYOUT.platformWidth / 2]} />
        <meshBasicMaterial ref={pick} color={HIGHLIGHT} transparent opacity={0} depthWrite={false} />
      </mesh>
      <instancedMesh ref={tiles} args={[tileGeo, undefined, nTiles]} frustumCulled={false}>
        <meshBasicMaterial transparent opacity={0.55} depthWrite={false} toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={bodies} args={[bodyGeo, undefined, n]} castShadow frustumCulled={false}>
        <meshStandardMaterial roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={heads} args={[headGeo, undefined, n]} frustumCulled={false}>
        <meshStandardMaterial roughness={0.8} />
      </instancedMesh>
    </group>
  );
}

export function Crowd() {
  return (
    <group>
      <Side dir="north" seed={11} />
      <Side dir="south" seed={29} />
    </group>
  );
}

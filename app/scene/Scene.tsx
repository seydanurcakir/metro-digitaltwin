// 3D sahne: izometrik ortografik kamera, sürükle-kaydır, tekerlek-yakınlaştır, sınırlı dönüş.
import { useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { MapControls, OrthographicCamera } from '@react-three/drei';
import * as THREE from 'three';
import type { MapControls as MapControlsImpl } from 'three-stdlib';
import { LAYOUT, useTwin } from '../twin/store';
import { Station } from './Station';
import { Trains } from './Trains';
import { Crowd } from './Crowd';

const LIMIT_X = LAYOUT.hallHalfX + 30;
const LIMIT_Z = 30;

function Controls() {
  const ref = useRef<MapControlsImpl>(null!);
  const delta = useRef(new THREE.Vector3());
  const onChange = () => {
    const c = ref.current;
    if (!c) return;
    const tgt = c.target;
    const cx = THREE.MathUtils.clamp(tgt.x, -LIMIT_X, LIMIT_X);
    const cz = THREE.MathUtils.clamp(tgt.z, -LIMIT_Z, LIMIT_Z);
    if (cx !== tgt.x || cz !== tgt.z || tgt.y !== 0) {
      delta.current.set(cx - tgt.x, -tgt.y, cz - tgt.z);
      tgt.add(delta.current);
      c.object.position.add(delta.current);
    }
  };
  return (
    <MapControls
      ref={ref}
      makeDefault
      enableDamping
      dampingFactor={0.12}
      screenSpacePanning={false}
      minZoom={3}
      maxZoom={28}
      minPolarAngle={0.55}
      maxPolarAngle={1.15}
      minAzimuthAngle={-0.2}
      maxAzimuthAngle={1.2}
      onChange={onChange}
    />
  );
}

export function Scene() {
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true }}
      style={{ position: 'absolute', inset: 0 }}
      onPointerMissed={(e) => { if (e.type === 'click') useTwin.getState().select(null); }}
    >
      <OrthographicCamera makeDefault position={[85, 125, 150]} zoom={8.5} near={-500} far={2000} />
      <Controls />
      <hemisphereLight args={['#FFFFFF', '#8A939C', 1.1]} />
      <directionalLight
        position={[-60, 120, 80]}
        intensity={1.6}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-120}
        shadow-camera-right={120}
        shadow-camera-top={60}
        shadow-camera-bottom={-60}
        shadow-camera-near={1}
        shadow-camera-far={400}
        shadow-bias={-0.0004}
      />
      <Station />
      <Trains />
      <Crowd />
    </Canvas>
  );
}

// Static low-poly surroundings of Solna station: representative street blocks, Comfort Hotel Solna and
// Vasalundsparken with trees. Not interactive and not part of the simulation.
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { BLOCKS, HOTEL, PARK, TREES } from '../twin/context';

const boxGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
const treeGeo = new THREE.ConeGeometry(1, 1, 6).translate(0, 0.5, 0);

export function Context() {
  const blocks = useRef<THREE.InstancedMesh>(null!);
  const roofs = useRef<THREE.InstancedMesh>(null!);
  const trees = useRef<THREE.InstancedMesh>(null!);
  const parkGeo = useMemo(() => new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2), []);

  useLayoutEffect(() => {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    BLOCKS.forEach((b, i) => {
      q.setFromAxisAngle(up, b.rotY);
      m.compose(p.set(b.x, -0.6, b.z), q, s.set(b.w, b.h, b.d));
      blocks.current.setMatrixAt(i, m);
      m.compose(p.set(b.x, b.h - 0.6, b.z), q, s.set(b.w - 3, 0.6, b.d - 3));
      roofs.current.setMatrixAt(i, m);
    });
    TREES.forEach((t, i) => {
      const h = 9 + ((i * 37) % 7);
      m.compose(p.set(t.x, -0.6, t.z), q.identity(), s.set(3.2, h, 3.2));
      trees.current.setMatrixAt(i, m);
    });
    [blocks, roofs, trees].forEach((r) => { r.current.instanceMatrix.needsUpdate = true; });
  }, []);

  return (
    <group>
      <instancedMesh ref={blocks} args={[boxGeo, undefined, BLOCKS.length]} castShadow receiveShadow raycast={() => null}>
        <meshStandardMaterial color="#243241" roughness={0.85} />
      </instancedMesh>
      <instancedMesh ref={roofs} args={[boxGeo, undefined, BLOCKS.length]} raycast={() => null}>
        <meshStandardMaterial color="#2E3F51" roughness={0.9} />
      </instancedMesh>
      {/* Comfort Hotel Solna */}
      <mesh position={[HOTEL.x, -0.6, HOTEL.z]} rotation={[0, HOTEL.rotY, 0]} scale={[HOTEL.w, HOTEL.h, HOTEL.d]} geometry={boxGeo} castShadow raycast={() => null}>
        <meshStandardMaterial color="#3B5068" roughness={0.6} metalness={0.15} />
      </mesh>
      {/* Vasalundsparken */}
      <mesh position={[PARK.centre.x, -0.7, PARK.centre.z]} rotation={[0, PARK.rotY, 0]} scale={[PARK.rx, 1, PARK.rz]} geometry={parkGeo} receiveShadow raycast={() => null}>
        <meshStandardMaterial color="#173528" roughness={1} />
      </mesh>
      <instancedMesh ref={trees} args={[treeGeo, undefined, TREES.length]} castShadow raycast={() => null}>
        <meshStandardMaterial color="#2C6A46" roughness={0.9} />
      </instancedMesh>
    </group>
  );
}

// Static 3D context around Solna that does not come from the street map: trees in Vasalundsparken, and —
// only when the street map cannot be loaded (offline, ?tiles=off) — the stand-in buildings: the named
// landmark buildings and representative street blocks (Mall of Scandinavia is its own model, Mall.tsx). With the
// map available, real OpenStreetMap buildings replace them (OsmBuildings.tsx). Everything here is kept
// clear of the rail buffer (app/map/clearance.ts). Not interactive; no live data.
import { useLayoutEffect, useRef } from 'react';
import * as THREE from 'three';
import { useTwin } from '../twin/store';
import { BLOCKS, LANDMARK_BUILDINGS, TREES } from '../twin/context';

const boxGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
const treeGeo = new THREE.ConeGeometry(1, 1, 6).translate(0, 0.5, 0);

const COL = {
  block: '#243241',
  roof: '#2E3F51',
  landmark: '#3B5068',
  tree: '#2C6A46',
};

function Trees() {
  const trees = useRef<THREE.InstancedMesh>(null!);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
    TREES.forEach((t, i) => {
      const h = 9 + ((i * 37) % 7);
      m.compose(p.set(t.x, -0.6, t.z), q, s.set(3.2, h, 3.2));
      trees.current.setMatrixAt(i, m);
    });
    trees.current.instanceMatrix.needsUpdate = true;
  }, []);
  return (
    <instancedMesh ref={trees} args={[treeGeo, undefined, Math.max(1, TREES.length)]} castShadow raycast={() => null}>
      <meshStandardMaterial color={COL.tree} roughness={0.9} />
    </instancedMesh>
  );
}

/** Stand-in buildings for when the street map (and its real buildings) is not available */
function Fallback() {
  const blocks = useRef<THREE.InstancedMesh>(null!);
  const roofs = useRef<THREE.InstancedMesh>(null!);
  const marks = useRef<THREE.InstancedMesh>(null!);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    BLOCKS.forEach((b, i) => {
      q.setFromAxisAngle(up, b.rotY);
      m.compose(p.set(b.x, -0.6, b.z), q, s.set(b.w, b.h, b.d));
      blocks.current.setMatrixAt(i, m);
      m.compose(p.set(b.x, b.h - 0.6, b.z), q, s.set(b.w - 3, 0.6, b.d - 3));
      roofs.current.setMatrixAt(i, m);
    });
    LANDMARK_BUILDINGS.forEach((b, i) => {
      q.setFromAxisAngle(up, b.rotY);
      m.compose(p.set(b.x, -0.6, b.z), q, s.set(b.w, b.h, b.d));
      marks.current.setMatrixAt(i, m);
    });
    [blocks, roofs, marks].forEach((r) => { r.current.instanceMatrix.needsUpdate = true; });
  }, []);
  return (
    <group>
      <instancedMesh ref={blocks} args={[boxGeo, undefined, BLOCKS.length]} castShadow receiveShadow raycast={() => null}>
        <meshStandardMaterial color={COL.block} roughness={0.85} />
      </instancedMesh>
      <instancedMesh ref={roofs} args={[boxGeo, undefined, BLOCKS.length]} raycast={() => null}>
        <meshStandardMaterial color={COL.roof} roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={marks} args={[boxGeo, undefined, LANDMARK_BUILDINGS.length]} castShadow raycast={() => null}>
        <meshStandardMaterial color={COL.landmark} roughness={0.6} metalness={0.15} />
      </instancedMesh>
    </group>
  );
}

export function Context() {
  const basemap = useTwin((s) => s.basemap);
  return (
    <group>
      <Trees />
      {(basemap === 'off' || basemap === 'unavailable') && <Fallback />}
    </group>
  );
}

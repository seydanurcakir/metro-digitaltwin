// Static 3D context around Solna that does not come from the street map: trees in Vasalundsparken, and —
// only when the street map cannot be loaded (offline, ?tiles=off) — the stand-in buildings: Mall of
// Scandinavia's traced footprint, the named landmark buildings and representative street blocks. With the
// map available, real OpenStreetMap buildings replace them (OsmBuildings.tsx). Everything here is kept
// clear of the rail buffer (app/map/clearance.ts). Not interactive; no live data.
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useTwin } from '../twin/store';
import { BLOCKS, LANDMARK_BUILDINGS, MALL, TREES } from '../twin/context';

const boxGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
const treeGeo = new THREE.ConeGeometry(1, 1, 6).translate(0, 0.5, 0);

const COL = {
  block: '#243241',
  roof: '#2E3F51',
  landmark: '#3B5068',
  mall: '#4A3F2C',
  mallRoof: '#5C4E36',
  tree: '#2C6A46',
};

/** Shape in the x/−z plane so that, rotated −90° about x, it lies on the ground in world x/z */
const toShape = (pts: [number, number][]) => new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));

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
  const geo = useMemo(() => {
    const shape = toShape(MALL.footprint);
    const mall = new THREE.ExtrudeGeometry(shape, { depth: MALL.height, bevelEnabled: false });
    mall.rotateX(-Math.PI / 2);
    const mallRoof = new THREE.ShapeGeometry(shape);
    mallRoof.rotateX(-Math.PI / 2);
    return { mall, mallRoof };
  }, []);
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
      <mesh geometry={geo.mall} position={[0, -0.6, 0]} castShadow receiveShadow raycast={() => null}>
        <meshStandardMaterial color={COL.mall} roughness={0.8} />
      </mesh>
      <mesh geometry={geo.mallRoof} position={[0, MALL.height - 0.5, 0]} raycast={() => null}>
        <meshStandardMaterial color={COL.mallRoof} roughness={0.9} />
      </mesh>
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

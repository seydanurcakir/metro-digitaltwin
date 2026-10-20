// Static, low-poly surroundings of Solna traced from the reference map: a detailed ground area with water,
// parks, commercial areas, motorways, local roads and rail-yard tracks, plus Mall of Scandinavia, named
// landmark buildings, representative street blocks and trees. Not interactive; no live data.
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { BLOCKS, EXTENT, LANDMARK_BUILDINGS, MALL, SOLNA_MAP, TREES, type Area } from '../twin/context';

const boxGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
const treeGeo = new THREE.ConeGeometry(1, 1, 6).translate(0, 0.5, 0);

/** Colours of the dark map style */
const COL = {
  area: '#111921',
  green: '#15321F',
  commercial: '#2A261E',
  water: '#14415F',
  shore: '#2F729C',
  motorway: '#5E6670',
  road: '#2C3B4B',
  railyard: '#383E46',
  block: '#243241',
  roof: '#2E3F51',
  landmark: '#3B5068',
  mall: '#4A3F2C',
  mallRoof: '#5C4E36',
  tree: '#2C6A46',
};

/** Shape in the x/−z plane so that, rotated −90° about x, it lies on the ground in world x/z */
const toShape = (pts: [number, number][]) => new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));

function flatGeometry(areas: Area[]): THREE.BufferGeometry {
  const geos = areas.map((a) => new THREE.ShapeGeometry(toShape(a.pts)));
  const g = mergeGeometries(geos);
  g.rotateX(-Math.PI / 2);
  return g;
}

/** Minimal merge (position + normal + index) to keep each layer to one draw call */
function mergeGeometries(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [], idx: number[] = [];
  let base = 0;
  for (const g of geos) {
    const p = g.getAttribute('position');
    for (let i = 0; i < p.count; i++) pos.push(p.getX(i), p.getY(i), p.getZ(i));
    const ix = g.getIndex();
    if (ix) for (let i = 0; i < ix.count; i++) idx.push(ix.getX(i) + base);
    else for (let i = 0; i < p.count; i++) idx.push(i + base);
    base += p.count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setIndex(idx);
  out.computeVertexNormals();
  return out;
}

function lineGeometry(lines: [number, number][][], y: number): THREE.BufferGeometry {
  const pos: number[] = [];
  for (const l of lines) for (let i = 1; i < l.length; i++) pos.push(l[i - 1][0], y, l[i - 1][1], l[i][0], y, l[i][1]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return g;
}

function outlineGeometry(areas: Area[], y: number): THREE.BufferGeometry {
  return lineGeometry(areas.map((a) => [...a.pts, a.pts[0]]), y);
}

// Flat map layers are only centimetres apart, which an orthographic depth buffer spanning kilometres cannot
// separate (they would flicker). They are therefore drawn without depth testing, strictly by renderOrder,
// after the ground and grid and before every 3D object; being opaque and not writing depth, they never hide
// buildings, the arena, the rail lines or trains drawn later.
function Layer({ geometry, color, y, order }: { geometry: THREE.BufferGeometry; color: string; y: number; order: number }) {
  return (
    <mesh geometry={geometry} position={[0, y, 0]} renderOrder={order} raycast={() => null}>
      <meshBasicMaterial color={color} depthWrite={false} depthTest={false} toneMapped={false} />
    </mesh>
  );
}

function Lines({ geometry, color, order }: { geometry: THREE.BufferGeometry; color: string; order: number }) {
  return (
    <lineSegments geometry={geometry} renderOrder={order} raycast={() => null}>
      <lineBasicMaterial color={color} depthWrite={false} depthTest={false} toneMapped={false} />
    </lineSegments>
  );
}

export function Context() {
  const blocks = useRef<THREE.InstancedMesh>(null!);
  const roofs = useRef<THREE.InstancedMesh>(null!);
  const marks = useRef<THREE.InstancedMesh>(null!);
  const trees = useRef<THREE.InstancedMesh>(null!);

  const geo = useMemo(() => {
    const { x0, z0, x1, z1 } = EXTENT;
    const area = new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2).translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
    const mallShape = toShape(MALL.footprint);
    const mall = new THREE.ExtrudeGeometry(mallShape, { depth: MALL.height, bevelEnabled: false });
    mall.rotateX(-Math.PI / 2);
    const mallRoof = new THREE.ShapeGeometry(mallShape);
    mallRoof.rotateX(-Math.PI / 2);
    return {
      area,
      green: flatGeometry(SOLNA_MAP.green),
      commercial: flatGeometry(SOLNA_MAP.commercial),
      water: flatGeometry(SOLNA_MAP.water),
      shore: outlineGeometry(SOLNA_MAP.water, -2.5),
      motorway: flatGeometry(SOLNA_MAP.motorway),
      roads: lineGeometry(SOLNA_MAP.roads, -2.52),
      railyard: lineGeometry(SOLNA_MAP.railyard, -2.52),
      mall,
      mallRoof,
    };
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
    TREES.forEach((t, i) => {
      const h = 9 + ((i * 37) % 7);
      m.compose(p.set(t.x, -0.6, t.z), q.identity(), s.set(3.2, h, 3.2));
      trees.current.setMatrixAt(i, m);
    });
    [blocks, roofs, marks, trees].forEach((r) => { r.current.instanceMatrix.needsUpdate = true; });
  }, []);

  return (
    <group>
      {/* Flat map layers, bottom to top */}
      <Layer geometry={geo.area} color={COL.area} y={-2.79} order={-3.9} />
      <Layer geometry={geo.green} color={COL.green} y={-2.7} order={-3.8} />
      <Layer geometry={geo.commercial} color={COL.commercial} y={-2.68} order={-3.75} />
      <Layer geometry={geo.water} color={COL.water} y={-2.66} order={-3.7} />
      <Lines geometry={geo.shore} color={COL.shore} order={-3.65} />
      <Lines geometry={geo.roads} color={COL.road} order={-3.6} />
      <Lines geometry={geo.railyard} color={COL.railyard} order={-3.6} />
      <Layer geometry={geo.motorway} color={COL.motorway} y={-2.6} order={-3.5} />

      {/* Mall of Scandinavia: traced footprint, extruded */}
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
      <instancedMesh ref={trees} args={[treeGeo, undefined, Math.max(1, TREES.length)]} castShadow raycast={() => null}>
        <meshStandardMaterial color={COL.tree} roughness={0.9} />
      </instancedMesh>
    </group>
  );
}

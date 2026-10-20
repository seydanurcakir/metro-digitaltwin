// Map ground: a plain dark surface with a faint metric grid (500 m minor, 2.5 km major). The street map
// (BaseMap.tsx) covers it wherever its tiles have loaded; offline, the grid alone remains as the reference.
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { MAP_GROUND } from './palette';

const SIZE = 60000;
const Y = -2.8;

function useGrid(divisions: number, color: string, y: number) {
  const grid = useMemo(() => {
    const g = new THREE.GridHelper(SIZE, divisions, color, color);
    g.position.y = y;
    const m = g.material as THREE.Material;
    m.depthWrite = false;
    g.renderOrder = -3.99; // under the street map tiles
    g.raycast = () => {};
    return g;
  }, [divisions, color, y]);
  useEffect(() => () => { grid.geometry.dispose(); (grid.material as THREE.Material).dispose(); }, [grid]);
  return grid;
}

export function MapGround() {
  const minor = useGrid(SIZE / 500, MAP_GROUND.gridMinor, Y + 0.04);
  const major = useGrid(SIZE / 2500, MAP_GROUND.gridMajor, Y + 0.08);
  return (
    <group>
      <mesh position={[0, Y, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null} renderOrder={-4}>
        <planeGeometry args={[SIZE, SIZE]} />
        <meshBasicMaterial color={MAP_GROUND.ground} toneMapped={false} />
      </mesh>
      <primitive object={minor} />
      <primitive object={major} />
    </group>
  );
}

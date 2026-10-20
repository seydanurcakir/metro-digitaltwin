// Map ground: a plain dark surface with a faint metric grid (500 m minor, 2.5 km major). No external map
// service is used; the rail network, stations and trains are drawn from the twin's own data on top of it.
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

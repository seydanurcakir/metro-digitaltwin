// Pedestrian route from Strawberry Arena to Solna station, with the event crowd shown live: dots walking
// to the station (one per ~15 people) and a queue at the arena end when the route is at capacity.
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import * as THREE from 'three';
import { useTwin } from '../twin/store';
import { WALKWAY } from '../twin/world';
import { getArenaFlow } from '../twin/network';
import { SCENARIOS } from '../twin/model';
import { SIMULATED_EVENT, STRAWBERRY_ARENA } from '../../src/data/arena';
import { arenaStateAt } from '../../src/network/arena';
import { rng } from '../twin/selectors';
import { CAM } from './cam';

const PEOPLE_PER_DOT = 15;
const MAX_WALK = 900;
const MAX_QUEUE = 700;
const Y = -0.4;
const COLOR = '#F2B441';

const dotGeo = new THREE.SphereGeometry(1, 8, 6).translate(0, 1, 0);

export function Walkway() {
  const walk = useRef<THREE.InstancedMesh>(null!);
  const queue = useRef<THREE.InstancedMesh>(null!);
  const path = useMemo(() => {
    const seg = WALKWAY.slice(1).map((p, i) => Math.hypot(p.x - WALKWAY[i].x, p.z - WALKWAY[i].z));
    const cum = [0];
    seg.forEach((l) => cum.push(cum[cum.length - 1] + l));
    return { cum, len: cum[cum.length - 1] };
  }, []);
  const jitter = useMemo(() => {
    const r = rng(99);
    return Float32Array.from({ length: Math.max(MAX_WALK, MAX_QUEUE) * 2 }, () => r() * 2 - 1);
  }, []);
  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), q: new THREE.Quaternion(), p: new THREE.Vector3(), s: new THREE.Vector3() }), []);
  const pts = useMemo(() => WALKWAY.map((p) => [p.x, Y, p.z] as [number, number, number]), []);

  const at = (s: number) => {
    let i = 0;
    while (i < path.cum.length - 2 && path.cum[i + 1] < s) i++;
    const a = WALKWAY[i], b = WALKWAY[i + 1];
    const f = (s - path.cum[i]) / (path.cum[i + 1] - path.cum[i]);
    const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
    return { x: a.x + dx * f, z: a.z + dz * f, nx: -dz / l, nz: dx / l };
  };

  useFrame(() => {
    const { t, scenario } = useTwin.getState();
    const event = !!SCENARIOS[scenario].corridor?.arenaEvent;
    const st = event ? arenaStateAt(getArenaFlow(), SIMULATED_EVENT, t) : null;
    const size = Math.max(0.7, 2.2 / CAM.zoom);
    const width = STRAWBERRY_ARENA.walkway.widthM.value;
    const speed = STRAWBERRY_ARENA.walkway.speedMs.value;
    // Walking dots, evenly spread along the route and moving with simulation time
    const nWalk = st ? Math.min(MAX_WALK, Math.round(st.onWalkway / PEOPLE_PER_DOT)) : 0;
    for (let i = 0; i < nWalk; i++) {
      const s = ((i / nWalk) * path.len + t * speed) % path.len;
      const p = at(s);
      const off = jitter[i] * width * 0.45;
      tmp.p.set(p.x + p.nx * off, Y, p.z + p.nz * off);
      tmp.s.set(size, size, size);
      tmp.m.compose(tmp.p, tmp.q, tmp.s);
      walk.current.setMatrixAt(i, tmp.m);
    }
    walk.current.count = nWalk;
    walk.current.instanceMatrix.needsUpdate = true;
    // Queue at the arena end: a half-disc growing with the number of people waiting
    const nQ = st ? Math.min(MAX_QUEUE, Math.round(st.queue / PEOPLE_PER_DOT)) : 0;
    const g = WALKWAY[0], n = WALKWAY[1];
    const dl = Math.hypot(n.x - g.x, n.z - g.z), ux = (n.x - g.x) / dl, uz = (n.z - g.z) / dl;
    const R = 6 + Math.sqrt(nQ) * 2.4;
    for (let i = 0; i < nQ; i++) {
      const ang = (jitter[i * 2] * Math.PI) / 2;
      const rr = R * Math.sqrt(Math.abs(jitter[i * 2 + 1]));
      // Behind the gate (towards the arena), spread sideways
      const bx = -ux * Math.cos(ang) - uz * Math.sin(ang), bz = -uz * Math.cos(ang) + ux * Math.sin(ang);
      tmp.p.set(g.x + bx * rr, Y, g.z + bz * rr);
      tmp.s.set(size, size, size);
      tmp.m.compose(tmp.p, tmp.q, tmp.s);
      queue.current.setMatrixAt(i, tmp.m);
    }
    queue.current.count = nQ;
    queue.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <group>
      <Line points={pts} color={COLOR} lineWidth={16} transparent opacity={0.12} depthWrite={false} renderOrder={1} raycast={() => null} />
      <Line points={pts} color={COLOR} lineWidth={2.5} dashed dashSize={14} gapSize={9} renderOrder={4} raycast={() => null} />
      <instancedMesh ref={walk} args={[dotGeo, undefined, MAX_WALK]} frustumCulled={false} raycast={() => null}>
        <meshBasicMaterial color={COLOR} toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={queue} args={[dotGeo, undefined, MAX_QUEUE]} frustumCulled={false} raycast={() => null}>
        <meshBasicMaterial color="#F07C3A" toneMapped={false} />
      </instancedMesh>
    </group>
  );
}

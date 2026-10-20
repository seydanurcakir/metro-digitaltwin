// Fixed structure of a station twin, in the station's local frame. All dimensions come from its layout
// (i.e. the data model); no business logic here. Underground (T-Centralen) and surface (Solna) variants
// share the platform, tracks, escalators and furniture.
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useTwin } from '../twin/store';
import type { TwinDef } from '../twin/world';
import type { StationLayout } from '../twin/layout';
import { C } from './palette';
import { clickable, HIGHLIGHT } from './interaction';

type V3 = [number, number, number];

function Box({ p, s, color, cast = false, receive = true, emissive, opacity }: { p: V3; s: V3; color: string; cast?: boolean; receive?: boolean; emissive?: string; opacity?: number }) {
  return (
    <mesh position={p} castShadow={cast} receiveShadow={receive}>
      <boxGeometry args={s} />
      <meshStandardMaterial
        color={color} roughness={0.85} emissive={emissive ?? '#000000'} emissiveIntensity={emissive ? 0.9 : 0}
        transparent={opacity != null} opacity={opacity ?? 1}
      />
    </mesh>
  );
}

/** Box from the ranges [x0,x1] × [y0,y1] × [z0,z1] */
const span = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) => ({
  p: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2] as V3,
  s: [Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0)] as V3,
});

function useSignTexture(text: string, letter: string) {
  const tex = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 1024;
    c.height = 160;
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  useEffect(() => {
    const draw = () => {
      const c = tex.image as HTMLCanvasElement;
      const g = c.getContext('2d')!;
      g.fillStyle = C.sign;
      g.fillRect(0, 0, c.width, c.height);
      g.fillStyle = '#FFFFFF';
      g.beginPath();
      g.arc(90, 80, 52, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = C.sign;
      g.font = '600 76px "Barlow Condensed", "Arial Narrow", sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(letter, 90, 84);
      g.fillStyle = '#FFFFFF';
      g.font = '600 92px "Barlow", "Helvetica Neue", Arial, sans-serif';
      g.textAlign = 'left';
      g.fillText(text, 175, 86);
      tex.needsUpdate = true;
    };
    draw();
    document.fonts?.ready.then(draw).catch(() => {});
  }, [tex, text, letter]);
  return tex;
}

function Sleepers({ z, x0, x1 }: { z: number; x0: number; x1: number }) {
  const ref = useRef<THREE.InstancedMesh>(null!);
  const n = Math.floor((x1 - x0) / 0.65);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    for (let i = 0; i < n; i++) {
      m.makeTranslation(x0 + 0.3 + i * 0.65, 0.05, z);
      ref.current.setMatrixAt(i, m);
    }
    ref.current.instanceMatrix.needsUpdate = true;
  }, [n, x0, z]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, n]} receiveShadow>
      <boxGeometry args={[0.26, 0.12, 2.5]} />
      <meshStandardMaterial color={C.sleeper} roughness={0.9} />
    </instancedMesh>
  );
}

function Track({ z, x0, x1 }: { z: number; x0: number; x1: number }) {
  return (
    <group>
      <Box {...span(x0, x1, -0.4, 0, z - 2.3, z + 2.3)} color={C.ballast} />
      <Sleepers z={z} x0={x0} x1={x1} />
      <Box {...span(x0, x1, 0.1, 0.28, z - 0.8, z - 0.66)} color={C.rail} />
      <Box {...span(x0, x1, 0.1, 0.28, z + 0.66, z + 0.8)} color={C.rail} />
    </group>
  );
}

function Escalator({ tw, index }: { tw: TwinDef; index: number }) {
  const L = tw.layout;
  const { bottomX, topX, width } = L.escalators[index];
  const y0 = L.platformTop;
  const top = L.concourseY;
  const dx = topX - bottomX;
  const dy = top - y0;
  const len = Math.hypot(dx, dy);
  const ang = Math.atan2(dy, dx);
  const halo = useRef<THREE.Mesh>(null!);
  useFrame(() => {
    const s = useTwin.getState().selection;
    halo.current.visible = s?.kind === 'escalator' && s.twin === tw.id && s.index === index;
  });
  return (
    <group position={[(bottomX + topX) / 2, (y0 + top) / 2, 0]} rotation={[0, 0, ang]} {...clickable(() => ({ kind: 'escalator', twin: tw.id, index }))}>
      <mesh ref={halo} visible={false} position={[0, 0.5, 0]} raycast={() => null}>
        <boxGeometry args={[len + 1, 2.4, width + 1.2]} />
        <meshBasicMaterial color={HIGHLIGHT} transparent opacity={0.22} depthWrite={false} />
      </mesh>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[len, 0.45, width]} />
        <meshStandardMaterial color={C.steps} roughness={0.6} />
      </mesh>
      {[-1, 1].map((s) => (
        <group key={s}>
          <mesh position={[0, 0.7, (s * width) / 2]}>
            <boxGeometry args={[len, 1.0, 0.06]} />
            <meshStandardMaterial color={C.glass} transparent opacity={0.45} roughness={0.1} />
          </mesh>
          <mesh position={[0, 1.22, (s * width) / 2]}>
            <boxGeometry args={[len, 0.08, 0.12]} />
            <meshStandardMaterial color={C.handrail} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** Island platform with edge strips */
function Platform({ L }: { L: StationLayout }) {
  const W = L.platformWidth;
  const half = L.platformLength / 2;
  return (
    <group>
      <Box {...span(-half, half, -0.4, L.platformTop, -W / 2, W / 2)} color={C.platform} />
      <Box {...span(-half + 0.3, half - 0.3, L.platformTop, L.platformTop + 0.01, -W / 2 + 0.25, -W / 2 + 0.5)} color={C.platformEdge} />
      <Box {...span(-half + 0.3, half - 0.3, L.platformTop, L.platformTop + 0.01, W / 2 - 0.5, W / 2 - 0.25)} color={C.platformEdge} />
    </group>
  );
}

/** Columns with departure displays and benches. `top` is where the columns end (ceiling beam or canopy). */
function Furniture({ L, top, displayY }: { L: StationLayout; top: number; displayY: number }) {
  return (
    <group>
      {L.pillarsX.map((x, i) => (
        <group key={x}>
          <Box {...span(x - 0.35, x + 0.35, L.platformTop, top, -0.35, 0.35)} color={L.kind === 'surface' ? C.steel : C.pillar} cast />
          {i % 2 === 0 && (
            <group>
              <Box {...span(x - 1.6, x + 1.6, displayY, displayY + 0.7, -0.25, 0.25)} color={C.display} cast />
              <Box {...span(x - 1.3, x + 1.3, displayY + 0.25, displayY + 0.45, 0.25, 0.27)} color={C.displayText} emissive={C.displayText} />
              <Box {...span(x - 1.3, x + 1.3, displayY + 0.25, displayY + 0.45, -0.27, -0.25)} color={C.displayText} emissive={C.displayText} />
            </group>
          )}
          {i % 2 === 1 && <Box {...span(x - 1.1, x + 1.1, L.platformTop, L.platformTop + 0.45, 0.9, 1.4)} color={C.bench} cast />}
        </group>
      ))}
    </group>
  );
}

function Concourse({ L, side }: { L: StationLayout; side: -1 | 1 }) {
  const inner = side * (L.platformLength / 2 - 12);
  const outer = side * L.hallHalfX;
  const [x0, x1] = side < 0 ? [outer, inner] : [inner, outer];
  const y = L.concourseY;
  const zFront = 2.2;
  const gates = Array.from({ length: 6 }, (_, i) => L.wallZ + 2 + i * 1.6);
  const gateX = side * (L.hallHalfX - 7);
  return (
    <group>
      <Box {...span(x0, x1, y - 0.7, y, L.wallZ, zFront)} color={C.concourse} cast />
      <mesh position={[(x0 + x1) / 2, y + 0.55, zFront]}>
        <boxGeometry args={[x1 - x0, 1.1, 0.06]} />
        <meshStandardMaterial color={C.glass} transparent opacity={0.4} />
      </mesh>
      {gates.map((gz) => (
        <Box key={gz} {...span(gateX - 1.2, gateX + 1.2, y, y + 1.0, gz - 0.12, gz + 0.12)} color={C.gate} cast />
      ))}
      {/* Columns tying the mezzanine to the back wall */}
      {[0.25, 0.75].map((f) => (
        <Box key={f} {...span(x0 + (x1 - x0) * f - 0.35, x0 + (x1 - x0) * f + 0.35, -0.4, y - 0.7, L.wallZ + 0.3, L.wallZ + 1.0)} color={C.pillar} cast />
      ))}
    </group>
  );
}

function Signs({ tw, positions, y, z, flip = false }: { tw: TwinDef; positions: number[]; y: number; z: number; flip?: boolean }) {
  const sign = useSignTexture(tw.name, tw.signLetter);
  return (
    <group>
      {positions.map((x) => (
        <mesh key={x} position={[x + 6.5, y, z]} rotation={[0, flip ? Math.PI : 0, 0]} {...clickable(() => ({ kind: 'station', line: tw.line, stationId: tw.stationId }))}>
          <planeGeometry args={[13, 2.03]} />
          <meshBasicMaterial map={sign} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

function Underground({ tw }: { tw: TwinDef }) {
  const L = tw.layout;
  const H = L.hallHalfX;
  const signsX = [-L.platformLength / 2 + 22, -12, L.platformLength / 2 - 46];
  const adsX = [-L.platformLength / 2 + 6, 14, L.platformLength / 2 - 18];
  const tunnelLen = L.zoneHalf - H;
  return (
    <group>
      {/* Floor slab */}
      <Box {...span(-H, H, -1.4, -0.4, L.wallZ, L.frontZ)} color={C.slab} />
      <Track z={L.trackZ.north} x0={-H} x1={H} />
      <Track z={L.trackZ.south} x0={-H} x1={H} />
      <Platform L={L} />

      {/* Back wall */}
      <Box {...span(-H, H, -0.4, 9.4, L.wallZ - 0.6, L.wallZ)} color={C.wall} />
      <Box {...span(-H, H, -0.4, 1.7, L.wallZ, L.wallZ + 0.02)} color={C.wallDado} />
      <Box {...span(-H, H, 3.0, 3.35, L.wallZ, L.wallZ + 0.03)} color={C.redStripe} />
      {adsX.map((x, i) => (
        <Box key={x} {...span(x, x + 7, 1.9, 2.8, L.wallZ, L.wallZ + 0.04)} color={C.ad[i % C.ad.length]} />
      ))}
      <Signs tw={tw} positions={signsX} y={4.95} z={L.wallZ + 0.05} />

      <Furniture L={L} top={8.6} displayY={5.5} />
      <Box {...span(L.pillarsX[0] - 6, L.pillarsX[L.pillarsX.length - 1] + 6, 8.6, 9.1, -0.9, 0.9)} color={C.beam} cast />
      <Box {...span(L.pillarsX[0] - 6, L.pillarsX[L.pillarsX.length - 1] + 6, 8.55, 8.6, -0.7, -0.5)} color={C.lightStrip} emissive={C.lightStrip} />
      <Box {...span(L.pillarsX[0] - 6, L.pillarsX[L.pillarsX.length - 1] + 6, 8.55, 8.6, 0.5, 0.7)} color={C.lightStrip} emissive={C.lightStrip} />

      {L.escalators.map((e, i) => <Escalator key={e.bottomX} tw={tw} index={i} />)}
      <Concourse L={L} side={-1} />
      <Concourse L={L} side={1} />

      {/* Tunnel blocks and portals: trains run in and out here */}
      {[-1, 1].map((s) => {
        const [x0, x1] = s < 0 ? [-H - tunnelLen, -H] : [H, H + tunnelLen];
        const face = s < 0 ? -H + 0.03 : H - 0.03;
        return (
          <group key={s}>
            <Box {...span(x0, x1, -1.4, 5.6, L.wallZ - 0.6, L.frontZ)} color={C.tunnel} />
            <Box {...span(x0, x1, 5.6, 5.62, L.wallZ - 0.6, L.frontZ)} color={C.tunnelTop} />
            {[L.trackZ.north, L.trackZ.south].map((z) => (
              <Box key={z} {...span(face - 0.04, face + 0.04, -0.4, 4.7, z - 2.2, z + 2.2)} color={C.portal} receive={false} />
            ))}
          </group>
        );
      })}
    </group>
  );
}

/** Overhead line masts every 50 m on both sides, with a cross-arm and a contact wire over each track */
function Catenary({ L }: { L: StationLayout }) {
  const masts = useMemo(() => {
    const xs: number[] = [];
    for (let x = -L.zoneHalf + 10; x <= L.zoneHalf - 10; x += 50) xs.push(x);
    return xs;
  }, [L.zoneHalf]);
  const zN = L.wallZ + 1.2, zS = L.frontZ - 1.2;
  return (
    <group>
      {masts.map((x) => (
        <group key={x}>
          {[zN, zS].map((z) => <Box key={z} {...span(x - 0.18, x + 0.18, -0.4, 7.2, z - 0.18, z + 0.18)} color={C.steel} cast />)}
          <Box {...span(x - 0.12, x + 0.12, 6.9, 7.15, zN, zS)} color={C.steel} />
        </group>
      ))}
      {[L.trackZ.north, L.trackZ.south].map((z) => (
        <Box key={z} {...span(-L.zoneHalf, L.zoneHalf, 6.1, 6.16, z - 0.03, z + 0.03)} color={C.handrail} receive={false} />
      ))}
    </group>
  );
}

/** Footbridge over the tracks at one end of a surface station, with ticket gates and stair towers */
function Footbridge({ L, side }: { L: StationLayout; side: -1 | 1 }) {
  const a = side * (L.platformLength / 2 - 12);
  const b = side * (L.platformLength / 2 + 4);
  const [x0, x1] = side < 0 ? [b, a] : [a, b];
  const y = L.concourseY;
  const z0 = L.wallZ - 4, z1 = L.frontZ + 4;
  const xm = (x0 + x1) / 2;
  const gates = Array.from({ length: 5 }, (_, i) => xm - 4 + i * 2);
  return (
    <group>
      <Box {...span(x0, x1, y - 0.7, y, z0, z1)} color={C.bridgeDeck} cast />
      {[x0, x1].map((x) => (
        <mesh key={x} position={[x, y + 0.6, (z0 + z1) / 2]}>
          <boxGeometry args={[0.08, 1.2, z1 - z0]} />
          <meshStandardMaterial color={C.glass} transparent opacity={0.45} />
        </mesh>
      ))}
      <Box {...span(x0 - 0.4, x1 + 0.4, y + 3.0, y + 3.3, z0 - 0.4, z1 + 0.4)} color={C.canopy} cast />
      {[z0 + 0.3, z1 - 0.3].map((z) => [x0 + 0.3, x1 - 0.3].map((x) => (
        <Box key={`${x}${z}`} {...span(x - 0.15, x + 0.15, y, y + 3.0, z - 0.15, z + 0.15)} color={C.steel} />
      )))}
      {/* Ticket gates across the bridge on both sides of the tracks */}
      {[L.wallZ - 1.5, L.frontZ + 1.5].map((gz) => gates.map((gx) => (
        <Box key={`${gx}${gz}`} {...span(gx - 0.12, gx + 0.12, y, y + 1.0, gz - 1.0, gz + 1.0)} color={C.gate} cast />
      )))}
      {/* Stair towers down to street level */}
      {[[z0 - 6, z0], [z1, z1 + 6]].map(([za, zb]) => (
        <group key={za}>
          <Box {...span(xm - 3.5, xm + 3.5, -1.4, y - 0.2, za, zb)} color={C.concourse} cast />
          <Box {...span(xm - 3.8, xm + 3.8, y + 3.0, y + 3.3, za - 0.3, zb + 0.3)} color={C.canopy} cast />
        </group>
      ))}
    </group>
  );
}

function Surface({ tw }: { tw: TwinDef }) {
  const L = tw.layout;
  const Z = L.zoneHalf;
  const W = L.platformWidth;
  const roof0 = L.pillarsX[0] - 9, roof1 = L.pillarsX[L.pillarsX.length - 1] + 9;
  const signsX = [-L.platformLength / 2 + 30, -6.5, L.platformLength / 2 - 43];
  const canopyY = 5.0;
  return (
    <group>
      {/* Embankment and tracks along the whole twin zone */}
      <Box {...span(-Z, Z, -1.4, -0.42, L.wallZ, L.frontZ)} color={C.embankment} />
      <Track z={L.trackZ.north} x0={-Z} x1={Z} />
      <Track z={L.trackZ.south} x0={-Z} x1={Z} />
      <Platform L={L} />
      <Box {...span(-L.platformLength / 2 + 0.6, L.platformLength / 2 - 0.6, L.platformTop - 0.3, L.platformTop - 0.02, -0.15, 0.15)} color={C.pinkStripe} />

      {/* Canopy on a central row of columns */}
      <Furniture L={L} top={canopyY} displayY={3.4} />
      {/* Glass roof on a steel frame, so the platform crowd stays visible from above */}
      <Box {...span(roof0, roof1, canopyY + 0.2, canopyY + 0.3, -W / 2 - 0.6, W / 2 + 0.6)} color={C.glass} opacity={0.28} receive={false} />
      <Box {...span(roof0, roof1, canopyY, canopyY + 0.35, -0.4, 0.4)} color={C.steel} cast />
      {L.pillarsX.map((x) => <Box key={x} {...span(x - 0.12, x + 0.12, canopyY + 0.05, canopyY + 0.3, -W / 2 - 0.6, W / 2 + 0.6)} color={C.steel} />)}
      <Box {...span(roof0, roof1, canopyY - 0.25, canopyY, -W / 2 - 0.6, -W / 2 - 0.4)} color={C.canopyEdge} />
      <Box {...span(roof0, roof1, canopyY - 0.25, canopyY, W / 2 + 0.4, W / 2 + 0.6)} color={C.canopyEdge} />
      <Box {...span(roof0 + 2, roof1 - 2, canopyY - 0.06, canopyY, -1.4, -1.1)} color={C.lightStrip} emissive={C.lightStrip} />
      <Box {...span(roof0 + 2, roof1 - 2, canopyY - 0.06, canopyY, 1.1, 1.4)} color={C.lightStrip} emissive={C.lightStrip} />
      <Signs tw={tw} positions={signsX} y={canopyY - 1.35} z={0.42} />
      <Signs tw={tw} positions={signsX} y={canopyY - 1.35} z={-0.42} flip />

      {L.escalators.map((e, i) => <Escalator key={e.bottomX} tw={tw} index={i} />)}
      <Footbridge L={L} side={-1} />
      <Footbridge L={L} side={1} />
      <Catenary L={L} />

      {/* Boundary fences */}
      {[L.wallZ + 0.3, L.frontZ - 0.3].map((z) => (
        <Box key={z} {...span(-Z, Z, -0.4, 1.6, z - 0.04, z + 0.04)} color={C.fence} opacity={0.55} />
      ))}
    </group>
  );
}

export function Station({ tw }: { tw: TwinDef }) {
  return tw.kind === 'underground' ? <Underground tw={tw} /> : <Surface tw={tw} />;
}

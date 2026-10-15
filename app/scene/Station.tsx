// İstasyonun sabit yapısı. Tüm ölçüler LAYOUT'tan (veri modelinden) gelir; iş mantığı yok.
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { LAYOUT, STATION, useTwin } from '../twin/store';
import { C } from './palette';
import { clickable, HIGHLIGHT } from './interaction';

type V3 = [number, number, number];

function Box({ p, s, color, cast = false, receive = true, emissive }: { p: V3; s: V3; color: string; cast?: boolean; receive?: boolean; emissive?: string }) {
  return (
    <mesh position={p} castShadow={cast} receiveShadow={receive}>
      <boxGeometry args={s} />
      <meshStandardMaterial color={color} roughness={0.85} emissive={emissive ?? '#000000'} emissiveIntensity={emissive ? 0.9 : 0} />
    </mesh>
  );
}

/** [x0,x1] × [y0,y1] × [z0,z1] aralığından kutu */
const span = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) => ({
  p: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2] as V3,
  s: [x1 - x0, y1 - y0, z1 - z0] as V3,
});

function useSignTexture(text: string) {
  const tex = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 1024;
    c.height = 160;
    return new THREE.CanvasTexture(c);
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
      g.fillText('T', 90, 84);
      g.fillStyle = '#FFFFFF';
      g.font = '600 92px "Barlow", "Helvetica Neue", Arial, sans-serif';
      g.textAlign = 'left';
      g.fillText(text, 175, 86);
      tex.needsUpdate = true;
    };
    draw();
    document.fonts?.ready.then(draw).catch(() => {});
  }, [tex, text]);
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

function Escalator({ index, bottomX, topX, width, top }: { index: number; bottomX: number; topX: number; width: number; top: number }) {
  const y0 = LAYOUT.platformTop;
  const dx = topX - bottomX;
  const dy = top - y0;
  const len = Math.hypot(dx, dy);
  const ang = Math.atan2(dy, dx);
  const halo = useRef<THREE.Mesh>(null!);
  useFrame(() => {
    const s = useTwin.getState().selection;
    halo.current.visible = s?.kind === 'escalator' && s.index === index;
  });
  return (
    <group position={[(bottomX + topX) / 2, (y0 + top) / 2, 0]} rotation={[0, 0, ang]} {...clickable(() => ({ kind: 'escalator', index }))}>
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

function Concourse({ side }: { side: -1 | 1 }) {
  const L = LAYOUT;
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
      {/* Asma katı arka duvara bağlayan kolonlar */}
      {[0.25, 0.75].map((f) => (
        <Box key={f} {...span(x0 + (x1 - x0) * f - 0.35, x0 + (x1 - x0) * f + 0.35, -0.4, y - 0.7, L.wallZ + 0.3, L.wallZ + 1.0)} color={C.pillar} cast />
      ))}
    </group>
  );
}

export function Station() {
  const L = LAYOUT;
  const W = L.platformWidth;
  const H = L.hallHalfX;
  const sign = useSignTexture(STATION.name);
  const signsX = [-L.platformLength / 2 + 22, -12, L.platformLength / 2 - 46];
  const adsX = [-L.platformLength / 2 + 6, 14, L.platformLength / 2 - 18];
  const tunnelLen = 50;

  return (
    <group>
      {/* Zemin döşemesi */}
      <Box {...span(-H, H, -1.4, -0.4, L.wallZ, L.frontZ)} color={C.slab} />
      <Track z={L.trackZ.north} x0={-H} x1={H} />
      <Track z={L.trackZ.south} x0={-H} x1={H} />

      {/* Ada peron */}
      <Box {...span(-L.platformLength / 2, L.platformLength / 2, -0.4, L.platformTop, -W / 2, W / 2)} color={C.platform} />
      <Box {...span(-L.platformLength / 2 + 0.3, L.platformLength / 2 - 0.3, L.platformTop, L.platformTop + 0.01, -W / 2 + 0.25, -W / 2 + 0.5)} color={C.platformEdge} />
      <Box {...span(-L.platformLength / 2 + 0.3, L.platformLength / 2 - 0.3, L.platformTop, L.platformTop + 0.01, W / 2 - 0.5, W / 2 - 0.25)} color={C.platformEdge} />

      {/* Arka duvar */}
      <Box {...span(-H, H, -0.4, 9.4, L.wallZ - 0.6, L.wallZ)} color={C.wall} />
      <Box {...span(-H, H, -0.4, 1.7, L.wallZ, L.wallZ + 0.02)} color={C.wallDado} />
      <Box {...span(-H, H, 3.0, 3.35, L.wallZ, L.wallZ + 0.03)} color={C.redStripe} />
      {adsX.map((x, i) => (
        <Box key={x} {...span(x, x + 7, 1.9, 2.8, L.wallZ, L.wallZ + 0.04)} color={C.ad[i % C.ad.length]} />
      ))}
      {signsX.map((x) => (
        <mesh key={x} position={[x + 6.5, 4.95, L.wallZ + 0.05]} {...clickable(() => ({ kind: 'station' }))}>
          <planeGeometry args={[13, 2.03]} />
          <meshBasicMaterial map={sign} toneMapped={false} />
        </mesh>
      ))}

      {/* Kolonlar, tavan kirişi, ışık şeritleri, ekranlar, banklar */}
      {L.pillarsX.map((x, i) => (
        <group key={x}>
          <Box {...span(x - 0.35, x + 0.35, L.platformTop, 8.6, -0.35, 0.35)} color={C.pillar} cast />
          {i % 2 === 0 && (
            <group>
              <Box {...span(x - 1.6, x + 1.6, 5.5, 6.2, -0.25, 0.25)} color={C.display} cast />
              <Box {...span(x - 1.3, x + 1.3, 5.75, 5.95, 0.25, 0.27)} color={C.displayText} emissive={C.displayText} />
              <Box {...span(x - 1.3, x + 1.3, 5.75, 5.95, -0.27, -0.25)} color={C.displayText} emissive={C.displayText} />
            </group>
          )}
          {i % 2 === 1 && <Box {...span(x - 1.1, x + 1.1, L.platformTop, L.platformTop + 0.45, 0.9, 1.4)} color={C.bench} cast />}
        </group>
      ))}
      <Box {...span(L.pillarsX[0] - 6, L.pillarsX[L.pillarsX.length - 1] + 6, 8.6, 9.1, -0.9, 0.9)} color={C.beam} cast />
      <Box {...span(L.pillarsX[0] - 6, L.pillarsX[L.pillarsX.length - 1] + 6, 8.55, 8.6, -0.7, -0.5)} color={C.lightStrip} emissive={C.lightStrip} />
      <Box {...span(L.pillarsX[0] - 6, L.pillarsX[L.pillarsX.length - 1] + 6, 8.55, 8.6, 0.5, 0.7)} color={C.lightStrip} emissive={C.lightStrip} />

      {/* Yürüyen merdivenler ve asma katlar */}
      {L.escalators.map((e, i) => (
        <Escalator key={e.bottomX} index={i} bottomX={e.bottomX} topX={e.topX} width={e.width} top={L.concourseY} />
      ))}
      <Concourse side={-1} />
      <Concourse side={1} />

      {/* Tünel blokları ve tünel ağızları: trenler buradan çıkar */}
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

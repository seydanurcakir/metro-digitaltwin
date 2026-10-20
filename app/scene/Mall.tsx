// Westfield Mall of Scandinavia as a landmark model: a lit shop-front podium under a dark clad volume,
// neon bands and chevrons on the facades, a digital billboard facing Solna station and an illuminated 'M'
// on the roof. Static context: the billboard cycles fixed messages; no live data.
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import * as THREE from 'three';
import { BILLBOARD, MALL_H, MALL_RING, ROOF_CENTRE, letterM, neonSegments, type P2 } from '../twin/mall';
import { CAM } from './cam';

const G = -0.6; // ground level of the context buildings
const NEON = { cyan: '#4FE3FF', magenta: '#FF4FD8', m: '#FFD27A' };

/** Shape in the x/−z plane: rotated −90° about x it lies on the ground in world x/z */
const toShape = (pts: P2[]) => new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));

function extrude(pts: P2[], depth: number) {
  const g = new THREE.ExtrudeGeometry(toShape(pts), { depth, bevelEnabled: false });
  g.rotateX(-Math.PI / 2);
  return g;
}

const MESSAGES = ['MALL OF SCANDINAVIA', 'ARENASTADEN · SOLNA', 'STRAWBERRY ARENA  ←', 'SOLNA STATION  →'];

function Billboard() {
  const { canvas, ctx, tex } = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 256;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return { canvas, ctx: canvas.getContext('2d')!, tex };
  }, []);
  const last = useRef(-1);
  useEffect(() => () => tex.dispose(), [tex]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const frame = Math.floor(t * 12);
    if (frame === last.current) return;
    last.current = frame;
    const W = canvas.width, H = canvas.height;
    // Moving gradient background
    const g = ctx.createLinearGradient(0, 0, W, H);
    const h = (t * 18) % 360;
    g.addColorStop(0, `hsl(${h}, 85%, 22%)`);
    g.addColorStop(1, `hsl(${(h + 120) % 360}, 85%, 14%)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // Scan lines and a sweeping light bar
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    for (let y = 0; y < H; y += 6) ctx.fillRect(0, y, W, 2);
    const sx = ((t * 260) % (W + 400)) - 200;
    const sg = ctx.createLinearGradient(sx - 120, 0, sx + 120, 0);
    sg.addColorStop(0, 'rgba(255,255,255,0)');
    sg.addColorStop(0.5, 'rgba(255,255,255,0.18)');
    sg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sg;
    ctx.fillRect(0, 0, W, H);
    // Message, cross-faded every 4 s
    const i = Math.floor(t / 4) % MESSAGES.length, k = (t % 4) / 4;
    ctx.globalAlpha = Math.min(1, k * 6, (1 - k) * 6);
    ctx.font = '600 92px "Barlow Condensed", "Arial Narrow", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(120, 230, 255, 0.9)';
    ctx.shadowBlur = 24;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(MESSAGES[i], W / 2, H / 2 + 4, W - 60);
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    tex.needsUpdate = true;
  });
  const b = BILLBOARD;
  const off = 0.9;
  return (
    <group position={[b.centre.x + b.edge.out.x * off, G + b.y, b.centre.z + b.edge.out.z * off]} rotation={[0, b.rotY, 0]}>
      <mesh position={[0, 0, -0.5]} raycast={() => null}>
        <boxGeometry args={[b.width + 2, b.height + 2, 1]} />
        <meshStandardMaterial color="#0B0F14" roughness={0.6} />
      </mesh>
      <mesh position={[0, 0, 0.02]} raycast={() => null}>
        <planeGeometry args={[b.width, b.height]} />
        <meshBasicMaterial map={tex} toneMapped={false} />
      </mesh>
    </group>
  );
}

function RoofM() {
  const size = Math.min(70, ROOF_CENTRE.clearance * 1.5);
  const geo = useMemo(() => {
    // Letter in the roof plane, reading upright with north at the top of the map
    const pts = letterM(size, size * 0.8).map(([x, y]) => [x, -y] as P2);
    return extrude(pts, 2.4);
  }, [size]);
  const halo = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const x = c.getContext('2d')!;
    const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255, 210, 122, 0.55)');
    g.addColorStop(1, 'rgba(255, 210, 122, 0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  }, []);
  const mat = useRef<THREE.MeshStandardMaterial>(null!);
  useFrame(({ clock }) => { mat.current.emissiveIntensity = 1.6 + 0.35 * Math.sin(clock.elapsedTime * 2.2); });
  const p = ROOF_CENTRE.p, y = G + MALL_H.total;
  return (
    <group position={[p.x, y, p.z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.15, 0]} raycast={() => null}>
        <planeGeometry args={[size * 1.9, size * 1.9]} />
        <meshBasicMaterial map={halo} transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </mesh>
      <mesh geometry={geo} position={[0, 0.2, 0]} raycast={() => null}>
        <meshStandardMaterial ref={mat} color="#FFF3D6" emissive={NEON.m} emissiveIntensity={1.6} toneMapped={false} />
      </mesh>
    </group>
  );
}

export function Mall() {
  const geo = useMemo(() => {
    const podium = extrude(MALL_RING, MALL_H.podium);
    const upper = extrude(MALL_RING, MALL_H.total - MALL_H.podium);
    const n = neonSegments();
    const toPts = (a: number[]) => {
      const out: [number, number, number][] = [];
      for (let i = 0; i < a.length; i += 3) out.push([a[i], a[i + 1] + G, a[i + 2]]);
      return out;
    };
    const roof = new THREE.ShapeGeometry(toShape(MALL_RING));
    roof.rotateX(-Math.PI / 2);
    return { podium, upper, roof, bands: toPts(n.bands), zigzag: toPts(n.zigzag) };
  }, []);
  const neon = useRef<THREE.Group>(null!);
  useFrame(() => { neon.current.visible = CAM.zoom > 0.14; });
  return (
    <group>
      {/* Lit shop fronts */}
      <mesh geometry={geo.podium} position={[0, G, 0]} castShadow receiveShadow raycast={() => null}>
        <meshStandardMaterial color="#2A2418" emissive="#6B4A1C" emissiveIntensity={0.55} roughness={0.35} metalness={0.3} />
      </mesh>
      {/* Dark clad upper volume */}
      <mesh geometry={geo.upper} position={[0, G + MALL_H.podium, 0]} castShadow receiveShadow raycast={() => null}>
        <meshStandardMaterial color="#2A3446" roughness={0.55} metalness={0.1} />
      </mesh>
      {/* Roof deck, a shade lighter so the landmark reads from above */}
      <mesh geometry={geo.roof} position={[0, G + MALL_H.total + 0.05, 0]} receiveShadow raycast={() => null}>
        <meshStandardMaterial color="#3A4558" roughness={0.8} metalness={0} />
      </mesh>
      <group ref={neon}>
        <Line points={geo.bands} segments color={NEON.cyan} lineWidth={7} transparent opacity={0.22} toneMapped={false} depthWrite={false} raycast={() => null} />
        <Line points={geo.bands} segments color={NEON.cyan} lineWidth={2.2} toneMapped={false} raycast={() => null} />
        <Line points={geo.zigzag} segments color={NEON.magenta} lineWidth={6} transparent opacity={0.22} toneMapped={false} depthWrite={false} raycast={() => null} />
        <Line points={geo.zigzag} segments color={NEON.magenta} lineWidth={2} toneMapped={false} raycast={() => null} />
      </group>
      <Billboard />
      <RoofM />
    </group>
  );
}

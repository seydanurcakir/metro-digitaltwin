// 3D map scene: orthographic camera over a seamless street map, the rail network with live trains, and the
// two station twins placed at their real positions. Drag to pan, wheel to zoom, right-drag to rotate.
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { MapControls, OrthographicCamera } from '@react-three/drei';
import * as THREE from 'three';
import type { MapControls as MapControlsImpl } from 'three-stdlib';
import { useTwin, TWIN_POLAR, TWIN_ZOOM, type CameraCommand } from '../twin/store';
import { BOUNDS, TWINS, TWIN_IDS, type TwinDef } from '../twin/world';
import { trainPose } from '../twin/trainpose';
import { Station } from './Station';
import { Trains } from './Trains';
import { Crowd } from './Crowd';
import { MapGround } from './MapGround';
import { NetworkLines } from './NetworkLines';
import { NetworkTrains } from './NetworkTrains';
import { StationLabels } from './StationLabels';
import { Arena } from './Arena';
import { Walkway } from './Walkway';
import { Context } from './Context';
import { BaseMap } from './BaseMap';
import { OsmBuildings } from './OsmBuildings';
import { HoverGuard } from './interaction';
import { CAM, LOD } from './cam';

const CAM_DIST = 40000;
const POLAR = TWIN_POLAR;
const FLY_SEC = 1.1;

const lodOf = (z: number) => (z < LOD.labelsAll ? 'far' : z < 0.35 ? 'wide' : z < 2.4 ? 'mid' : 'close');

interface View {
  x: number;
  z: number;
  zoom: number;
  az: number;
  polar: number;
}
interface Anim {
  from: View;
  to: View;
  t: number;
}

function Controls() {
  const ref = useRef<MapControlsImpl>(null!);
  const { camera, gl } = useThree();
  const cam = camera as THREE.OrthographicCamera;
  const anim = useRef<Anim | null>(null);
  const tmp = useMemo(() => ({ sph: new THREE.Spherical(), off: new THREE.Vector3(), d: new THREE.Vector3(), lod: '' }), []);

  /** Put the camera at azimuth `az` and tilt `polar` around (x, z) */
  const place = (x: number, z: number, az: number, polar: number) => {
    const c = ref.current;
    tmp.sph.set(CAM_DIST, polar, az);
    tmp.off.setFromSpherical(tmp.sph);
    camera.position.set(x + tmp.off.x, tmp.off.y, z + tmp.off.z);
    camera.lookAt(x, 0, z);
    if (c) c.target.set(x, 0, z);
  };

  useLayoutEffect(() => {
    const tw = TWINS.tc;
    tmp.sph.set(CAM_DIST, POLAR, tw.viewAzimuth);
    tmp.off.setFromSpherical(tmp.sph);
    camera.position.set(tw.pos.x + tmp.off.x, tmp.off.y, tw.pos.z + tmp.off.z);
    camera.lookAt(tw.pos.x, 0, tw.pos.z);
    cam.zoom = TWIN_ZOOM;
    cam.updateProjectionMatrix();
    ref.current?.target.set(tw.pos.x, 0, tw.pos.z);
    ref.current?.update();
  }, [camera, cam, tmp]);

  useEffect(() => {
    const start = (cmd: CameraCommand) => {
      const c = ref.current;
      const az = c.getAzimuthalAngle();
      let to = cmd.azimuth ?? az;
      // Shortest way round
      while (to - az > Math.PI) to -= 2 * Math.PI;
      while (az - to > Math.PI) to += 2 * Math.PI;
      const polar = c.getPolarAngle();
      anim.current = {
        from: { x: c.target.x, z: c.target.z, zoom: cam.zoom, az, polar },
        to: { x: cmd.x, z: cmd.z, zoom: cmd.zoom, az: to, polar: cmd.polar ?? polar },
        t: 0,
      };
    };
    return useTwin.subscribe((s, prev) => { if (s.camera && s.camera !== prev.camera) start(s.camera); });
  }, [cam]);

  useFrame((_, dt) => {
    const c = ref.current;
    if (!c) return;
    const a = anim.current;
    if (a) {
      a.t = Math.min(1, a.t + dt / FLY_SEC);
      const k = a.t < 0.5 ? 4 * a.t ** 3 : 1 - (-2 * a.t + 2) ** 3 / 2;
      // Zoom out in the middle of long flights so the move reads as travel across the map
      const dist = Math.hypot(a.to.x - a.from.x, a.to.z - a.from.z);
      const hop = Math.min(a.from.zoom, a.to.zoom, Math.max(0.12, 900 / Math.max(1, dist)));
      const zl = Math.log(a.from.zoom) + (Math.log(a.to.zoom) - Math.log(a.from.zoom)) * k;
      const dip = dist > 1500 ? Math.sin(Math.PI * k) * Math.max(0, zl - Math.log(hop)) : 0;
      cam.zoom = Math.exp(zl - dip);
      cam.updateProjectionMatrix();
      place(a.from.x + (a.to.x - a.from.x) * k, a.from.z + (a.to.z - a.from.z) * k, a.from.az + (a.to.az - a.from.az) * k, a.from.polar + (a.to.polar - a.from.polar) * k);
      if (a.t >= 1) anim.current = null;
    } else {
      const { follow, t, result, corridor } = useTwin.getState();
      if (follow) {
        const trips = follow.line === 'T14' ? result.trips : corridor.result.trips;
        const trip = trips.find((x) => x.id === follow.tripId);
        const p = trip ? trainPose(follow.line, trip, t) : null;
        if (p) {
          const f = 1 - Math.exp(-dt * 5);
          tmp.d.set((p.x - c.target.x) * f, 0, (p.z - c.target.z) * f);
          c.target.add(tmp.d);
          camera.position.add(tmp.d);
        }
      }
    }
    // Keep the view over the modelled area
    const tx = THREE.MathUtils.clamp(c.target.x, BOUNDS.x0, BOUNDS.x1);
    const tz = THREE.MathUtils.clamp(c.target.z, BOUNDS.z0, BOUNDS.z1);
    if (tx !== c.target.x || tz !== c.target.z || c.target.y !== 0) {
      tmp.d.set(tx - c.target.x, -c.target.y, tz - c.target.z);
      c.target.add(tmp.d);
      camera.position.add(tmp.d);
    }
    CAM.zoom = cam.zoom;
    CAM.x = c.target.x;
    CAM.z = c.target.z;
    const lod = lodOf(cam.zoom);
    if (lod !== tmp.lod) {
      tmp.lod = lod;
      gl.domElement.closest('.stage')?.setAttribute('data-lod', lod);
    }
    // Moving close to a twin makes it the focus of the HUD
    if (cam.zoom > 1) {
      const st = useTwin.getState();
      for (const id of TWIN_IDS) {
        const p = TWINS[id].pos;
        if (id !== st.focus && Math.hypot(p.x - CAM.x, p.z - CAM.z) < 450) st.focusTwin(id, false);
      }
    }
  });

  return (
    <MapControls
      ref={ref}
      makeDefault
      enableDamping
      dampingFactor={0.12}
      screenSpacePanning={false}
      minZoom={0.04}
      maxZoom={28}
      minPolarAngle={0.12}
      maxPolarAngle={1.2}
      zoomToCursor
      onStart={() => {
        anim.current = null;
        if (useTwin.getState().follow) useTwin.getState().setFollow(null);
      }}
    />
  );
}

/** Sun with shadows around the focused twin (the shadow map only covers ~300 m) */
function Sun() {
  const light = useRef<THREE.DirectionalLight>(null!);
  const target = useMemo(() => new THREE.Object3D(), []);
  useFrame(() => {
    const p = TWINS[useTwin.getState().focus].pos;
    target.position.set(p.x, 0, p.z);
    light.current.position.set(p.x - 60, 120, p.z + 80);
    target.updateMatrixWorld();
  });
  return (
    <group>
      <primitive object={target} />
      <directionalLight
        ref={light}
        target={target}
        intensity={1.6}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-160}
        shadow-camera-right={160}
        shadow-camera-top={120}
        shadow-camera-bottom={-120}
        shadow-camera-near={1}
        shadow-camera-far={500}
        shadow-bias={-0.0004}
      />
    </group>
  );
}

/** A station twin placed on the map. Hidden when far outside the view to save draw calls. */
function TwinOnMap({ tw }: { tw: TwinDef }) {
  const group = useRef<THREE.Group>(null!);
  const { size } = useThree();
  useFrame(() => {
    const reach = (Math.max(size.width, size.height) / CAM.zoom) * 1.2 + 600;
    group.current.visible = Math.hypot(tw.pos.x - CAM.x, tw.pos.z - CAM.z) < reach;
  });
  return (
    <group ref={group} position={[tw.pos.x, 0, tw.pos.z]} rotation={[0, tw.rotY, 0]}>
      <Station tw={tw} />
      <Trains tw={tw} />
      <Crowd tw={tw} />
    </group>
  );
}

export function Scene() {
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true }}
      style={{ position: 'absolute', inset: 0 }}
      onPointerMissed={(e) => { if (e.type === 'click') useTwin.getState().select(null); }}
    >
      <OrthographicCamera makeDefault zoom={TWIN_ZOOM} near={10} far={120000} position={[0, CAM_DIST, 0]} />
      <Controls />
      <hemisphereLight args={['#FFFFFF', '#8A939C', 1.1]} />
      <Sun />
      <MapGround />
      <BaseMap />
      <Context />
      <OsmBuildings />
      <NetworkLines />
      <Walkway />
      <Arena />
      <NetworkTrains />
      {TWIN_IDS.map((id) => <TwinOnMap key={id} tw={TWINS[id]} />)}
      <StationLabels />
      <HoverGuard />
    </Canvas>
  );
}

// Seamless street map under the network: OpenStreetMap vector tiles drawn in the twin's dark style
// (app/map/style.ts) into canvas textures, laid out as slippy-map tiles in the local metric frame. The tile
// level follows the camera zoom; a coarser level stays underneath so panning and zooming never show gaps,
// and the tile background equals the map ground, so there are no visible edges anywhere.
// Flat and drawn first (no depth test), so it never hides the rail lines, stations, trains or buildings.
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { localToTile, tileOrigin, tileSizeM } from '../../src/index';
import { useTwin } from '../twin/store';
import { DATA_MAX_Z, dataTile, tileTemplate } from '../map/vector';
import { drawTile, prepare } from '../map/style';
import { CAM } from './cam';

const SIZE = 512;
const MAX_FINE = 48;
const CACHE_MAX = 96;
const DRAWS_PER_FRAME = 3;
const Z_MIN = 9;
const Z_MAX = 19;

/** Tile level whose texture resolution matches the screen at this camera zoom (px per metre) */
export function tileZoomFor(camZoom: number, dpr: number): number {
  const z = Math.ceil(Math.log2((0.8 * camZoom * dpr * tileSizeM(0)) / SIZE));
  return Math.max(Z_MIN, Math.min(Z_MAX, z));
}

interface Entry {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  state: 'waiting' | 'ready' | 'drawn' | 'empty';
  data: ReturnType<typeof prepare> | null;
  z: number; x: number; y: number;
  base: boolean;
  wanted: boolean;
  /** Drawn tile of the previous view kept under the new one until its replacements are drawn */
  staleUntil: number;
  used: number;
}

const planeGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

export function BaseMap() {
  const { camera, gl } = useThree();
  const group = useRef<THREE.Group>(null!);
  const cache = useRef(new Map<string, Entry>());
  const status = useTwin((s) => s.basemap);
  const tmp = useMemo(() => ({ v: new THREE.Vector3(), d: new THREE.Vector3(), last: 0, key: '' }), []);
  const aniso = Math.min(8, gl.capabilities.getMaxAnisotropy());

  useEffect(() => {
    void tileTemplate();
    const c = cache.current;
    if (new URLSearchParams(window.location.search).has('debug'))
      (window as unknown as Record<string, unknown>).__tiles = () => [...c.values()].map((e) => ({ k: `${e.z}/${e.x}/${e.y}`, state: e.state, visible: e.mesh.visible }));
    return () => {
      for (const e of c.values()) { e.mat.map?.dispose(); e.mat.dispose(); }
      c.clear();
    };
  }, []);

  const ensure = (z: number, x: number, y: number, now: number, base: boolean): Entry => {
    const key = `${z}/${x}/${y}`;
    let e = cache.current.get(key);
    if (!e) {
      const mat = new THREE.MeshBasicMaterial({ color: '#FFFFFF', toneMapped: false, depthTest: false, depthWrite: false });
      const mesh = new THREE.Mesh(planeGeo, mat);
      const o = tileOrigin(z, x, y), s = tileSizeM(z);
      mesh.position.set(o.x + s / 2, base ? -2.79 : -2.78, o.z + s / 2);
      mesh.scale.set(s, 1, s);
      mesh.visible = false;
      mesh.renderOrder = base ? -3.95 : -3.9;
      mesh.raycast = () => {};
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      const entry: Entry = { mesh, mat, state: 'waiting', data: null, z, x, y, base, wanted: true, staleUntil: 0, used: now };
      const dz = Math.min(z, DATA_MAX_Z), k = z - dz;
      dataTile(dz, x >> k, y >> k).then((t) => {
        if (!cache.current.has(key)) return;
        entry.data = t ? prepare(t) : null;
        entry.state = t ? 'ready' : 'empty';
      });
      group.current.add(mesh);
      cache.current.set(key, entry);
      e = entry;
    }
    e.used = now;
    return e;
  };

  const draw = (e: Entry) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = SIZE;
    const ctx = canvas.getContext('2d')!;
    const dz = Math.min(e.z, DATA_MAX_Z), k = e.z - dz;
    drawTile(ctx, SIZE, e.data, e.z, 2 ** k, e.x - ((e.x >> k) << k), e.y - ((e.y >> k) << k));
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = aniso;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    e.mat.map = tex;
    e.mat.needsUpdate = true;
    e.state = 'drawn';
    e.data = null;
    e.mesh.visible = e.wanted;
    useTwin.getState().setBasemap('ok');
  };

  useFrame(() => {
    if (status === 'off' || status === 'unavailable') return;
    const now = performance.now();
    // Draw a few decoded tiles per frame, nearest the view centre first
    const ready = [...cache.current.values()].filter((e) => e.state === 'ready' && e.wanted);
    if (ready.length) {
      const cx = CAM.x, cz = CAM.z;
      const dist = (e: Entry) => {
        const o = tileOrigin(e.z, e.x, e.y), s = tileSizeM(e.z);
        return (e.base ? -1e12 : 0) + (o.x + s / 2 - cx) ** 2 + (o.z + s / 2 - cz) ** 2;
      };
      ready.sort((a, b) => dist(a) - dist(b));
      for (const e of ready.slice(0, DRAWS_PER_FRAME)) draw(e);
    }

    // Recompute the wanted tiles when the view changed, and twice a second otherwise
    const cam = camera as THREE.OrthographicCamera;
    const key = `${camera.position.x.toFixed(1)}|${camera.position.z.toFixed(1)}|${camera.position.y.toFixed(1)}|${cam.zoom.toFixed(4)}|${camera.quaternion.y.toFixed(4)}`;
    if (key === tmp.key && now - tmp.last < 500) return;
    tmp.key = key;
    tmp.last = now;

    // Ground area under the screen (orthographic rays are parallel: unproject the four corners)
    camera.getWorldDirection(tmp.d);
    if (tmp.d.y > -0.05) return;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [nx, ny] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      tmp.v.set(nx, ny, -1).unproject(camera);
      const k = -tmp.v.y / tmp.d.y;
      const gx = tmp.v.x + tmp.d.x * k, gz = tmp.v.z + tmp.d.z * k;
      x0 = Math.min(x0, gx); x1 = Math.max(x1, gx); z0 = Math.min(z0, gz); z1 = Math.max(z1, gz);
    }
    const lim = 30000;
    x0 = Math.max(x0, CAM.x - lim); x1 = Math.min(x1, CAM.x + lim); z0 = Math.max(z0, CAM.z - lim); z1 = Math.min(z1, CAM.z + lim);
    const range = (zz: number) => {
      const a = localToTile({ x: x0, z: z0 }, zz), b = localToTile({ x: x1, z: z1 }, zz);
      return { tx0: Math.floor(a.tx), tx1: Math.floor(b.tx), ty0: Math.floor(a.ty), ty1: Math.floor(b.ty) };
    };
    let z = tileZoomFor(cam.zoom, gl.getPixelRatio());
    let r = range(z);
    while ((r.tx1 - r.tx0 + 1) * (r.ty1 - r.ty0 + 1) > MAX_FINE && z > Z_MIN) r = range(--z);
    let zb = Math.max(Z_MIN - 1, z - 3);
    let rb = range(zb);
    while ((rb.tx1 - rb.tx0 + 1) * (rb.ty1 - rb.ty0 + 1) > 12 && zb > 4) rb = range(--zb);

    const want = new Set<string>();
    for (let x = rb.tx0; x <= rb.tx1; x++) for (let y = rb.ty0; y <= rb.ty1; y++) { ensure(zb, x, y, now, true); want.add(`${zb}/${x}/${y}`); }
    for (let x = r.tx0; x <= r.tx1; x++) for (let y = r.ty0; y <= r.ty1; y++) { ensure(z, x, y, now, false); want.add(`${z}/${x}/${y}`); }
    // Tiles of the previous view stay visible underneath for a moment, so changing level never flashes
    // an empty map; the new level's opaque tiles cover them as they are drawn.
    for (const [k, e] of cache.current) {
      const drawn = e.state === 'drawn';
      if (want.has(k)) {
        e.wanted = true;
        e.staleUntil = 0;
        e.mesh.renderOrder = e.base ? -3.95 : -3.9;
      } else if (e.wanted) {
        e.wanted = false;
        e.staleUntil = drawn ? now + 2500 : 0;
        e.mesh.renderOrder = -3.98;
      }
      e.mesh.visible = drawn && (e.wanted || e.staleUntil > now);
    }
    if (cache.current.size > CACHE_MAX) {
      const old = [...cache.current.entries()].filter(([k, e]) => !want.has(k) && e.staleUntil <= now).sort((a, b) => a[1].used - b[1].used);
      for (const [k, e] of old.slice(0, cache.current.size - CACHE_MAX)) {
        e.mat.map?.dispose();
        e.mat.dispose();
        group.current.remove(e.mesh);
        cache.current.delete(k);
      }
    }
  });

  return <group ref={group} visible={status !== 'off' && status !== 'unavailable'} />;
}

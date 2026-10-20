// Geographic ground: slippy-map raster tiles laid out in the local metric frame, under the network and the twins.
// Tiles are fetched by the browser at run time (OpenStreetMap data via CARTO basemaps). When they cannot be
// loaded (offline, or a host that blocks external images) a plain ground with a 1 km grid stays visible and
// the HUD says so; the rail network, stations and trains are drawn from bundled data either way.
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { localToTile, tileOrigin, tileSizeM } from '../../src/index';
import { useTwin } from '../twin/store';
import { MAP_GROUND } from './palette';
import { CAM } from './cam';
import { useTheme, type Theme } from './theme';

const MAX_TILES = 64;
const CACHE_MAX = 360;
const Y_FINE = -2.2;
const Y_BASE = -2.45;
const Y_GROUND = -2.8;

/** Tile URL template for the theme, or null when tiles are switched off (?tiles=off) */
export function tileTemplate(theme: Theme): string | null {
  const q = new URLSearchParams(window.location.search).get('tiles');
  if (q === 'off') return null;
  if (q) return q;
  const style = theme === 'dark' ? 'dark_all' : 'light_all';
  return `https://{s}.basemaps.cartocdn.com/${style}/{z}/{x}/{y}@2x.png`;
}

const urlFor = (tpl: string, z: number, x: number, y: number) =>
  tpl.replace('{s}', 'abcd'[(x + y) % 4]).replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));

interface TileEntry {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  loaded: boolean;
  failed: boolean;
  /** Needed for the current view */
  wanted: boolean;
  used: number;
}

const planeGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

function Tiles({ template }: { template: string }) {
  const { camera, gl } = useThree();
  const group = useRef<THREE.Group>(null!);
  const cache = useRef(new Map<string, TileEntry>());
  const stats = useRef({ ok: 0, err: 0 });
  const loader = useMemo(() => {
    const l = new THREE.TextureLoader();
    l.setCrossOrigin('anonymous');
    return l;
  }, []);
  const tmp = useMemo(() => ({ v: new THREE.Vector3(), d: new THREE.Vector3(), last: 0, key: '' }), []);
  const aniso = Math.min(8, gl.capabilities.getMaxAnisotropy());
  // Test hook: ?debug exposes tile state to automated checks
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has('debug'))
      (window as unknown as Record<string, unknown>).__tileCache = cache.current;
    if (new URLSearchParams(window.location.search).has('debug'))
      (window as unknown as Record<string, unknown>).__tiles = () => [...cache.current.entries()].map(([k, e]) => ({ k, loaded: e.loaded, failed: e.failed, visible: e.mesh.visible, pos: e.mesh.position.toArray().map(Math.round), s: Math.round(e.mesh.scale.x), parent: !!e.mesh.parent }));
  }, []);

  useEffect(() => {
    useTwin.getState().setBasemap('loading');
    const c = cache.current;
    return () => {
      for (const e of c.values()) { e.mat.map?.dispose(); e.mat.dispose(); group.current?.remove(e.mesh); }
      c.clear();
      stats.current = { ok: 0, err: 0 };
    };
  }, [template]);

  const ensure = (z: number, x: number, y: number, now: number, base: boolean): TileEntry => {
    const key = `${z}/${x}/${y}`;
    let e = cache.current.get(key);
    if (!e) {
      const mat = new THREE.MeshBasicMaterial({ color: '#FFFFFF', toneMapped: false });
      const mesh = new THREE.Mesh(planeGeo, mat);
      const o = tileOrigin(z, x, y);
      const s = tileSizeM(z);
      mesh.position.set(o.x + s / 2, base ? Y_BASE : Y_FINE, o.z + s / 2);
      mesh.scale.set(s, 1, s);
      mesh.visible = false;
      mesh.renderOrder = base ? -3 : -2;
      mesh.raycast = () => {};
      const entry: TileEntry = { mesh, mat, loaded: false, failed: false, wanted: true, used: now };
      loader.load(
        urlFor(template, z, x, y),
        (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.anisotropy = aniso;
          mat.map = tex;
          mat.needsUpdate = true;
          entry.loaded = true;
          mesh.visible = entry.wanted;
          stats.current.ok++;
          useTwin.getState().setBasemap('ok');
        },
        undefined,
        () => {
          entry.failed = true;
          stats.current.err++;
          if (stats.current.ok === 0 && stats.current.err >= 4) useTwin.getState().setBasemap('unavailable');
        },
      );
      group.current.add(mesh);
      cache.current.set(key, entry);
      e = entry;
    }
    e.used = now;
    return e;
  };

  useFrame(() => {
    // Recompute when the view changed, and twice a second otherwise
    const now = performance.now();
    const key = `${camera.position.x.toFixed(1)}|${camera.position.z.toFixed(1)}|${camera.position.y.toFixed(1)}|${(camera as THREE.OrthographicCamera).zoom.toFixed(4)}`;
    if (key === tmp.key && now - tmp.last < 500) return;
    tmp.key = key;
    tmp.last = now;

    // Ground area under the four screen corners
    camera.getWorldDirection(tmp.d);
    if (tmp.d.y > -0.05) return;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [nx, ny] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      tmp.v.set(nx, ny, -1).unproject(camera);
      const k = -tmp.v.y / tmp.d.y;
      const gx = tmp.v.x + tmp.d.x * k, gz = tmp.v.z + tmp.d.z * k;
      x0 = Math.min(x0, gx); x1 = Math.max(x1, gx); z0 = Math.min(z0, gz); z1 = Math.max(z1, gz);
    }
    const cx = CAM.x, cz = CAM.z, lim = 25000;
    x0 = Math.max(x0, cx - lim); x1 = Math.min(x1, cx + lim); z0 = Math.max(z0, cz - lim); z1 = Math.min(z1, cz + lim);

    let z = Math.max(10, Math.min(19, Math.round(Math.log2((tileSizeM(0) * CAM.zoom) / 256))));
    const range = (zz: number) => {
      const a = localToTile({ x: x0, z: z0 }, zz), b = localToTile({ x: x1, z: z1 }, zz);
      return { tx0: Math.floor(a.tx), tx1: Math.floor(b.tx), ty0: Math.floor(a.ty), ty1: Math.floor(b.ty) };
    };
    let r = range(z);
    while ((r.tx1 - r.tx0 + 1) * (r.ty1 - r.ty0 + 1) > MAX_TILES && z > 9) r = range(--z);
    const zb = Math.max(9, z - 3);
    const rb = range(zb);

    const want = new Set<string>();
    for (let x = rb.tx0; x <= rb.tx1; x++) for (let y = rb.ty0; y <= rb.ty1; y++) {
      ensure(zb, x, y, now, true);
      want.add(`${zb}/${x}/${y}`);
    }
    // Load the fine tiles nearest the view centre first
    const fine: [number, number, number][] = [];
    const c = localToTile({ x: cx, z: cz }, z);
    for (let x = r.tx0; x <= r.tx1; x++) for (let y = r.ty0; y <= r.ty1; y++) fine.push([x, y, (x + 0.5 - c.tx) ** 2 + (y + 0.5 - c.ty) ** 2]);
    fine.sort((a, b) => a[2] - b[2]);
    for (const [x, y] of fine) { ensure(z, x, y, now, false); want.add(`${z}/${x}/${y}`); }

    for (const [k, e] of cache.current) {
      e.wanted = want.has(k);
      e.mesh.visible = e.wanted && e.loaded;
    }

    if (cache.current.size > CACHE_MAX) {
      const old = [...cache.current.entries()].filter(([k]) => !want.has(k)).sort((a, b) => a[1].used - b[1].used);
      for (const [k, e] of old.slice(0, cache.current.size - CACHE_MAX)) {
        e.mat.map?.dispose();
        e.mat.dispose();
        group.current.remove(e.mesh);
        cache.current.delete(k);
      }
    }
  });

  return <group ref={group} />;
}

function Ground({ theme }: { theme: Theme }) {
  const col = MAP_GROUND[theme];
  const grid = useMemo(() => {
    const g = new THREE.GridHelper(60000, 60, col.grid, col.grid);
    g.position.y = Y_GROUND + 0.05;
    (g.material as THREE.Material).depthWrite = false;
    g.raycast = () => {};
    return g;
  }, [col.grid]);
  useEffect(() => () => { grid.geometry.dispose(); (grid.material as THREE.Material).dispose(); }, [grid]);
  return (
    <group>
      <mesh position={[0, Y_GROUND, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null} renderOrder={-4}>
        <planeGeometry args={[60000, 60000]} />
        <meshBasicMaterial color={col.ground} toneMapped={false} />
      </mesh>
      <primitive object={grid} />
    </group>
  );
}

export function MapGround() {
  const theme = useTheme();
  const template = tileTemplate(theme);
  useEffect(() => { if (!template) useTwin.getState().setBasemap('off'); }, [template]);
  return (
    <group>
      <Ground theme={theme} />
      {template && <Tiles key={template} template={template} />}
    </group>
  );
}

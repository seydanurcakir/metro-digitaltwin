// Street map data: OpenStreetMap vector tiles (OpenMapTiles schema) from OpenFreeMap — free, keyless, no
// usage limits. Tiles are fetched by the browser at run time, decoded here and shared by the flat base map
// (BaseMap.tsx) and the 3D buildings (OsmBuildings.tsx). Attribution: © OpenMapTiles, data © OpenStreetMap
// contributors (shown in the HUD).
//
// URL parameters: ?tiles=off draws no street map; ?tiles=<template with {z}/{x}/{y}> uses another
// OpenMapTiles-schema source (used by the automated checks with a local test server).
import { VectorTile } from '@mapbox/vector-tile';
import { PbfReader } from 'pbf';
import { useTwin } from '../twin/store';

export const TILEJSON_URL = 'https://tiles.openfreemap.org/planet';
/** Highest zoom level with data; deeper views draw from these tiles (over-zoom) */
export const DATA_MAX_Z = 14;
const CACHE_MAX = 400;

const param = () => (typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('tiles'));

let templateP: Promise<string | null> | null = null;
/** Tile URL template, or null when the street map is off or its source cannot be reached */
export function tileTemplate(): Promise<string | null> {
  if (templateP) return templateP;
  const q = param();
  if (q === 'off') {
    useTwin.getState().setBasemap('off');
    templateP = Promise.resolve(null);
  } else if (q) {
    templateP = Promise.resolve(q);
  } else {
    templateP = fetch(TILEJSON_URL)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`TileJSON ${r.status}`))))
      .then((j: { tiles?: string[] }) => {
        if (!j.tiles?.[0]) throw new Error('TileJSON without tiles');
        return j.tiles[0];
      })
      .catch(() => {
        useTwin.getState().setBasemap('unavailable');
        return null;
      });
  }
  return templateP;
}

const cache = new Map<string, { p: Promise<VectorTile | null>; used: number }>();
const stats = { ok: 0, err: 0 };

/** Decoded data tile (z ≤ DATA_MAX_Z), or null when it could not be loaded */
export function dataTile(z: number, x: number, y: number): Promise<VectorTile | null> {
  const k = `${z}/${x}/${y}`;
  const hit = cache.get(k);
  if (hit) {
    hit.used = performance.now();
    return hit.p;
  }
  const p = tileTemplate().then(async (tpl) => {
    if (!tpl) return null;
    const url = tpl.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));
    try {
      const r = await fetch(url);
      if (r.status === 204 || r.status === 404) {
        stats.ok++;
        return new VectorTile(new PbfReader(new Uint8Array(0)));
      }
      if (!r.ok) throw new Error(String(r.status));
      const t = new VectorTile(new PbfReader(new Uint8Array(await r.arrayBuffer())));
      stats.ok++;
      return t;
    } catch {
      stats.err++;
      cache.delete(k); // retry on a later request
      if (stats.ok === 0 && stats.err >= 4) useTwin.getState().setBasemap('unavailable');
      return null;
    }
  });
  cache.set(k, { p, used: performance.now() });
  if (cache.size > CACHE_MAX) {
    const old = [...cache.entries()].sort((a, b) => a[1].used - b[1].used).slice(0, cache.size - CACHE_MAX);
    for (const [kk] of old) cache.delete(kk);
  }
  return p;
}

// Local map projection for the twin.
// World frame (metres): origin at T-Centralen, +x = east, +z = south, +y = up.
// It is Web Mercator scaled by cos(lat0), so slippy-map tiles stay axis-aligned squares and
// distances are true to within ~0.1% across the modelled area (±10 km).

export interface LatLon {
  lat: number;
  lon: number;
}
export interface XZ {
  x: number;
  z: number;
}

/** T-Centralen (Wikipedia: 59.33167 N, 18.06083 E) */
export const ORIGIN: LatLon = { lat: 59.33167, lon: 18.06083 };

const R = 6378137;
const D2R = Math.PI / 180;
/** Circumference of the Web Mercator world (m) */
export const MERCATOR_WORLD = 2 * Math.PI * R;
/** Mercator metres → local metres */
export const SCALE = Math.cos(ORIGIN.lat * D2R);

const mercX = (lon: number) => R * lon * D2R;
const mercY = (lat: number) => R * Math.log(Math.tan(Math.PI / 4 + (lat * D2R) / 2));
const X0 = mercX(ORIGIN.lon);
const Y0 = mercY(ORIGIN.lat);

export function toLocal(p: LatLon): XZ {
  return { x: (mercX(p.lon) - X0) * SCALE, z: -(mercY(p.lat) - Y0) * SCALE };
}

export function toLatLon(p: XZ): LatLon {
  const mx = p.x / SCALE + X0;
  const my = -p.z / SCALE + Y0;
  return { lon: mx / R / D2R, lat: (2 * Math.atan(Math.exp(my / R)) - Math.PI / 2) / D2R };
}

/** Edge length of one slippy-map tile at zoom level z, in local metres */
export const tileSizeM = (z: number) => (MERCATOR_WORLD / 2 ** z) * SCALE;

/** Fractional tile coordinates of a local point at zoom z */
export function localToTile(p: XZ, z: number): { tx: number; ty: number } {
  const n = 2 ** z;
  const mx = p.x / SCALE + X0;
  const my = -p.z / SCALE + Y0;
  return { tx: ((mx + MERCATOR_WORLD / 2) / MERCATOR_WORLD) * n, ty: ((MERCATOR_WORLD / 2 - my) / MERCATOR_WORLD) * n };
}

/** North-west corner of tile (tx, ty) in local metres; the tile spans +size in x and +size in z */
export function tileOrigin(z: number, tx: number, ty: number): XZ {
  const n = 2 ** z;
  const mx = -MERCATOR_WORLD / 2 + (tx / n) * MERCATOR_WORLD;
  const my = MERCATOR_WORLD / 2 - (ty / n) * MERCATOR_WORLD;
  return { x: (mx - X0) * SCALE, z: -(my - Y0) * SCALE };
}

/** Compass bearing (degrees clockwise from north) → unit vector in the world frame */
export const bearingToVec = (deg: number): XZ => ({ x: Math.sin(deg * D2R), z: -Math.cos(deg * D2R) });

/** Great-circle distance (m), used by tests to check the projection */
export function haversine(a: LatLon, b: LatLon): number {
  const dLat = (b.lat - a.lat) * D2R;
  const dLon = (b.lon - a.lon) * D2R;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * D2R) * Math.cos(b.lat * D2R) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371008.8 * Math.asin(Math.sqrt(h));
}

// Tests for the map layer: projection, tiles, line alignments and train kinematics.
// Run: npm run test:geo
import {
  buildAlignment, buildCorridor, buildDataset, haversine, localToTile, motionModel, poseAt, simulate, tileOrigin, tileSizeM,
  toLatLon, toLocal, trainAt, ORIGIN, PLATFORM_AXIS, STATION_GEO, bearingToVec, type Alignment, type MotionModel, type SimResult,
} from '../src/index';

let failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? '✔' : '✘'} ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) failed++;
};

console.log('\n— Projection');
const o = toLocal(ORIGIN);
check('T-Centralen is the origin', Math.hypot(o.x, o.z) < 1e-6);
let worst = 0;
for (const g of Object.values(STATION_GEO)) {
  const back = toLatLon(toLocal(g));
  worst = Math.max(worst, Math.abs(back.lat - g.lat), Math.abs(back.lon - g.lon));
}
check('Round trip lat/lon → local → lat/lon is exact', worst < 1e-9, `max error ${worst.toExponential(1)}°`);
let distErr = 0;
const ids = Object.keys(STATION_GEO);
for (const a of ids) for (const b of ids) {
  const pa = toLocal(STATION_GEO[a]), pb = toLocal(STATION_GEO[b]);
  const d = Math.hypot(pa.x - pb.x, pa.z - pb.z), h = haversine(STATION_GEO[a], STATION_GEO[b]);
  if (h > 500) distErr = Math.max(distErr, Math.abs(d - h) / h);
}
check('Local distances match great-circle distances within 0.5%', distErr < 0.005, `max ${(distErr * 100).toFixed(2)}%`);
const sol = toLocal(STATION_GEO.solna);
check('Solna lies north-west of T-Centralen', sol.x < 0 && sol.z < 0, `x ${sol.x.toFixed(0)} m, z ${sol.z.toFixed(0)} m`);
const nv = bearingToVec(0), ev = bearingToVec(90);
check('Bearing 0° points north (−z), 90° east (+x)', Math.abs(nv.z + 1) < 1e-12 && Math.abs(ev.x - 1) < 1e-12);

console.log('\n— Tiles');
let tileOk = true;
for (const z of [10, 13, 16, 19]) {
  for (const g of [STATION_GEO.fruangen, STATION_GEO['t-centralen'], STATION_GEO.solna]) {
    const p = toLocal(g);
    const { tx, ty } = localToTile(p, z);
    const c = tileOrigin(z, Math.floor(tx), Math.floor(ty));
    const s = tileSizeM(z);
    if (!(p.x >= c.x - 1e-6 && p.x < c.x + s + 1e-6 && p.z >= c.z - 1e-6 && p.z < c.z + s + 1e-6)) tileOk = false;
  }
}
check('Each station falls inside the tile computed for it (z 10–19)', tileOk);
// Reference: standard OSM slippy-map formula
const osmTile = (lat: number, lon: number, z: number) => {
  const n = 2 ** z, r = (lat * Math.PI) / 180;
  return [Math.floor(((lon + 180) / 360) * n), Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n)];
};
let osmOk = true;
for (const g of Object.values(STATION_GEO)) for (const z of [12, 16, 19]) {
  const [ex, ey] = osmTile(g.lat, g.lon, z);
  const q = localToTile(toLocal(g), z);
  if (Math.floor(q.tx) !== ex || Math.floor(q.ty) !== ey) osmOk = false;
}
const tc16 = localToTile(o, 16);
check('Tile numbers match the standard OSM formula for every station', osmOk, `T-Centralen at z16: ${Math.floor(tc16.tx)}/${Math.floor(tc16.ty)}`);

console.log('\n— Alignments');
const t14 = buildDataset();
const r14 = simulate(t14, t14.plans.find((p) => p.id === 'current')!);
const cor = buildCorridor(t14, r14);
const rc = simulate(cor.ds, cor.ds.plans[0], { surges: cor.transfer.surges });
const alT = buildAlignment('T14', t14.line);
const alC = buildAlignment('PENDEL', cor.ds.line);
for (const [al, name] of [[alT, 'T14'], [alC, 'commuter corridor']] as [Alignment, string][]) {
  let inc = true;
  for (let i = 1; i < al.arc.length; i++) if (!(al.arc[i] > al.arc[i - 1])) inc = false;
  check(`${name}: arc length strictly increasing`, inc, `${(al.length / 1000).toFixed(1)} km`);
  check(`${name}: stations in order along the line`, al.stationArc.every((s, i) => i === 0 || s > al.stationArc[i - 1]));
}
for (const [id, al] of [['t-centralen', alT], ['solna', alC]] as [string, Alignment][]) {
  const s = al.arcOf[id];
  const ax = PLATFORM_AXIS[id];
  const u = bearingToVec(ax.bearingDeg.value);
  let aligned = true;
  for (const d of [-ax.straightHalfM + 5, -60, 0, 60, ax.straightHalfM - 5]) {
    const p = poseAt(al, s + d);
    if (Math.abs(Math.abs(p.dx * u.x + p.dz * u.z) - 1) > 1e-9) aligned = false;
  }
  const c = toLocal(STATION_GEO[id]), p0 = poseAt(al, s);
  check(`${id}: line is straight along the platform axis`, aligned && Math.hypot(p0.x - c.x, p0.z - c.z) < 1e-6);
}

console.log('\n— Train kinematics');
const mT = motionModel(t14.line, t14.fleet, alT), mC = motionModel(cor.ds.line, cor.ds.fleet, alC);
for (const [m, r, name, vmax] of [[mT, r14, 'T14', 25], [mC, rc, 'commuter', 40]] as [MotionModel, SimResult, string, number][]) {
  let atStops = true, mono = true, maxV = 0, nan = false;
  for (const trip of r.trips) {
    const sign = trip.direction === 'north' ? 1 : -1;
    let prev: number | null = null;
    const a = trip.stops[0].t, b = trip.stops[trip.stops.length - 1].t;
    for (let t = a; t <= b; t += 5) {
      const p = trainAt(m, trip, t)!;
      if (!p || !Number.isFinite(p.s)) { nan = true; break; }
      if (prev != null) {
        if ((p.s - prev) * sign < -1e-6) mono = false;
        maxV = Math.max(maxV, Math.abs(p.s - prev) / 5);
      }
      prev = p.s;
    }
    for (const st of trip.stops) {
      const p = trainAt(m, trip, st.t)!;
      const centre = m.al.stationArc[st.stationOrder];
      if (Math.abs(p.s - centre) > m.halfPlatform[st.stationOrder] + 1e-6 && !m.isBoundary[st.stationOrder]) atStops = false;
    }
    if (trainAt(m, trip, a - 1) !== null || trainAt(m, trip, b + 1) !== null) atStops = false;
  }
  check(`${name}: every position is defined`, !nan);
  check(`${name}: trains stop within the platform at every call`, atStops);
  check(`${name}: trains never move backwards`, mono);
  check(`${name}: top speed is plausible (< ${vmax} m/s)`, maxV < vmax, `${maxV.toFixed(1)} m/s = ${(maxV * 3.6).toFixed(0)} km/h`);
}

console.log(`\n${failed === 0 ? 'All tests passed.' : `${failed} test(s) failed.`}`);
process.exit(failed === 0 ? 0 : 1);

// Rail lines on the map: T14 and the commuter corridor drawn from their alignments with a soft glow,
// the virtual corridor ends faded, and the walking transfer between T-Centralen and Stockholm City dashed.
// Widths are in pixels, so the lines read the same at every zoom level.
import { useMemo } from 'react';
import { Line } from '@react-three/drei';
import { slice, toLocal, STATION_GEO } from '../../src/index';
import { LINES } from '../twin/world';
import { MAP_GROUND } from './palette';

const Y = -1.0;
type P3 = [number, number, number];
const to3 = (pts: { x: number; z: number }[], dy = 0): P3[] => pts.map((p) => [p.x, Y + dy, p.z]);

export function NetworkLines() {
  const geo = useMemo(() => {
    const t14 = LINES.T14.al;
    const pd = LINES.PENDEL.al;
    const city = pd.arcOf['stockholm-city'];
    const ulr = pd.arcOf.ulriksdal;
    const a = toLocal(STATION_GEO['t-centralen']), b = toLocal(STATION_GEO['stockholm-city']);
    return {
      t14: slice(t14, 0, t14.length),
      pendel: slice(pd, city, ulr),
      stubS: to3(slice(pd, 0, city)),
      stubN: to3(slice(pd, ulr, pd.length)),
      walk: [[a.x, Y + 0.05, a.z], [b.x, Y + 0.05, b.z]] as P3[],
    };
  }, []);
  const main = [
    { pts: geo.t14, color: LINES.T14.color },
    { pts: geo.pendel, color: LINES.PENDEL.color },
  ];
  return (
    <group>
      {main.map(({ pts, color }, i) => (
        <group key={i}>
          <Line points={to3(pts, -0.1)} color={color} lineWidth={14} transparent opacity={0.16} depthWrite={false} renderOrder={1} raycast={() => null} />
          <Line points={to3(pts, -0.05)} color={MAP_GROUND.casing} lineWidth={7} renderOrder={2} raycast={() => null} />
          <Line points={to3(pts)} color={color} lineWidth={4} renderOrder={3} raycast={() => null} />
        </group>
      ))}
      {[geo.stubS, geo.stubN].map((pts, i) => (
        <Line key={`s${i}`} points={pts} color={LINES.PENDEL.color} lineWidth={3} transparent opacity={0.4} renderOrder={3} raycast={() => null} />
      ))}
      <Line points={geo.walk} color="#B8C2CC" lineWidth={2.5} dashed dashSize={10} gapSize={8} renderOrder={4} raycast={() => null} />
    </group>
  );
}

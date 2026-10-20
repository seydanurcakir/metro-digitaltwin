// Rail lines on the map: T14 and the commuter corridor drawn from their alignments, the virtual corridor
// ends faded, and the walking transfer between T-Centralen and Stockholm City dashed. Widths are in pixels,
// so the lines read the same at every zoom level.
import { useMemo } from 'react';
import { Line } from '@react-three/drei';
import { slice, toLocal, STATION_GEO } from '../../src/index';
import { LINES } from '../twin/world';
import { MAP_GROUND } from './palette';
import { useTheme } from './theme';

const Y = -1.0;
type P3 = [number, number, number];
const to3 = (pts: { x: number; z: number }[]): P3[] => pts.map((p) => [p.x, Y, p.z]);

export function NetworkLines() {
  const theme = useTheme();
  const casing = MAP_GROUND[theme].casing;
  const geo = useMemo(() => {
    const t14 = LINES.T14.al;
    const pd = LINES.PENDEL.al;
    const city = pd.arcOf['stockholm-city'];
    const ulr = pd.arcOf.ulriksdal;
    const a = toLocal(STATION_GEO['t-centralen']), b = toLocal(STATION_GEO['stockholm-city']);
    return {
      t14: to3(slice(t14, 0, t14.length)),
      pendel: to3(slice(pd, city, ulr)),
      stubS: to3(slice(pd, 0, city)),
      stubN: to3(slice(pd, ulr, pd.length)),
      walk: [[a.x, Y + 0.05, a.z], [b.x, Y + 0.05, b.z]] as P3[],
    };
  }, []);
  return (
    <group>
      {[geo.t14, geo.pendel].map((pts, i) => <Line key={`c${i}`} points={pts.map(([x, y, z]) => [x, y - 0.05, z] as P3)} color={casing} lineWidth={8} renderOrder={1} raycast={() => null} />)}
      {[geo.stubS, geo.stubN].map((pts, i) => (
        <Line key={`s${i}`} points={pts} color={LINES.PENDEL.color} lineWidth={3} transparent opacity={0.45} renderOrder={2} raycast={() => null} />
      ))}
      <Line points={geo.t14} color={LINES.T14.color} lineWidth={4.5} renderOrder={2} raycast={() => null} />
      <Line points={geo.pendel} color={LINES.PENDEL.color} lineWidth={4.5} renderOrder={2} raycast={() => null} />
      <Line points={geo.walk} color={theme === 'dark' ? '#B8C2CC' : '#4F5B66'} lineWidth={2.5} dashed dashSize={10} gapSize={8} renderOrder={3} raycast={() => null} />
    </group>
  );
}

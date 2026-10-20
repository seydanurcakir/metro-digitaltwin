// Station markers and names on the map (DOM labels pinned to map positions). Clicking a station selects it;
// the two stations with a 3D twin carry a "3D" badge and fly the camera there.
import { useCallback } from 'react';
import { Html } from '@react-three/drei';
import { useTwin } from '../twin/store';
import { MAP_STATIONS, type MapStation } from '../twin/world';
import { CAM } from './cam';

function Label({ s }: { s: MapStation }) {
  const onClick = () => {
    const st = useTwin.getState();
    if (s.twin) {
      st.focusTwin(s.twin);
      st.select({ kind: 'station', line: s.line, stationId: s.id });
      return;
    }
    if (s.boundary) return;
    st.select({ kind: 'station', line: s.line, stationId: s.id });
    st.flyTo(s.pos.x, s.pos.z, Math.max(CAM.zoom, 0.6));
  };
  // Native listener (attached when the label mounts in the HTML overlay): the scene's own click handling
  // sits on an ancestor and would otherwise treat this click as a click on empty map and clear the selection.
  const bind = useCallback((el: HTMLButtonElement | null) => {
    if (!el || el.dataset.bound) return;
    el.dataset.bound = '1';
    el.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const cls = ['map-label', s.line === 'T14' ? 'metro' : 'commuter', s.major ? 'major' : 'minor', s.twin ? 'twin' : '', s.boundary ? 'boundary' : '', s.left ? 'left' : ''].join(' ');
  return (
    <Html position={[s.pos.x, 0, s.pos.z]} zIndexRange={[20, 0]}>
      <button ref={bind} type="button" className={cls} id={`map-${s.id}`} tabIndex={s.boundary ? -1 : 0} aria-label={s.twin ? `${s.name}: open the 3D twin` : `${s.name} station`}>
        <span className="dot" aria-hidden="true" />
        <span className="name">{s.name}</span>
        {s.twin && <span className="badge">3D</span>}
      </button>
    </Html>
  );
}

export function StationLabels() {
  return (
    <group>
      {MAP_STATIONS.map((s) => <Label key={`${s.line}-${s.id}`} s={s} />)}
    </group>
  );
}

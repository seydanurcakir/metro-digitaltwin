// Station markers and names on the map (DOM labels pinned to map positions). Clicking a station selects it;
// the two stations with a 3D twin carry a "3D" badge and fly the camera there.
import { useCallback } from 'react';
import { Html } from '@react-three/drei';
import { useTwin } from '../twin/store';
import { ARENA, MAP_STATIONS, type MapStation } from '../twin/world';
import { LANDMARKS } from '../twin/context';
import { CAM } from './cam';

/** Small glyphs for named places (purely visual; context labels are not interactive) */
const ICON: Partial<Record<string, string>> = { hotel: 'H', venue: '◆', retail: '■', poi: '•' };

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

/** Strawberry Arena: opens its panel and frames arena, walkway and station */
function ArenaLabel() {
  const bind = useCallback((el: HTMLButtonElement | null) => {
    if (!el || el.dataset.bound) return;
    el.dataset.bound = '1';
    el.addEventListener('click', (e) => { e.stopPropagation(); useTwin.getState().focusArena(); });
  }, []);
  return (
    <Html position={[ARENA.pos.x, ARENA.h, ARENA.pos.z]} zIndexRange={[20, 0]}>
      <button ref={bind} type="button" className="map-label arena major" id="map-strawberry-arena" aria-label="Strawberry Arena: open the arena twin">
        <span className="dot" aria-hidden="true" />
        <span className="name">Strawberry Arena</span>
        <span className="badge">Event</span>
      </button>
    </Html>
  );
}

export function StationLabels() {
  return (
    <group>
      {MAP_STATIONS.map((s) => <Label key={`${s.line}-${s.id}`} s={s} />)}
      <ArenaLabel />
      {LANDMARKS.map((l) => (
        <Html key={l.id} position={[l.pos.x, 0, l.pos.z]} zIndexRange={[19, 0]}>
          <span className={`map-label context ${l.kind}${l.id === 'mall' ? ' key' : ''}`}>
            {ICON[l.kind] && <span className="ctx-icon" aria-hidden="true">{ICON[l.kind]}</span>}
            <span className="name">{l.name}</span>
          </span>
        </Html>
      ))}
    </group>
  );
}

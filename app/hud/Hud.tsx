// Controls and live readouts over the map. Numbers come from the store and selectors, never typed by hand.
import { useTwin, SPEEDS } from '../twin/store';
import { DATASET, SCENARIOS, UI_PLANS, type ScenarioId } from '../twin/model';
import { fmtClock, fmtDec, fmtInt, fmtSecs, nextArrivals, platformAt } from '../twin/selectors';
import { LINES, TWINS, TWIN_IDS } from '../twin/world';
import { HEAT_STEPS } from '../scene/Crowd';
import { C } from '../scene/palette';
import { Inspector } from './Inspector';
import { Compare, KpiStrip } from './Metrics';
import { NetworkPanel } from './NetworkPanel';

const JUMPS: { label: string; hhmm: string; scenario: ScenarioId }[] = [
  { label: 'Morning peak', hhmm: '07:56', scenario: 'normal' },
  { label: 'Midday', hhmm: '12:28', scenario: 'normal' },
  { label: 'Evening crowd', hhmm: '20:58', scenario: 'surge' },
  { label: 'Match exit', hhmm: '20:48', scenario: 'match' },
];

function Dock() {
  const panel = useTwin((s) => s.panel);
  const setPanel = useTwin.getState().setPanel;
  return (
    <section className="card dock">
      <div className="tabs" role="tablist" aria-label="Panels">
        <button type="button" role="tab" id="tab-inspect" aria-selected={panel === 'inspect'} aria-controls="pane-body" onClick={() => setPanel('inspect')}>Inspect</button>
        <button type="button" role="tab" id="tab-compare" aria-selected={panel === 'compare'} aria-controls="pane-body" onClick={() => setPanel('compare')}>Compare plans</button>
        <button type="button" role="tab" id="tab-network" aria-selected={panel === 'network'} aria-controls="pane-body" onClick={() => setPanel('network')}>Network</button>
      </div>
      <div className="dock-body" id="pane-body" role="tabpanel" aria-labelledby={`tab-${panel}`}>
        {panel === 'inspect' ? <Inspector /> : panel === 'compare' ? <Compare /> : <NetworkPanel />}
      </div>
    </section>
  );
}

function Places() {
  const focus = useTwin((s) => s.focus);
  const { focusTwin, overview, focusArena } = useTwin.getState();
  return (
    <div className="places" role="group" aria-label="Go to">
      {TWIN_IDS.map((id) => (
        <button type="button" key={id} id={`go-${id}`} className={`place ${id === focus ? 'on' : ''}`} onClick={() => focusTwin(id)}>
          <span className={`mini-badge ${TWINS[id].line === 'T14' ? 'metro' : 'commuter'}`} aria-hidden="true">{TWINS[id].signLetter}</span>
          {TWINS[id].name}
        </button>
      ))}
      <button type="button" id="go-arena" className="place" onClick={focusArena}>
        <span className="mini-badge arena" aria-hidden="true">A</span>
        Strawberry Arena
      </button>
      <button type="button" id="go-overview" className="place" onClick={overview}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6 L9 3 L15 6 L21 3 V18 L15 21 L9 18 L3 21 Z M9 3 V18 M15 6 V21" /></svg>
        Corridor map
      </button>
    </div>
  );
}

/** Required credit for the street map data (OpenStreetMap, ODbL) and its tiles (OpenMapTiles via OpenFreeMap) */
function MapCredit() {
  const basemap = useTwin((s) => s.basemap);
  if (basemap === 'off') return null;
  return (
    <p className={`map-credit ${basemap}`} aria-live="polite">
      {basemap === 'unavailable'
        ? 'Street map unavailable here · network drawn on a 500 m grid'
        : <><a href="https://openfreemap.org" target="_blank" rel="noreferrer">OpenFreeMap</a> © <a href="https://www.openmaptiles.org/" target="_blank" rel="noreferrer">OpenMapTiles</a> · Data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors</>}
    </p>
  );
}

export function Hud() {
  const sec = useTwin((s) => Math.floor(s.t));
  const playing = useTwin((s) => s.playing);
  const speed = useTwin((s) => s.speed);
  const planId = useTwin((s) => s.planId);
  const scenario = useTwin((s) => s.scenario);
  const focus = useTwin((s) => s.focus);
  const view = useTwin((s) => s.views[s.focus]);
  const corridor = useTwin((s) => s.corridor);
  const { setPlaying, setSpeed, setPlan, jumpTo } = useTwin.getState();
  const tw = TWINS[focus];
  const line = LINES[tw.line];

  const p = platformAt(view, sec);
  const next = nextArrivals(view, sec);
  const limit = (tw.line === 'T14' ? DATASET : corridor.corridor.ds).constraints.platformDensityLimit.value;
  const over = p.density >= limit;

  return (
    <div className="hud">
      <MapCredit />
      <div className="top-left">
        <section className="card brand" aria-label="Station">
          <div className="brand-row">
            <div className={`line-badge ${tw.line === 'T14' ? 'metro' : 'commuter'}`} aria-hidden="true">{tw.line === 'T14' ? 'T14' : 'J'}</div>
            <div>
              <h1>{tw.name}</h1>
              <p className="muted">{tw.subtitle}</p>
            </div>
          </div>
          <Places />
        </section>
        <KpiStrip />
      </div>

      <div className="right-col">
        <section className="card controls" aria-label="Simulation">
          <div className="clock-row">
            <div className="clock" aria-live="off">{fmtClock(sec)}</div>
            <button type="button" id="play" className="btn primary" onClick={() => setPlaying(!playing)}>
              {playing ? 'Pause' : 'Play'}
            </button>
          </div>
          <div className="row">
            <span className="label">Speed</span>
            <div className="seg" role="group" aria-label="Simulation speed">
              {SPEEDS.map((s) => (
                <button type="button" key={s} id={`speed-${s}`} aria-pressed={speed === s} onClick={() => setSpeed(s)}>{s}×</button>
              ))}
            </div>
          </div>
          <div className="row">
            <span className="label">T14 plan</span>
            <div className="seg" role="group" aria-label="T14 service plan">
              {UI_PLANS.map((pl) => (
                <button type="button" key={pl.id} id={`plan-${pl.id}`} aria-pressed={planId === pl.id} onClick={() => setPlan(pl.id)}>
                  {pl.label}
                </button>
              ))}
            </div>
          </div>
          <div className="row wrap">
            <span className="label">Jump</span>
            {JUMPS.map((j) => (
              <button type="button" key={j.hhmm} id={`jump-${j.hhmm}`} className="chip" onClick={() => { jumpTo(j.hhmm, j.scenario); if (j.scenario === 'match') useTwin.getState().focusArena(); }}>
                {j.label} <span className="num">{j.hhmm}</span>
              </button>
            ))}
          </div>
          <p className="scenario">
            Scenario: <strong>{SCENARIOS[scenario].name}</strong>
            {SCENARIOS[scenario].note && <span className="muted"> · {SCENARIOS[scenario].note}</span>}
          </p>
          <p className="hint">Drag to pan · wheel to zoom · right-drag to rotate · click stations, trains and platforms</p>
        </section>
        <Dock />
      </div>

      <section className="card live" aria-label={`Live platform state, ${tw.name}`}>
        <div className="stat">
          <span className="label">On the platform · {tw.name}</span>
          <span className="big num">{fmtInt(p.total)}</span>
          <span className="muted num">northbound {fmtInt(p.north)} · southbound {fmtInt(p.south)}</span>
        </div>
        <div className="stat">
          <span className="label">Density</span>
          <span className={`big num ${over ? 'warn' : ''}`}>{fmtDec(p.density)}</span>
          <span className="muted num">people/m² · limit {fmtDec(limit)}</span>
        </div>
        <div className="stat">
          <span className="label">Next train</span>
          <span className="num next">↑ {line.dirName.north.split(' · ')[0]} <strong>{next.north == null ? '–' : fmtSecs(next.north)}</strong></span>
          <span className="num next">↓ {line.dirName.south.split(' · ')[0]} <strong>{next.south == null ? '–' : fmtSecs(next.south)}</strong></span>
        </div>
        <div className="legend" aria-label="Legend">
          <div className="legend-row">
            <span className="label">Platform density</span>
            <span className="sw" style={{ background: C.heat.low }} />{HEAT_STEPS[0]}+
            <span className="sw" style={{ background: C.heat.mid }} />{HEAT_STEPS[1]}+
            <span className="sw" style={{ background: C.heat.high }} />{HEAT_STEPS[2]}+ people/m²
          </div>
          <div className="legend-row">
            <span className="label">Train roof: load</span>
            <span className="sw" style={{ background: C.load.ok }} />&lt;75%
            <span className="sw" style={{ background: C.load.busy }} />75%+
            <span className="sw" style={{ background: C.load.full }} />90%+
          </div>
          <div className="legend-row">
            <span className="label">Map</span>
            <span className="sw line" style={{ background: LINES.T14.color }} />T14
            <span className="sw line" style={{ background: LINES.PENDEL.color }} />Commuter rail
            <span className="sw line dashed" />Walking transfer
          </div>
        </div>
      </section>
    </div>
  );
}

// App state (Zustand): time, playback, plan, scenario, focused station, selection and camera commands.
import { create } from 'zustand';
import { hhmmToSec, type Direction, type SimOptions, type SimResult, type TwinDataset } from '../../src/index';
import { SERVICE_END_MIN } from '../../src/data/time';
import { DATASET, SCENARIOS, getResult, type ScenarioId } from './model';
import { getCorridor, type CorridorView } from './network';
import { buildStationView, type StationView } from './selectors';
import { ARENA_VIEW, OVERVIEW, TWINS, type LineKey, type TwinId } from './world';
import type { Scope, WindowId } from './metrics';

export const SPEEDS = [1, 10, 30, 60] as const;
export type Speed = (typeof SPEEDS)[number];

/** Objects that can be clicked and inspected */
export type Selection =
  | { kind: 'train'; line: LineKey; tripId: number }
  | { kind: 'platform'; twin: TwinId; direction: Direction }
  | { kind: 'escalator'; twin: TwinId; index: number }
  | { kind: 'station'; line: LineKey; stationId: string }
  | { kind: 'arena' }
  | null;

/** A request to move the camera; Scene animates towards it */
export interface CameraCommand {
  seq: number;
  x: number;
  z: number;
  zoom: number;
  azimuth?: number;
  /** Camera tilt from vertical (radians) */
  polar?: number;
}

export type PanelId = 'inspect' | 'compare' | 'network';

export interface LineData {
  ds: TwinDataset;
  result: SimResult;
  opts: SimOptions;
}

interface TwinState {
  t: number;
  playing: boolean;
  speed: Speed;
  planId: string;
  scenario: ScenarioId;
  /** T14 simulation for the selected plan and scenario */
  result: SimResult;
  /** Commuter corridor simulation (depends on the T14 plan through transfers) */
  corridor: CorridorView;
  views: Record<TwinId, StationView>;
  /** Station twin whose numbers the HUD shows */
  focus: TwinId;
  selection: Selection;
  hover: boolean;
  follow: { line: LineKey; tripId: number } | null;
  camera: CameraCommand | null;
  compareWindow: WindowId;
  compareScope: Scope;
  panel: PanelId;
  tick: (dtReal: number) => void;
  setPlaying: (p: boolean) => void;
  setSpeed: (s: Speed) => void;
  setPlan: (id: string) => void;
  jumpTo: (hhmm: string, scenario?: ScenarioId) => void;
  /** Switch scenario at the current time */
  setScenario: (scenario: ScenarioId) => void;
  select: (s: Selection) => void;
  setHover: (h: boolean) => void;
  focusTwin: (id: TwinId, fly?: boolean) => void;
  flyTo: (x: number, z: number, zoom: number, azimuth?: number, polar?: number) => void;
  overview: () => void;
  /** Show Strawberry Arena, its walkway and Solna station */
  focusArena: () => void;
  setFollow: (f: { line: LineKey; tripId: number } | null) => void;
  setCompare: (p: { window?: WindowId; scope?: Scope }) => void;
  setPanel: (p: PanelId) => void;
}

const END = SERVICE_END_MIN * 60;
export const TWIN_ZOOM = 4.2;
export const TWIN_POLAR = 0.94;

function build(planId: string, scenario: ScenarioId) {
  const result = getResult(planId, scenario);
  const corridor = getCorridor(planId, scenario);
  const views: Record<TwinId, StationView> = {
    tc: buildStationView(DATASET, result, TWINS.tc.stationId, SCENARIOS[scenario].options),
    solna: buildStationView(corridor.corridor.ds, corridor.result, TWINS.solna.stationId, corridor.opts),
  };
  return { result, corridor, views };
}

/** Dataset, result and options of one line in the current state */
export function lineData(s: Pick<TwinState, 'result' | 'corridor' | 'scenario'>, line: LineKey): LineData {
  return line === 'T14'
    ? { ds: DATASET, result: s.result, opts: SCENARIOS[s.scenario].options }
    : { ds: s.corridor.corridor.ds, result: s.corridor.result, opts: s.corridor.opts };
}

/** Hook form of lineData that only re-renders when the underlying results change */
export function useLineData(line: LineKey): LineData {
  const result = useTwin((s) => s.result);
  const corridor = useTwin((s) => s.corridor);
  const scenario = useTwin((s) => s.scenario);
  return lineData({ result, corridor, scenario }, line);
}

let seq = 0;
const initial = build('current', 'normal');

export const useTwin = create<TwinState>((set, get) => ({
  t: hhmmToSec('07:57'),
  playing: true,
  speed: 10,
  planId: 'current',
  scenario: 'normal',
  ...initial,
  focus: 'tc',
  selection: null,
  hover: false,
  follow: null,
  camera: null,
  compareWindow: 'day',
  compareScope: 'station',
  panel: 'inspect',
  tick: (dt) => {
    const { t, playing, speed } = get();
    if (!playing) return;
    const nt = Math.min(END, t + dt * speed);
    set({ t: nt, playing: nt < END });
  },
  setPlaying: (playing) => set({ playing }),
  setSpeed: (speed) => set({ speed }),
  setPlan: (planId) => {
    // Trip numbers change with the T14 plan; the corridor timetable itself is fixed.
    const sel = get().selection;
    const fol = get().follow;
    set({
      planId, ...build(planId, get().scenario),
      selection: sel?.kind === 'train' && sel.line === 'T14' ? null : sel,
      follow: fol?.line === 'T14' ? null : fol,
    });
  },
  setScenario: (sc) => {
    if (sc === get().scenario) return;
    const sel = get().selection;
    set({ scenario: sc, ...build(get().planId, sc), selection: sel?.kind === 'train' ? null : sel, follow: null });
  },
  jumpTo: (hhmm, scenario) => {
    const sc = scenario ?? get().scenario;
    const sel = get().selection;
    set({ t: hhmmToSec(hhmm), scenario: sc, ...build(get().planId, sc), selection: sel?.kind === 'train' ? null : sel, follow: null });
  },
  select: (selection) => set(selection ? { selection, panel: 'inspect' } : { selection }),
  setHover: (hover) => {
    if (get().hover !== hover) {
      document.body.style.cursor = hover ? 'pointer' : '';
      set({ hover });
    }
  },
  focusTwin: (id, fly = true) => {
    if (get().focus !== id) set({ focus: id });
    if (fly) {
      const tw = TWINS[id];
      set({ follow: null, camera: { seq: ++seq, x: tw.pos.x, z: tw.pos.z, zoom: TWIN_ZOOM, azimuth: tw.viewAzimuth, polar: TWIN_POLAR } });
    }
  },
  flyTo: (x, z, zoom, azimuth, polar) => set({ camera: { seq: ++seq, x, z, zoom, azimuth, polar } }),
  focusArena: () => {
    if (get().focus !== 'solna') set({ focus: 'solna' });
    // On wide screens shift the view right so the scene sits beside the right-hand panels
    const wide = typeof window !== 'undefined' && window.innerWidth >= 1280;
    const k = wide ? 196 / ARENA_VIEW.zoom : 0;
    const x = ARENA_VIEW.x + Math.cos(ARENA_VIEW.azimuth) * k, z = ARENA_VIEW.z - Math.sin(ARENA_VIEW.azimuth) * k;
    set({ follow: null, selection: { kind: 'arena' }, panel: 'inspect', camera: { seq: ++seq, x, z, zoom: ARENA_VIEW.zoom, azimuth: ARENA_VIEW.azimuth, polar: 0.8 } });
  },
  overview: () => {
    // North up, nearly top-down; shift east so the corridor sits in the area not covered by the right-hand panels
    const wide = typeof window !== 'undefined' && window.innerWidth >= 1280;
    const shift = wide ? 196 / OVERVIEW.zoom : 0;
    set({ follow: null, camera: { seq: ++seq, x: OVERVIEW.x + shift, z: OVERVIEW.z, zoom: OVERVIEW.zoom, azimuth: 0, polar: 0.38 } });
  },
  setFollow: (follow) => set({ follow }),
  setPanel: (panel) => set({ panel }),
  setCompare: ({ window, scope }) => set({ compareWindow: window ?? get().compareWindow, compareScope: scope ?? get().compareScope }),
}));

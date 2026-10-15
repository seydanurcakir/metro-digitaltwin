// Uygulama durumu (Zustand). Zaman, oynatma, plan, senaryo ve seçili nesne burada.
import { create } from 'zustand';
import { hhmmToSec, type Direction, type SimResult } from '../../src/index';
import { SERVICE_END_MIN } from '../../src/data/time';
import { DATASET, FOCUS_STATION_ID, SCENARIOS, getResult, type ScenarioId } from './model';
import { buildStationView, type StationView } from './selectors';
import { buildLayout, type StationLayout } from './layout';

export const SPEEDS = [1, 10, 30, 60] as const;
export type Speed = (typeof SPEEDS)[number];

const station = DATASET.line.stations.find((s) => s.id === FOCUS_STATION_ID)!;
export const LAYOUT: StationLayout = buildLayout(DATASET, station);
export const STATION = station;

/** Sahnede tıklanıp incelenebilen nesneler */
export type Selection =
  | { kind: 'train'; tripId: number }
  | { kind: 'platform'; direction: Direction }
  | { kind: 'escalator'; index: number }
  | { kind: 'station' }
  | null;

const makeView = (r: SimResult, scenario: ScenarioId): StationView =>
  buildStationView(DATASET, r, FOCUS_STATION_ID, SCENARIOS[scenario].options);

interface TwinState {
  t: number;
  playing: boolean;
  speed: Speed;
  planId: string;
  scenario: ScenarioId;
  result: SimResult;
  view: StationView;
  selection: Selection;
  hover: boolean;
  tick: (dtReal: number) => void;
  setPlaying: (p: boolean) => void;
  setSpeed: (s: Speed) => void;
  setPlan: (id: string) => void;
  jumpTo: (hhmm: string, scenario?: ScenarioId) => void;
  select: (s: Selection) => void;
  setHover: (h: boolean) => void;
}

const END = SERVICE_END_MIN * 60;
const initial = getResult('current', 'normal');

export const useTwin = create<TwinState>((set, get) => ({
  t: hhmmToSec('07:57'),
  playing: true,
  speed: 10,
  planId: 'current',
  scenario: 'normal',
  result: initial,
  view: makeView(initial, 'normal'),
  selection: null,
  hover: false,
  tick: (dt) => {
    const { t, playing, speed } = get();
    if (!playing) return;
    const nt = Math.min(END, t + dt * speed);
    set({ t: nt, playing: nt < END });
  },
  setPlaying: (playing) => set({ playing }),
  setSpeed: (speed) => set({ speed }),
  setPlan: (planId) => {
    const r = getResult(planId, get().scenario);
    // Plan değişince sefer numaraları değişir; seçili tren seçimini kaldır.
    const sel = get().selection;
    set({ planId, result: r, view: makeView(r, get().scenario), selection: sel?.kind === 'train' ? null : sel });
  },
  jumpTo: (hhmm, scenario) => {
    const sc = scenario ?? get().scenario;
    const r = getResult(get().planId, sc);
    const sel = get().selection;
    set({ t: hhmmToSec(hhmm), scenario: sc, result: r, view: makeView(r, sc), selection: sel?.kind === 'train' ? null : sel });
  },
  select: (selection) => set({ selection }),
  setHover: (hover) => {
    if (get().hover !== hover) {
      document.body.style.cursor = hover ? 'pointer' : '';
      set({ hover });
    }
  },
}));

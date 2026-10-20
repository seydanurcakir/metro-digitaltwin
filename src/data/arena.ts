// Strawberry Arena (Nationalarenan), Solna: an event venue next to Solna station, modelled as a secondary
// twin node. Scenario 2 (event crowd management): after an event, rail-bound visitors walk to Solna station
// and arrive on the commuter platforms as a surge.
//
// Scope: egress after the event only. Fans arriving by train before kick-off and the Mall of Scandinavia
// are not modelled in this step.

import type { Sourced } from '../types';
import type { LatLon } from '../geo/projection';

const pub = <T,>(v: T, ref: string, note?: string): Sourced<T> => ({ value: v, src: { kind: 'published', ref, note } });
const assume = <T,>(v: T, note: string): Sourced<T> => ({ value: v, src: { kind: 'assumption', ref: 'assumption', note } });
const derived = <T,>(v: T, ref: string, note: string): Sourced<T> => ({ value: v, src: { kind: 'derived', ref, note } });

export interface Arena {
  id: string;
  name: string;
  geo: Sourced<LatLon>;
  capacity: { football: Sourced<number>; concert: Sourced<number> };
  pitch: { lengthM: Sourced<number>; widthM: Sourced<number> };
  /** Outer footprint of the building (ellipse) and roof height */
  footprint: { lengthM: Sourced<number>; widthM: Sourced<number>; heightM: Sourced<number> };
  /** Compass bearing of the pitch's long axis */
  axisBearingDeg: Sourced<number>;
  walkway: {
    lengthM: Sourced<number>;
    /** Effective width of the pedestrian route to the station */
    widthM: Sourced<number>;
    /** Pedestrian flow per metre of width per minute */
    flowPerMetrePerMin: Sourced<number>;
    /** Walking speed in a dense crowd */
    speedMs: Sourced<number>;
  };
  /** Share of visitors who leave by commuter rail from Solna station */
  railShare: Sourced<number>;
  /** Share of those who travel south (towards Stockholm City) */
  southShare: Sourced<number>;
  /** 90% of visitors have left the arena this many minutes after the end */
  egressP90Min: Sourced<number>;
}

export const STRAWBERRY_ARENA: Arena = {
  id: 'strawberry-arena',
  name: 'Strawberry Arena',
  geo: pub({ lat: 59.3725, lon: 18.0 }, 'wiki-strawberry', 'Infobox coordinates (Nationalarenan).'),
  capacity: {
    football: pub(50_000, 'wiki-strawberry', 'Football capacity.'),
    concert: pub(65_000, 'wiki-strawberry', 'Concert capacity.'),
  },
  pitch: { lengthM: pub(105, 'wiki-strawberry'), widthM: pub(68, 'wiki-strawberry') },
  footprint: {
    lengthM: assume(280, 'Approximate outer length of the bowl; not published.'),
    widthM: assume(230, 'Approximate outer width of the bowl; not published.'),
    heightM: assume(60, 'Approximate roof height; not published.'),
  },
  axisBearingDeg: assume(340, 'Pitch orientation estimated (roughly north–south); not sourced.'),
  walkway: {
    lengthM: derived(700, 'wiki-strawberry', 'Wikipedia: Solna station is about 700 m on foot from the arena.'),
    widthM: assume(8, 'Effective width of the route through Arenastaden to the station entrance.'),
    flowPerMetrePerMin: assume(45, 'Dense but moving crowd (pedestrian level of service D).'),
    speedMs: assume(1.0, 'Walking speed in a dense event crowd.'),
  },
  railShare: assume(0.3, 'Share of visitors leaving by commuter rail from Solna; others use metro, tram, bus, car or walk.'),
  southShare: assume(0.8, 'Most visitors head towards central Stockholm.'),
  egressP90Min: assume(25, '90% of visitors leave the bowl within 25 minutes of the final whistle.'),
};

export type EventKind = 'football' | 'concert';

export interface ArenaEvent {
  id: string;
  title: string;
  kind: EventKind;
  /** Display date (the simulated day is a generic weekday) */
  day: string;
  gatesOpen: string;
  start: string;
  end: string;
  attendance: Sourced<number>;
  /** The event the match-day scenario simulates */
  simulated: boolean;
}

/** Illustrative schedule. Not real fixtures; used to drive and explain the match-day scenario. */
export const ARENA_EVENTS: ArenaEvent[] = [
  {
    id: 'match-today', title: 'League match (illustrative)', kind: 'football', day: 'Today', gatesOpen: '17:30', start: '19:00', end: '20:50',
    attendance: assume(42_000, 'Illustrative attendance for a large league match (84% of football capacity).'), simulated: true,
  },
  {
    id: 'concert-sat', title: 'Stadium concert (illustrative)', kind: 'concert', day: 'Saturday', gatesOpen: '16:00', start: '19:30', end: '22:30',
    attendance: assume(60_000, 'Illustrative attendance for a sold-out concert.'), simulated: false,
  },
  {
    id: 'match-next', title: 'Cup match (illustrative)', kind: 'football', day: 'Next Wednesday', gatesOpen: '17:00', start: '18:30', end: '20:20',
    attendance: assume(28_000, 'Illustrative attendance.'), simulated: false,
  },
];

export const SIMULATED_EVENT = ARENA_EVENTS.find((e) => e.simulated)!;

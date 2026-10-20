// Commuter rail corridor: Stockholm City – Stockholm Odenplan – Solna – Ulriksdal (lines J40, J41, J42X).
// Solna station is the main node of this corridor. At both ends virtual boundary nodes represent passengers
// coming from and going beyond the corridor; they are excluded from metrics.
//
// Scope: core transport operations only. Attractions around the station (mall, stadium) and
// event-driven crowding are not modelled at this stage.

import type { Constraints, Fleet, Line, OtherLineService, Platform, PlanSlot, ServicePlan, Sourced, Station } from '../types';
import { SLOTS } from './time';
import type { Bias } from './demand';

const assume = <T,>(v: T, note: string): Sourced<T> => ({ value: v, src: { kind: 'assumption', ref: 'assumption', note } });
const pub = <T,>(v: T, ref: string, note?: string): Sourced<T> => ({ value: v, src: { kind: 'published', ref, note } });
const derived = <T,>(v: T, ref: string, note: string): Sourced<T> => ({ value: v, src: { kind: 'derived', ref, note } });

const platform = (areaM2: number, lengthM: number, note: string): Platform => ({
  usableAreaM2: assume(areaM2, note),
  areaShareByDirection: assume(0.5, 'On an island platform both directions share the area equally.'),
  lengthM: assume(lengthM, 'Long enough for a two-unit X60 (214 m).'),
});

const BOUNDARY_NOTE =
  'Passenger flow from beyond the corridor (calibration assumption). Commuter rail total 342,000/day; corridor lines ~half; the share crossing the boundary was estimated after removing the corridor stations.';

type Row = {
  id: string;
  name: string;
  boardings: Sourced<number>;
  share: Sourced<number>;
  dwell: Sourced<number>;
  platform: Platform;
  boundary?: boolean;
  trunk?: boolean;
};

const ROWS: Row[] = [
  {
    id: 'boundary-south', name: 'South boundary (towards Stockholms södra)', boundary: true,
    boardings: assume(45_000, BOUNDARY_NOTE), share: assume(1, 'Virtual node.'), dwell: assume(0, 'Virtual node.'),
    platform: platform(100_000, 214, 'Virtual node: no capacity constraint.'),
  },
  {
    id: 'stockholm-city', name: 'Stockholm City', trunk: true,
    boardings: pub(54_800, 'sl-fakta-2022', 'Commuter rail, winter weekday; automatic counts.'),
    share: assume(0.5, 'Share of City boardings using J40/J41/J42X trains; they share Citybanan with J43/J43X/J44.'),
    dwell: assume(60, 'Central station with platform screen doors; long dwell.'),
    platform: platform(2_600, 250, 'Island platform with screen doors; estimated waiting area.'),
  },
  {
    id: 'stockholm-odenplan', name: 'Stockholm Odenplan', trunk: true,
    boardings: pub(34_800, 'sl-fakta-2022', 'Commuter rail, winter weekday; automatic counts.'),
    share: assume(0.5, 'After Odenplan J40/J41/J42X continue to Solna and J43/J44 to Sundbyberg.'),
    dwell: assume(45, 'Standard commuter rail dwell.'),
    platform: platform(2_000, 250, 'Island platform; estimated waiting area.'),
  },
  {
    id: 'solna', name: 'Solna station',
    boardings: pub(16_000, 'sl-fakta-2022', 'Commuter rail, winter weekday; automatic counts. (2019: 20,900, wiki-solna)'),
    share: derived(1, 'wiki-solna', 'Only J40, J41 and 42X call at Solna.'),
    dwell: assume(45, 'Standard commuter rail dwell.'),
    platform: platform(1_600, 225, 'Single island platform (wiki-solna); ~225 m × ~7 m usable width.'),
  },
  {
    id: 'ulriksdal', name: 'Ulriksdal',
    boardings: pub(4_300, 'sl-fakta-2022', 'Commuter rail, winter weekday.'),
    share: derived(1, 'wiki-solna', 'Only J40, J41 and 42X run between Solna and Ulriksdal.'),
    dwell: assume(40, 'Small station.'),
    platform: platform(1_200, 225, 'Island platform; estimated waiting area.'),
  },
  {
    id: 'boundary-north', name: 'North boundary (towards Märsta / Uppsala)', boundary: true,
    boardings: assume(35_000, BOUNDARY_NOTE), share: assume(1, 'Virtual node.'), dwell: assume(0, 'Virtual node.'),
    platform: platform(100_000, 214, 'Virtual node: no capacity constraint.'),
  },
];

const stations: Station[] = ROWS.map((r, order) => ({
  id: r.id,
  name: r.name,
  order,
  isTerminal: order === 0 || order === ROWS.length - 1,
  isBoundary: !!r.boundary,
  servedBy: r.trunk ? ['J40', 'J41', 'J42X', 'J43', 'J43X', 'J44'] : ['J40', 'J41', 'J42X'],
  onTrunk: !!r.trunk,
  boardingsPerDay: r.boardings,
  lineShare: r.share,
  dwellSec: r.dwell,
  platform: r.platform,
}));

// Section running times (s). City → Solna totals 7 min (solna-stad): 150 + 45 (Odenplan dwell) + 225.
const RUN: [number, Sourced<number>][] = [
  [0, assume(180, 'Virtual: south boundary to City.')],
  [1, derived(150, 'solna-stad', 'City → Solna 7 min; City–Odenplan part estimated.')],
  [2, derived(225, 'solna-stad', 'City → Solna 7 min minus City–Odenplan and the Odenplan dwell.')],
  [3, assume(240, 'Solna → Ulriksdal estimate; to be checked against Trafiklab GTFS.')],
  [4, assume(180, 'Virtual: Ulriksdal to the north boundary.')],
];

export const CORRIDOR_SOLNA: Line = {
  id: 'J41',
  lineIds: ['J40', 'J41', 'J42X'],
  mode: 'commuter',
  name: 'Commuter rail J40/J41/J42X · Stockholm City – Solna – Ulriksdal',
  color: '#E8618C',
  stations,
  segments: RUN.map(([i, t]) => ({ from: stations[i].id, to: stations[i + 1].id, runTimeSec: t })),
  turnaroundSec: assume(300, 'Virtual ends; used for fleet checks.'),
  trunk: {
    fromStationId: 'stockholm-city',
    toStationId: 'stockholm-odenplan',
    maxTrainsPerHour: pub(16, 'wiki-citybanan', 'Citybanan carries 24 trains/h per direction, at most 16 of them commuter trains.'),
  },
};

export const FLEET_X60: Fleet = {
  unitType: {
    id: 'X60',
    seats: pub(374, 'wiki-x60', 'Taken per unit (the source is ambiguous).'),
    standing: pub(530, 'wiki-x60', 'Taken per unit (the source is ambiguous).'),
    lengthM: pub(107.1, 'wiki-x60'),
  },
  allowedUnitsPerTrain: pub([1, 2], 'wiki-x60', 'Single unit or two units (214 m).'),
  unitsAvailable: assume(40, 'Estimated units allocated to the corridor lines.'),
};

export const CORRIDOR_CONSTRAINTS: Constraints = {
  minHeadwayMin: derived(2.5, 'wiki-citybanan', 'Citybanan 24 trains/h → 2.5 min signalling headway (ATC-2).'),
  maxHeadwayMin: assume(15, 'Early morning and late evening headway.'),
  maxLoadFactor: assume(0.9, 'Product rule: load ≤ 90%.'),
  platformDensityLimit: assume(2.0, 'Safe platform density threshold (people/m²).'),
};

/** Directional bias of the corridor: towards the centre (City) in the morning, outwards in the evening. Weaker than T14 because Solna is itself an employment centre. */
export const CORRIDOR_BIAS: Sourced<Bias> = assume(
  { am: 1.0, pm: 0.7, centerStationId: 'stockholm-city' },
  'Morning destinations towards City ×2, evening outwards ×1.7. Kept weaker than T14 because of reverse commuting to Solna.',
);

const toMin = (s: string) => {
  const [h, m] = s.split(':').map(Number);
  const v = h * 60 + m;
  return v < 300 ? v + 1440 : v;
};
type Band = { from: string; to: string; headwayMin: number; unitsPerTrain: number };
const fromBands = (bands: Band[]): PlanSlot[] =>
  SLOTS.map((s) => {
    const b = bands.find((x) => s.startMin >= toMin(x.from) && s.startMin < toMin(x.to));
    if (!b) throw new Error(`Corridor plan does not cover slot ${s.label}`);
    return { slotIndex: s.index, headwayMin: b.headwayMin, unitsPerTrain: b.unitsPerTrain };
  });

const inPeak = (startMin: number) => (startMin >= toMin('06:30') && startMin < toMin('09:00')) || (startMin >= toMin('15:30') && startMin < toMin('18:30'));

export const CORRIDOR_PLAN: ServicePlan = {
  id: 'corridor-current',
  name: 'Commuter rail current timetable (Solna)',
  kind: 'current',
  slots: fromBands([
    { from: '05:00', to: '06:00', headwayMin: 15, unitsPerTrain: 1 },
    { from: '06:00', to: '06:30', headwayMin: 10, unitsPerTrain: 2 },
    { from: '06:30', to: '09:00', headwayMin: 7.5, unitsPerTrain: 2 },
    { from: '09:00', to: '15:30', headwayMin: 10, unitsPerTrain: 2 },
    { from: '15:30', to: '18:30', headwayMin: 7.5, unitsPerTrain: 2 },
    { from: '18:30', to: '21:00', headwayMin: 10, unitsPerTrain: 2 },
    { from: '21:00', to: '01:00', headwayMin: 15, unitsPerTrain: 1 },
  ]),
  src: {
    kind: 'derived',
    ref: 'wiki-pendeltag',
    note: 'Daytime J41 every 15 min + J40 every 30 min ≈ 10 min; about 7.5 min in the peak with extra trains; early/late two lines every 30 min ≈ 15 min. Hour boundaries and unit counts are assumptions.',
  },
};

/** Other commuter lines sharing Citybanan (J43, J43X, J44): 8 trains/h in the peak, 6 daytime, 4 otherwise */
export const CITYBANAN_OTHER: OtherLineService = {
  lineId: 'J43',
  trainsPerHourBySlot: SLOTS.map((s) => (inPeak(s.startMin) ? 8 : s.startMin >= toMin('06:00') && s.startMin < toMin('21:00') ? 6 : 4)),
  src: {
    kind: 'derived',
    ref: 'wiki-citybanan',
    note: 'Citybanan commuter capacity is 16 trains/h; in the peak the corridor lines use 8, the remaining 8 are assumed for the other lines.',
  },
};

/** Transfer: walking link T-Centralen ↔ Stockholm City */
export const TRANSFER_TC_CITY = {
  walkSec: assume(300, 'Escalator passage between T-Centralen and Stockholm City; about 5 min on average (estimate).'),
  capacityPaxPerHour: assume(8_000, 'Estimated escalator and passage capacity per direction.'),
  /** Share of T14 passengers alighting at T-Centralen who transfer to commuter rail */
  metroToCommuterShare: assume(0.2, '20% of T14 passengers alighting at T-Centralen transfer to commuter rail.'),
  /** How transferring passengers split over the corridor lines (J40/J41/J42X) and directions */
  corridorShareByDirection: assume({ north: 0.25, south: 0.25 }, 'Half of the transferring passengers go north, half south; in each direction half of the trains are corridor lines.'),
};

/**
 * Event service for the match-day scenario: extra commuter trains through Solna after the event,
 * every 6 minutes with two units from 20:30 to 22:30. 10 corridor trains/h + up to 6 on the other lines
 * stays within Citybanan's 16 commuter trains/h.
 */
export const CORRIDOR_EVENT_PLAN: ServicePlan = {
  id: 'corridor-event',
  name: 'Commuter rail with event extra trains (Solna)',
  kind: 'candidate',
  slots: CORRIDOR_PLAN.slots.map((s) => {
    const m = SLOTS[s.slotIndex].startMin;
    return m >= toMin('20:30') && m < toMin('22:30') ? { ...s, headwayMin: 6, unitsPerTrain: 2 } : s;
  }),
  src: { kind: 'assumption', ref: 'assumption', note: 'Illustrative event service: every 6 min with long trains from 20:30 to 22:30.' },
};

import type { Constraints, OtherLineService, PlanSlot, ServicePlan } from '../types';
import { SLOTS, SLOT_MINUTES } from './time';

const inRange = (startMin: number, from: string, to: string) => {
  const toMin = (s: string) => {
    const [h, m] = s.split(':').map(Number);
    const v = h * 60 + m;
    return v < 300 ? v + 1440 : v;
  };
  return startMin >= toMin(from) && startMin < toMin(to);
};

type Band = { from: string; to: string; headwayMin: number; unitsPerTrain: number };

const fromBands = (bands: Band[]): PlanSlot[] =>
  SLOTS.map((s) => {
    const b = bands.find((x) => inRange(s.startMin, x.from, x.to));
    if (!b) throw new Error(`Plan does not cover slot ${s.label}`);
    return { slotIndex: s.index, headwayMin: b.headwayMin, unitsPerTrain: b.unitsPerTrain };
  });

/** Simplified current timetable (one headway along the whole line) */
export const CURRENT_PLAN: ServicePlan = {
  id: 'current',
  name: 'Current timetable',
  kind: 'current',
  slots: fromBands([
    { from: '05:00', to: '06:00', headwayMin: 10, unitsPerTrain: 2 },
    { from: '06:00', to: '19:00', headwayMin: 5, unitsPerTrain: 3 },
    { from: '19:00', to: '01:00', headwayMin: 10, unitsPerTrain: 2 },
  ]),
  src: {
    kind: 'derived',
    ref: 'wiki-red-line',
    note: 'Headways from the source (5 min daytime/peak, 10 min otherwise). Hour boundaries and unit counts are assumptions. In reality the daytime 5-min service only runs Mörby c.–Liljeholmen; the model applies it to the whole line.',
  },
};

/** Hand-written sample plan for testing the simulation. NOT optimised. */
export const SAMPLE_CANDIDATE: ServicePlan = {
  id: 'sample-candidate',
  name: 'Trial plan (sample)',
  kind: 'candidate',
  slots: fromBands([
    { from: '05:00', to: '06:00', headwayMin: 10, unitsPerTrain: 2 },
    { from: '06:00', to: '06:30', headwayMin: 7.5, unitsPerTrain: 3 },
    { from: '06:30', to: '09:30', headwayMin: 5, unitsPerTrain: 3 },
    { from: '09:30', to: '15:00', headwayMin: 7.5, unitsPerTrain: 2 },
    { from: '15:00', to: '18:30', headwayMin: 5, unitsPerTrain: 3 },
    { from: '18:30', to: '21:00', headwayMin: 7.5, unitsPerTrain: 2 },
    { from: '21:00', to: '01:00', headwayMin: 10, unitsPerTrain: 2 },
  ]),
  src: { kind: 'assumption', ref: 'assumption', note: 'For exercising the simulation engine. Not optimised.' },
};

/** T13 traffic on the shared trunk: 12 trains/h peak and daytime, 6 otherwise */
export const T13_ON_TRUNK: OtherLineService = {
  lineId: 'T13',
  trainsPerHourBySlot: SLOTS.map((s) => (inRange(s.startMin, '06:00', '19:00') ? 12 : 6)),
  src: {
    kind: 'derived',
    ref: 'wiki-red-line',
    note: '24 trains/h on the trunk in the peak; T14 every 5 min (12 trains) → T13 taken as 12 trains too.',
  },
};

export const CONSTRAINTS: Constraints = {
  minHeadwayMin: {
    value: 2.5,
    src: { kind: 'derived', ref: 'wiki-red-line', note: 'Signalling capacity of the trunk (24 trains/h). The effective limit depends on T13 traffic.' },
  },
  maxHeadwayMin: { value: 10, src: { kind: 'assumption', ref: 'assumption', note: 'Upper bound for service quality.' } },
  maxLoadFactor: { value: 0.9, src: { kind: 'assumption', ref: 'assumption', note: 'Product rule: train load does not exceed 90% of capacity.' } },
  platformDensityLimit: {
    value: 2.0,
    src: { kind: 'assumption', ref: 'assumption', note: 'Safe platform density threshold (people/m²); to be confirmed against pedestrian level-of-service standards.' },
  },
};

export { SLOT_MINUTES };

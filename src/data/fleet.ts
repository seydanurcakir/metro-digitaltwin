import type { Fleet } from '../types';

export const FLEET: Fleet = {
  unitType: {
    id: 'C20',
    seats: { value: 126, src: { kind: 'published', ref: 'wiki-c20' } },
    standing: { value: 288, src: { kind: 'published', ref: 'wiki-c20' } },
    lengthM: { value: 46.5, src: { kind: 'published', ref: 'wiki-c20' } },
  },
  allowedUnitsPerTrain: {
    value: [2, 3],
    src: { kind: 'published', ref: 'wiki-c20', note: 'Trains run as 2 (short) or 3 (long) units.' },
  },
  unitsAvailable: {
    value: 54,
    src: { kind: 'assumption', ref: 'assumption', note: '18 long trains. To be replaced with the operator’s T14 fleet allocation.' },
  },
};

/** Total capacity of one unit (seated + standing) */
export const unitCapacity = (f: Fleet = FLEET): number => f.unitType.seats.value + f.unitType.standing.value;

/** Capacity of a train */
export const trainCapacity = (units: number, f: Fleet = FLEET): number => units * unitCapacity(f);

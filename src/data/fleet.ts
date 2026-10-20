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
    src: { kind: 'published', ref: 'wiki-c20', note: 'Trenler 2 (kısa) veya 3 (uzun) üniteden oluşur.' },
  },
  unitsAvailable: {
    value: 54,
    src: { kind: 'assumption', ref: 'assumption', note: '18 uzun tren. İşletmecinin T14 filo tahsisiyle değiştirilmeli.' },
  },
};

/** Bir ünitenin toplam kapasitesi (oturma + ayakta) */
export const unitCapacity = (f: Fleet = FLEET): number => f.unitType.seats.value + f.unitType.standing.value;

/** Bir trenin kapasitesi */
export const trainCapacity = (units: number, f: Fleet = FLEET): number => units * unitCapacity(f);

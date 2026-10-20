// Integration of T14 with the commuter rail corridor.
// Some passengers alighting at T-Centralen in the T14 simulation walk to the Stockholm City platforms.
// Stockholm City's published boardings already include transfers, so the transfer flow is subtracted from
// the walk-in demand: the station's daily total is kept and only its timing is tied to T14.

import type { Direction, SimResult, Surge, TwinDataset } from '../index';
import { buildWeekdayProfile } from '../data/time';
import { buildDemand, dailyLineBoardings } from '../data/demand';
import { SOURCES } from '../data/sources';
import {
  CITYBANAN_OTHER, CORRIDOR_BIAS, CORRIDOR_CONSTRAINTS, CORRIDOR_PLAN, CORRIDOR_SOLNA, FLEET_X60, TRANSFER_TC_CITY,
} from '../data/corridor-solna';
import { buildNetwork, type Network, type Signalling } from './network';

export const TC_ID = 't-centralen';
export const CITY_ID = 'stockholm-city';
export const SOLNA_ID = 'solna';

export interface TransferStream {
  surges: Surge[];
  /** Daily transferring passengers (to corridor trains, both directions) */
  daily: Record<Direction, number>;
}

/** Flow from T14 passengers alighting at T-Centralen to the Stockholm City corridor platforms */
export function transferStream(t14: TwinDataset, t14Result: SimResult): TransferStream {
  const walk = TRANSFER_TC_CITY.walkSec.value;
  const share = TRANSFER_TC_CITY.metroToCommuterShare.value;
  const byDir = TRANSFER_TC_CITY.corridorShareByDirection.value;
  const tcOrder = t14.line.stations.find((s) => s.id === TC_ID)!.order;
  const surges: Surge[] = [];
  const daily: Record<Direction, number> = { north: 0, south: 0 };
  for (const e of t14Result.events) {
    if (e.stationOrder !== tcOrder || e.alighted <= 0) continue;
    for (const dir of ['north', 'south'] as Direction[]) {
      const n = e.alighted * share * byDir[dir];
      if (n <= 0) continue;
      // Alighting passengers leave the platform within 60 s, then walk
      surges.push({ stationId: 'stockholm-city', direction: dir, startSec: e.t + walk, endSec: e.t + walk + 60, passengers: n });
      daily[dir] += n;
    }
  }
  return { surges, daily };
}

export interface Corridor {
  ds: TwinDataset;
  transfer: TransferStream;
}

/**
 * Dataset of the Solna corridor. `referenceTransfer`: daily transfer to subtract from City demand
 * (computed with the current timetable, so changing the T14 plan changes the timing, not the total).
 */
export function buildCorridor(t14: TwinDataset, t14Result: SimResult, referenceTransfer?: TransferStream): Corridor {
  const transfer = transferStream(t14, t14Result);
  const ref = referenceTransfer ?? transfer;
  const line = CORRIDOR_SOLNA;
  const daily = dailyLineBoardings(line);
  const cityWalkIn = Math.max(0, daily[CITY_ID] - ref.daily.north - ref.daily.south);
  const profile = buildWeekdayProfile();
  const ds: TwinDataset = {
    line,
    fleet: FLEET_X60,
    demand: buildDemand(line, profile, CORRIDOR_BIAS, { [CITY_ID]: cityWalkIn }),
    plans: [CORRIDOR_PLAN],
    otherLine: CITYBANAN_OTHER,
    constraints: CORRIDOR_CONSTRAINTS,
    sources: SOURCES,
  };
  return { ds, transfer };
}

const ATC2: Signalling = {
  system: { value: 'ATC-2', src: { kind: 'published', ref: 'wiki-citybanan' } },
  minHeadwaySec: { value: 150, src: { kind: 'derived', ref: 'wiki-citybanan', note: '24 trains per hour → 150 s.' } },
};
const ATC2_MAINLINE: Signalling = {
  system: { value: 'ATC-2', src: { kind: 'assumption', ref: 'assumption', note: 'Swedish mainline standard; assumed the same as Citybanan.' } },
  minHeadwaySec: { value: 180, src: { kind: 'assumption', ref: 'assumption', note: 'Estimated Ostkustbanan block headway.' } },
};

/** T14 + Solna corridor + T-Centralen ↔ Stockholm City transfer */
export function buildStockholmNetwork(t14: TwinDataset, corridor: Corridor): Network {
  return buildNetwork(
    [
      { key: 'T14', line: t14.line, plan: t14.plans.find((p) => p.kind === 'current')! },
      { key: 'PENDEL-SOLNA', line: corridor.ds.line, plan: corridor.ds.plans[0], trunkSignalling: ATC2, signalling: ATC2_MAINLINE },
    ],
    [{ id: 'transfer:t-centralen-stockholm-city', from: TC_ID, to: CITY_ID, walkSec: TRANSFER_TC_CITY.walkSec, capacityPaxPerHour: TRANSFER_TC_CITY.capacityPaxPerHour }],
  );
}

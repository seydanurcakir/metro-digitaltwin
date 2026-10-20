// T14 ile pendeltåg koridorunun entegrasyonu.
// T14 simülasyonunda T-Centralen’de inen yolcuların bir kısmı yürüyerek Stockholm City peronuna gelir.
// Stockholm City’nin yayınlanmış binişi aktaranları zaten içerdiği için, aktarma akışı kadar yolcu
// yürüyerek gelen talepten düşülür: istasyonun günlük toplamı korunur, yalnızca zamanlaması T14’e bağlanır.

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
  /** Günlük aktaran yolcu (koridor trenlerine, iki yön) */
  daily: Record<Direction, number>;
}

/** T14’te T-Centralen’de inen yolcudan Stockholm City koridor peronlarına gelen akış */
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
      // İnen yolcular 60 sn içinde perondan ayrılır, sonra yürür
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
 * Solna koridorunun veri seti. `referenceTransfer`: City talebinden düşülecek günlük aktarma
 * (mevcut tarife ile hesaplanır; böylece T14 planı değişince toplam değil yalnızca zamanlama değişir).
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
  minHeadwaySec: { value: 150, src: { kind: 'derived', ref: 'wiki-citybanan', note: 'Saatte 24 tren → 150 sn.' } },
};
const ATC2_MAINLINE: Signalling = {
  system: { value: 'ATC-2', src: { kind: 'assumption', ref: 'assumption', note: 'İsveç ana hat standardı; Citybanan ile aynı varsayıldı.' } },
  minHeadwaySec: { value: 180, src: { kind: 'assumption', ref: 'assumption', note: 'Ostkustbanan blok aralığı tahmini.' } },
};

/** T14 + Solna koridoru + T-Centralen ↔ Stockholm City aktarması */
export function buildStockholmNetwork(t14: TwinDataset, corridor: Corridor): Network {
  return buildNetwork(
    [
      { key: 'T14', line: t14.line, plan: t14.plans.find((p) => p.kind === 'current')! },
      { key: 'PENDEL-SOLNA', line: corridor.ds.line, plan: corridor.ds.plans[0], trunkSignalling: ATC2, signalling: ATC2_MAINLINE },
    ],
    [{ id: 'aktarma:t-centralen-stockholm-city', from: TC_ID, to: CITY_ID, walkSec: TRANSFER_TC_CITY.walkSec, capacityPaxPerHour: TRANSFER_TC_CITY.capacityPaxPerHour }],
  );
}

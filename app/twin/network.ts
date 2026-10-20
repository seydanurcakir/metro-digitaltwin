// Ağ görünümü için veri: Solna koridoru, T14 planına bağlı olarak (aktarma dalgaları) bir kez simüle edilip saklanır.
import { buildCorridor, buildStockholmNetwork, route, simulate, StationAgent, SOLNA_ID, TC_ID, type Corridor, type Network, type SimResult, type SlotKpi } from '../../src/index';
import { DATASET, getResult, type ScenarioId } from './model';

export interface CorridorView {
  corridor: Corridor;
  result: SimResult;
  solna: StationAgent;
  series: SlotKpi[];
  net: Network;
}

const cache = new Map<string, CorridorView>();
let reference: Corridor['transfer'] | null = null;

/** T14 planı ve senaryosuna göre koridor görünümü. City’nin yürüyerek gelen talebi hep mevcut tarifeye göre sabitlenir. */
export function getCorridor(planId: string, scenario: ScenarioId): CorridorView {
  const key = `${planId}|${scenario}`;
  let v = cache.get(key);
  if (!v) {
    if (!reference) reference = buildCorridor(DATASET, getResult('current', 'normal')).transfer;
    const corridor = buildCorridor(DATASET, getResult(planId, scenario), reference);
    const opts = { surges: corridor.transfer.surges };
    const result = simulate(corridor.ds, corridor.ds.plans[0], opts);
    const solna = new StationAgent(corridor.ds, result, SOLNA_ID, opts);
    v = { corridor, result, solna, series: solna.timeSeries(60), net: buildStockholmNetwork(DATASET, corridor) };
    cache.set(key, v);
  }
  return v;
}

export const routeNow = (v: CorridorView, t: number) => route(v.net, TC_ID, SOLNA_ID, t);

/** [t − pencere, t) aralığında T14’ten koridora aktaran yolcu */
export function recentTransfer(v: CorridorView, t: number, windowSec = 900): number {
  let n = 0;
  for (const s of v.corridor.transfer.surges) {
    const ov = Math.max(0, Math.min(t, s.endSec) - Math.max(t - windowSec, s.startSec));
    n += (s.passengers * ov) / (s.endSec - s.startSec);
  }
  return n;
}

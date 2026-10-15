// Uygulamanın veri katmanı: veri setini kurar, simülasyonları bir kez çalıştırıp saklar.
// Sahne bileşenleri yalnızca buradaki ve selectors.ts'deki saf fonksiyonları kullanır.
import { buildDataset, simulate, hhmmToSec, type SimOptions, type SimResult, type TwinDataset } from '../../src/index';

export const DATASET: TwinDataset = buildDataset();
export const FOCUS_STATION_ID = 't-centralen';

export type ScenarioId = 'normal' | 'surge';

export interface Scenario {
  id: ScenarioId;
  name: string;
  options: SimOptions;
}

const SURGE_START = hhmmToSec('21:00');

export const SCENARIOS: Record<ScenarioId, Scenario> = {
  normal: { id: 'normal', name: 'Normal iş günü', options: {} },
  surge: {
    id: 'surge',
    name: 'Akşam kalabalığı',
    options: {
      surges: [{ stationId: FOCUS_STATION_ID, direction: 'south', startSec: SURGE_START, endSec: SURGE_START + 600, passengers: 3000 }],
    },
  },
};

const cache = new Map<string, SimResult>();

/** Arayüzde seçilebilen planlar. "Önerilen" senaryoya göre doğru optimize planı seçer. */
export const UI_PLANS = [
  { id: 'current', label: 'Mevcut' },
  { id: 'sample-candidate', label: 'Deneme' },
  { id: 'optimized', label: 'Önerilen' },
] as const;
export const planLabel = (id: string) => UI_PLANS.find((p) => p.id === id)?.label ?? id;

export function resolvePlanId(planId: string, scenario: ScenarioId): string {
  return planId === 'optimized' && scenario === 'surge' ? 'optimized-event' : planId;
}
export const resolvePlan = (planId: string, scenario: ScenarioId) =>
  DATASET.plans.find((p) => p.id === resolvePlanId(planId, scenario))!;

export function getResult(planId: string, scenario: ScenarioId): SimResult {
  const key = `${planId}|${scenario}`;
  let r = cache.get(key);
  if (!r) {
    const plan = resolvePlan(planId, scenario);
    r = simulate(DATASET, plan, SCENARIOS[scenario].options);
    cache.set(key, r);
  }
  return r;
}

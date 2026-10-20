// Metro İkizi — sefer planı optimizasyonu (Adım 6).
//
// Problem: her 15 dakikalık dilim için sefer aralığı ve tren uzunluğu seç.
//   Amaç   : yolcu ağırlıklı dağılma süresini (P90 ≈ 0,9 × sefer aralığı) en aza indir
//   Bütçe  : toplam ünite-sefer ≤ bütçe (varsayılan: mevcut tarifeninki, yani ek maliyet yok)
//   Kısıtlar: ortak gövde (T13 + T14 ≤ 24 tren/saat), filo, en kısa/en uzun sefer aralığı,
//             en yüklü bölümde doluluk ≤ %90 (statik akış tahmini)
// Yöntem: çoklu seçimli sırt çantası problemi → dinamik programlama (kesin çözüm, statik model için).
// Sonra plan simülasyonla doğrulanır; doluluk ya da peron yoğunluğu sınırı aşılan dilimlerde
// kapasite payı artırılıp yeniden çözülür. Trenler son duraktan kalkıştan ~20 dk sonra merkeze
// ulaştığı için ihlal, kendinden önceki dilimlerde de sıkılaştırılır (önceden önlem).

import type { Direction, PlanSlot, ServicePlan, TwinDataset } from '../types';
import { simulate, type SimOptions } from '../sim/engine';
import { computeKpis } from '../sim/kpi';
import { SERVICE_START_MIN, SLOTS, SLOT_MINUTES } from '../data/time';
import { cycleTimeMin } from '../index';

export const HEADWAY_OPTIONS = [4, 5, 6, 7.5, 10];

export interface OptimizeInput {
  id: string;
  name: string;
  /** Toplam ünite-sefer bütçesi (iki yön). Verilmezse mevcut tarifeninki. */
  budgetUnitTrips?: number;
  sim?: SimOptions;
  maxIterations?: number;
}

export interface SlotIssue { slotIndex: number; label: string; loadFactor: number; density: number }

export interface OptimizeReport {
  plan: ServicePlan;
  budgetUnitTrips: number;
  usedUnitTrips: number;
  iterations: number;
  /** Simülasyonda hâlâ sınırı aşan dilimler (en iyi çaba) */
  remainingIssues: SlotIssue[];
  /** Kapasite payı artırılan dilimler */
  tightenedSlots: number[];
}

const SLOT_SEC = SLOT_MINUTES * 60;
const START = SERVICE_START_MIN * 60;

/** Bir dilimdeki ünite-sefer (iki yön), 4 ile çarpılmış tam sayı */
const cost4 = (h: number, u: number) => Math.round((2 * 4 * (SLOT_MINUTES / h)) * u);

/** Dilim bazında en yüklü bölümdeki saatlik yolcu akışı (iki yön içinde en büyüğü) */
export function peakLinkFlows(ds: TwinDataset, sim: SimOptions = {}): number[] {
  const { line, demand } = ds;
  const n = line.stations.length;
  const order = new Map(line.stations.map((s) => [s.id, s.order]));
  const mult = sim.demandMultiplier ?? 1;
  // Ek kalabalığı dilimlere dağıt
  const extra = new Map<string, number>();
  for (const s of sim.surges ?? []) {
    for (const sl of SLOTS) {
      const a = START + sl.index * SLOT_SEC, b = a + SLOT_SEC;
      const ov = Math.max(0, Math.min(b, s.endSec) - Math.max(a, s.startSec));
      if (ov > 0) {
        const k = `${sl.index}|${s.stationId}|${s.direction}`;
        extra.set(k, (extra.get(k) ?? 0) + (s.passengers * ov) / (s.endSec - s.startSec));
      }
    }
  }
  const odBy = new Map(demand.od.map((r) => [`${r.period}|${r.originId}|${r.direction}`, r]));
  return SLOTS.map((sl) => {
    let worst = 0;
    for (const dir of ['north', 'south'] as Direction[]) {
      const flows = new Float64Array(n - 1);
      for (const c of demand.cells) {
        if (c.slotIndex !== sl.index || c.direction !== dir) continue;
        const pax = c.arrivals * mult + (extra.get(`${sl.index}|${c.stationId}|${dir}`) ?? 0);
        const o = order.get(c.stationId)!;
        const row = odBy.get(`${demand.periodBySlot[sl.index]}|${c.stationId}|${dir}`);
        if (!row) continue;
        for (const [d, sh] of Object.entries(row.destinationShares)) {
          const dO = order.get(d)!;
          const [a, b] = dir === 'north' ? [o, dO] : [dO, o];
          for (let k = a; k < b; k++) flows[k] += pax * sh * (60 / SLOT_MINUTES);
        }
      }
      for (const f of flows) worst = Math.max(worst, f);
    }
    return worst;
  });
}

export function planUnitTrips(plan: ServicePlan): number {
  return plan.slots.reduce((s, p) => s + cost4(p.headwayMin, p.unitsPerTrain), 0) / 4;
}

export function optimizePlan(ds: TwinDataset, input: OptimizeInput): OptimizeReport {
  const { line, fleet, constraints, otherLine } = ds;
  const current = ds.plans.find((p) => p.kind === 'current')!;
  const budget = input.budgetUnitTrips ?? planUnitTrips(current);
  const B4 = Math.round(budget * 4);
  const unitCap = fleet.unitType.seats.value + fleet.unitType.standing.value;
  const cycle = cycleTimeMin(line);
  const maxLF = constraints.maxLoadFactor.value;
  const densLimit = constraints.platformDensityLimit.value;
  const flows = peakLinkFlows(ds, input.sim);
  const nS = SLOTS.length;
  const weight = SLOTS.map((sl) => ds.demand.cells.filter((c) => c.slotIndex === sl.index).reduce((a, c) => a + c.arrivals, 0) + 1);
  const margin = new Float64Array(nS).fill(1);
  const tightened = new Set<number>();

  type Opt = { h: number; u: number; c: number; cap: number };
  const allOpts = (s: number): Opt[] => {
    const out: Opt[] = [];
    for (const h of HEADWAY_OPTIONS) {
      if (h < constraints.minHeadwayMin.value || h > constraints.maxHeadwayMin.value) continue;
      if (60 / h + otherLine.trainsPerHourBySlot[s] > line.trunk.maxTrainsPerHour.value + 1e-9) continue;
      for (const u of fleet.allowedUnitsPerTrain.value) {
        if (Math.ceil(cycle / h) * u > fleet.unitsAvailable.value) continue;
        out.push({ h, u, c: cost4(h, u), cap: maxLF * (60 / h) * u * unitCap });
      }
    }
    return out;
  };

  const solve = (): PlanSlot[] => {
    // Her dilimde uygun seçenekler: ihtiyaç = bu ve sonraki dilimin akışı (trenler merkeze ~20 dk'da varır) × pay
    const opts = SLOTS.map((_, s) => {
      const need = Math.max(flows[s], flows[Math.min(nS - 1, s + 1)]) * margin[s];
      const all = allOpts(s);
      const ok = all.filter((o) => o.cap >= need);
      // Hiçbiri yetmiyorsa en yüksek kapasiteli seçenek (en iyi çaba)
      return ok.length ? ok : [all.reduce((a, b) => (b.cap > a.cap ? b : a))];
    });
    const INF = Number.POSITIVE_INFINITY;
    let dp = new Float64Array(B4 + 1).fill(INF);
    dp[0] = 0;
    const choice: Int8Array[] = [];
    for (let s = 0; s < nS; s++) {
      const next = new Float64Array(B4 + 1).fill(INF);
      const ch = new Int8Array(B4 + 1).fill(-1);
      opts[s].forEach((o, k) => {
        // Amaç: yolcu × beklenen P90 (dk); eşitlikte daha ucuz seçenek
        const val = weight[s] * 0.9 * o.h + o.c * 1e-6;
        for (let b = 0; b + o.c <= B4; b++) {
          if (dp[b] === INF) continue;
          const v = dp[b] + val;
          if (v < next[b + o.c]) { next[b + o.c] = v; ch[b + o.c] = k; }
        }
      });
      choice.push(ch);
      dp = next;
    }
    let best = -1;
    for (let b = 0; b <= B4; b++) if (dp[b] < INF && (best < 0 || dp[b] < dp[best])) best = b;
    if (best < 0) throw new Error('Bütçe içinde uygun plan yok');
    const out: PlanSlot[] = new Array(nS);
    for (let s = nS - 1; s >= 0; s--) {
      const o = opts[s][choice[s][best]];
      out[s] = { slotIndex: s, headwayMin: o.h, unitsPerTrain: o.u };
      best -= o.c;
    }
    return out;
  };

  const issuesOf = (plan: ServicePlan): SlotIssue[] => {
    const r = simulate(ds, plan, input.sim);
    const lf = new Float64Array(nS), dens = new Float64Array(nS);
    for (const e of r.events) {
      const s = Math.floor((e.t - START) / SLOT_SEC);
      if (s < 0 || s >= nS) continue;
      lf[s] = Math.max(lf[s], e.loadAfter / e.capacity);
      dens[s] = Math.max(dens[s], e.densityBefore);
    }
    const out: SlotIssue[] = [];
    for (let s = 0; s < nS; s++)
      if (lf[s] > maxLF + 1e-9 || dens[s] > densLimit + 1e-9) out.push({ slotIndex: s, label: SLOTS[s].label, loadFactor: lf[s], density: dens[s] });
    return out;
  };

  const maxIt = input.maxIterations ?? 12;
  let slots = solve();
  let plan = makePlan(input, slots, budget);
  let issues = issuesOf(plan);
  let it = 1;
  while (issues.length && it < maxIt) {
    for (const is of issues) {
      // İhlalin görüldüğü dilim ve kendinden önceki iki dilim (trenlerin yola çıktığı zaman)
      for (let s = Math.max(0, is.slotIndex - 2); s <= is.slotIndex; s++) {
        margin[s] *= 1.2;
        tightened.add(s);
      }
    }
    slots = solve();
    plan = makePlan(input, slots, budget);
    issues = issuesOf(plan);
    it++;
  }
  return {
    plan,
    budgetUnitTrips: budget,
    usedUnitTrips: planUnitTrips(plan),
    iterations: it,
    remainingIssues: issues,
    tightenedSlots: [...tightened].sort((a, b) => a - b),
  };
}

function makePlan(input: OptimizeInput, slots: PlanSlot[], budget: number): ServicePlan {
  return {
    id: input.id,
    name: input.name,
    kind: 'candidate',
    slots,
    src: {
      kind: 'derived',
      ref: 'optimizer',
      note: `Optimizasyon: bütçe ${budget} ünite-sefer, yolcu ağırlıklı dağılma süresi en aza indirildi, simülasyonla doğrulandı.`,
    },
  };
}

/** Raporlama yardımcısı: iki planın tüm gün ve pencere ölçütleri */
export function compareDay(ds: TwinDataset, a: ServicePlan, b: ServicePlan, sim?: SimOptions, stationId?: string) {
  const ra = simulate(ds, a, sim), rb = simulate(ds, b, sim);
  return { a: computeKpis(ds, ra, { stationId }), b: computeKpis(ds, rb, { stationId }) };
}

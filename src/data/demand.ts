import type { Demand, DemandCell, DemandProfile, Direction, Line, OdPeriod, OdRow, Sourced, Station } from '../types';
import { DIRECTIONS } from '../types';

/** Bir istasyonun bu hattaki günlük binişi = istasyon binişi × hat payı */
export const dailyLineBoardings = (line: Line): Record<string, number> =>
  Object.fromEntries(line.stations.map((s) => [s.id, s.boardingsPerDay.value * s.lineShare.value]));

export type Bias = { am: number; pm: number; centerStationId: string };

export const DEFAULT_BIAS: Sourced<Bias> = {
  value: { am: 1.5, pm: 1.0, centerStationId: 't-centralen' },
  src: {
    kind: 'assumption',
    ref: 'assumption',
    note: 'Sabah zirvesinde merkeze doğru varışların ağırlığı ×2,5; akşam zirvesinde merkezden dışarı ×2. Turnike + çıkış verisiyle kalibre edilmeli.',
  },
};

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};
export const AM_WINDOW = [toMin('06:30'), toMin('09:30')];
export const PM_WINDOW = [toMin('15:00'), toMin('18:30')];

export const periodOf = (startMin: number): OdPeriod =>
  startMin >= AM_WINDOW[0] && startMin < AM_WINDOW[1] ? 'am' : startMin >= PM_WINDOW[0] && startMin < PM_WINDOW[1] ? 'pm' : 'base';

/**
 * Çekim modeli: i'de binen yolcu j'ye, j'nin günlük binişiyle orantılı ağırlıkla gider.
 * Sabah zirvesinde merkeze (T-Centralen) daha yakın varışlar, akşam zirvesinde daha uzak varışlar ağırlaştırılır.
 */
function destWeight(line: Line, w: Record<string, number>, o: Station, d: Station, period: OdPeriod, bias: Bias): number {
  const c = line.stations.find((s) => s.id === bias.centerStationId)!.order;
  const closer = Math.abs(d.order - c) < Math.abs(o.order - c);
  let k = 1;
  if (period === 'am' && closer) k += bias.am;
  if (period === 'pm' && !closer) k += bias.pm;
  return w[d.id] * k;
}

export function buildOd(line: Line, bias: Bias): OdRow[] {
  const w = dailyLineBoardings(line);
  const rows: OdRow[] = [];
  for (const period of ['base', 'am', 'pm'] as OdPeriod[]) {
    for (const o of line.stations) {
      for (const dir of DIRECTIONS) {
        const dests = line.stations.filter((d) => (dir === 'north' ? d.order > o.order : d.order < o.order));
        const weights = dests.map((d) => destWeight(line, w, o, d, period, bias));
        const total = weights.reduce((a, b) => a + b, 0);
        if (total === 0) continue;
        rows.push({
          period,
          originId: o.id,
          direction: dir,
          destinationShares: Object.fromEntries(dests.map((d, i) => [d.id, weights[i] / total])),
        });
      }
    }
  }
  return rows;
}

/** i istasyonundan binenlerin kuzeye gidenlerinin oranı (döneme göre) */
export function northShare(line: Line, stationId: string, period: OdPeriod, bias: Bias): number {
  const w = dailyLineBoardings(line);
  const o = line.stations.find((s) => s.id === stationId)!;
  let north = 0;
  let all = 0;
  for (const d of line.stations) {
    if (d.id === o.id) continue;
    const v = destWeight(line, w, o, d, period, bias);
    all += v;
    if (d.order > o.order) north += v;
  }
  return all === 0 ? 0 : north / all;
}

/**
 * Her dilim × istasyon × yön için perona gelen yolcu sayısı.
 * `arrivalsOverride`: bazı istasyonların perona yürüyerek gelen günlük yolcusu farklıysa (ör. aktarma akışı ayrı
 * modellendiğinde) o istasyonun değeri. Varış istasyonu çekimi her zaman yayınlanmış binişlerle hesaplanır.
 */
export function buildDemand(line: Line, profile: DemandProfile, bias: Sourced<Bias> = DEFAULT_BIAS, arrivalsOverride: Record<string, number> = {}): Demand {
  const daily = { ...dailyLineBoardings(line), ...arrivalsOverride };
  const periodBySlot = profile.slots.map((s) => periodOf(s.startMin));
  const nsCache: Record<string, number> = {};
  for (const p of ['base', 'am', 'pm'] as OdPeriod[])
    for (const s of line.stations) nsCache[`${p}|${s.id}`] = northShare(line, s.id, p, bias.value);

  const cells: DemandCell[] = [];
  for (const slot of profile.slots) {
    const p = periodBySlot[slot.index];
    for (const s of line.stations) {
      const ns = nsCache[`${p}|${s.id}`];
      for (const dir of DIRECTIONS) {
        const dirShare = dir === 'north' ? ns : 1 - ns;
        if (dirShare === 0) continue;
        cells.push({ slotIndex: slot.index, stationId: s.id, direction: dir as Direction, arrivals: daily[s.id] * dirShare * profile.shares[slot.index] });
      }
    }
  }
  return {
    profile,
    cells,
    od: buildOd(line, bias.value),
    periodBySlot,
    directionalBias: bias,
    src: {
      kind: 'synthetic',
      ref: 'synthetic',
      note: 'Günlük biniş (yayın) × gün içi eğri (sentetik) × yön payı (çekim modeli + zirve yön dengesizliği).',
    },
  };
}

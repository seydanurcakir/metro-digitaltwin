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
    if (!b) throw new Error(`Plan dilimi kapsanmıyor: ${s.label}`);
    return { slotIndex: s.index, headwayMin: b.headwayMin, unitsPerTrain: b.unitsPerTrain };
  });

/** Mevcut tarifenin sadeleştirilmiş hali (tüm hat boyunca tek sefer aralığı) */
export const CURRENT_PLAN: ServicePlan = {
  id: 'current',
  name: 'Mevcut tarife',
  kind: 'current',
  slots: fromBands([
    { from: '05:00', to: '06:00', headwayMin: 10, unitsPerTrain: 2 },
    { from: '06:00', to: '19:00', headwayMin: 5, unitsPerTrain: 3 },
    { from: '19:00', to: '01:00', headwayMin: 10, unitsPerTrain: 2 },
  ]),
  src: {
    kind: 'derived',
    ref: 'wiki-red-line',
    note: 'Sefer aralıkları yayından (gündüz/zirve 5 dk, diğer saatler 10 dk). Saat sınırları ve ünite sayıları varsayım. Gerçekte gündüz 5 dk yalnız Mörby c.–Liljeholmen arası; model tüm hatta uygular.',
  },
};

/** Simülasyonu test etmek için elle yazılmış örnek plan. Optimize EDİLMEMİŞTİR. */
export const SAMPLE_CANDIDATE: ServicePlan = {
  id: 'sample-candidate',
  name: 'Deneme planı (örnek)',
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
  src: { kind: 'assumption', ref: 'assumption', note: 'Simülasyon motorunu denemek için. Optimizasyon Adım 2+ ile gelecek.' },
};

/** Ortak gövdede T13 trafiği: zirve/gündüz saatte 12, diğer saatler 6 tren */
export const T13_ON_TRUNK: OtherLineService = {
  lineId: 'T13',
  trainsPerHourBySlot: SLOTS.map((s) => (inRange(s.startMin, '06:00', '19:00') ? 12 : 6)),
  src: {
    kind: 'derived',
    ref: 'wiki-red-line',
    note: 'Zirvede gövdede 24 tren/saat; T14 5 dk (12 tren) → T13 de 12 tren kabul edildi.',
  },
};

export const CONSTRAINTS: Constraints = {
  minHeadwayMin: {
    value: 2.5,
    src: { kind: 'derived', ref: 'wiki-red-line', note: 'Gövdenin sinyal kapasitesi (24 tren/saat). Etkin sınır T13 trafiğine bağlı.' },
  },
  maxHeadwayMin: { value: 10, src: { kind: 'assumption', ref: 'assumption', note: 'Hizmet kalitesi için üst sınır.' } },
  maxLoadFactor: { value: 0.9, src: { kind: 'assumption', ref: 'assumption', note: 'Ürün kuralı: vagon doluluğu kapasitenin %90’ını aşmaz.' } },
  platformDensityLimit: {
    value: 2.0,
    src: { kind: 'assumption', ref: 'assumption', note: 'Peronda güvenli yoğunluk eşiği (kişi/m²); yaya hizmet seviyesi standartlarıyla teyit edilmeli.' },
  },
};

export { SLOT_MINUTES };

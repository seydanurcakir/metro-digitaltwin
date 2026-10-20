// Pendeltåg koridoru: Stockholm City – Stockholm Odenplan – Solna – Ulriksdal (hatlar J40, J41, J42X).
// Solna istasyonu bu koridorun ana düğümü. Koridorun iki ucunda koridor dışından gelen ve
// dışarı giden yolcuyu temsil eden sanal sınır düğümleri var; ölçütlere dahil edilmezler.
//
// Kapsam: yalnızca temel ulaşım operasyonu. İstasyon çevresindeki cazibe merkezleri (AVM, stadyum)
// ve etkinlik kaynaklı yığılmalar bu aşamada modellenmez.

import type { Constraints, Fleet, Line, OtherLineService, Platform, PlanSlot, ServicePlan, Sourced, Station } from '../types';
import { SLOTS } from './time';
import type { Bias } from './demand';

const assume = <T,>(v: T, note: string): Sourced<T> => ({ value: v, src: { kind: 'assumption', ref: 'assumption', note } });
const pub = <T,>(v: T, ref: string, note?: string): Sourced<T> => ({ value: v, src: { kind: 'published', ref, note } });
const derived = <T,>(v: T, ref: string, note: string): Sourced<T> => ({ value: v, src: { kind: 'derived', ref, note } });

const platform = (areaM2: number, lengthM: number, note: string): Platform => ({
  usableAreaM2: assume(areaM2, note),
  areaShareByDirection: assume(0.5, 'Ada peronda iki yön alanı eşit paylaşır.'),
  lengthM: assume(lengthM, 'İki üniteli X60 (214 m) alacak uzunluk.'),
});

const BOUNDARY_NOTE =
  'Koridor dışından gelen yolcu akışı (kalibrasyon varsayımı). Pendeltåg toplamı 342 000/gün; koridor hatları ~yarısı; koridor istasyonları çıkarılıp sınırı geçen pay tahmin edildi.';

type Row = {
  id: string;
  name: string;
  boardings: Sourced<number>;
  share: Sourced<number>;
  dwell: Sourced<number>;
  platform: Platform;
  boundary?: boolean;
  trunk?: boolean;
};

const ROWS: Row[] = [
  {
    id: 'sinir-guney', name: 'Güney sınırı (Stockholms södra yönü)', boundary: true,
    boardings: assume(45_000, BOUNDARY_NOTE), share: assume(1, 'Sanal düğüm.'), dwell: assume(0, 'Sanal düğüm.'),
    platform: platform(100_000, 214, 'Sanal düğüm: kapasite kısıtı yok.'),
  },
  {
    id: 'stockholm-city', name: 'Stockholm City', trunk: true,
    boardings: pub(54_800, 'sl-fakta-2022', 'Pendeltåg, kış iş günü; otomatik sayım.'),
    share: assume(0.5, 'City’de binenlerin J40/J41/J42X trenlerine düşen payı; Citybanan’ı J43/J43X/J44 ile paylaşırlar.'),
    dwell: assume(60, 'Merkez istasyon, peron kapılı; uzun kapı açık süresi.'),
    platform: platform(2_600, 250, 'Peron kapılı ada peron; bekleme alanı tahmini.'),
  },
  {
    id: 'stockholm-odenplan', name: 'Stockholm Odenplan', trunk: true,
    boardings: pub(34_800, 'sl-fakta-2022', 'Pendeltåg, kış iş günü; otomatik sayım.'),
    share: assume(0.5, 'Odenplan’dan sonra J40/J41/J42X Solna’ya, J43/J44 Sundbyberg’e ayrılır.'),
    dwell: assume(45, 'Standart pendeltåg kapı açık süresi.'),
    platform: platform(2_000, 250, 'Ada peron; bekleme alanı tahmini.'),
  },
  {
    id: 'solna', name: 'Solna station',
    boardings: pub(16_000, 'sl-fakta-2022', 'Pendeltåg, kış iş günü; otomatik sayım. (2019: 20 900, wiki-solna)'),
    share: derived(1, 'wiki-solna', 'Solna’da yalnızca J40, J41 ve 42X durur.'),
    dwell: assume(45, 'Standart pendeltåg kapı açık süresi.'),
    platform: platform(1_600, 225, 'Tek ada peron (wiki-solna); ~225 m × ~7 m kullanılabilir genişlik.'),
  },
  {
    id: 'ulriksdal', name: 'Ulriksdal',
    boardings: pub(4_300, 'sl-fakta-2022', 'Pendeltåg, kış iş günü.'),
    share: derived(1, 'wiki-solna', 'Solna–Ulriksdal arasında yalnızca J40, J41, 42X çalışır.'),
    dwell: assume(40, 'Küçük istasyon.'),
    platform: platform(1_200, 225, 'Ada peron; bekleme alanı tahmini.'),
  },
  {
    id: 'sinir-kuzey', name: 'Kuzey sınırı (Märsta / Uppsala yönü)', boundary: true,
    boardings: assume(35_000, BOUNDARY_NOTE), share: assume(1, 'Sanal düğüm.'), dwell: assume(0, 'Sanal düğüm.'),
    platform: platform(100_000, 214, 'Sanal düğüm: kapasite kısıtı yok.'),
  },
];

const stations: Station[] = ROWS.map((r, order) => ({
  id: r.id,
  name: r.name,
  order,
  isTerminal: order === 0 || order === ROWS.length - 1,
  isBoundary: !!r.boundary,
  servedBy: r.trunk ? ['J40', 'J41', 'J42X', 'J43', 'J43X', 'J44'] : ['J40', 'J41', 'J42X'],
  onTrunk: !!r.trunk,
  boardingsPerDay: r.boardings,
  lineShare: r.share,
  dwellSec: r.dwell,
  platform: r.platform,
}));

// Bölüm süreleri (sn). City → Solna toplamı 7 dk (solna-stad): 150 + 45 (Odenplan) + 225.
const RUN: [number, Sourced<number>][] = [
  [0, assume(180, 'Sanal: güney sınırından City’ye.')],
  [1, derived(150, 'solna-stad', 'City → Solna 7 dk; City–Odenplan payı tahmini.')],
  [2, derived(225, 'solna-stad', 'City → Solna 7 dk eksi City–Odenplan ve Odenplan beklemesi.')],
  [3, assume(240, 'Solna → Ulriksdal tahmini; Trafiklab GTFS ile doğrulanmalı.')],
  [4, assume(180, 'Sanal: Ulriksdal’dan kuzey sınırına.')],
];

export const CORRIDOR_SOLNA: Line = {
  id: 'J41',
  lineIds: ['J40', 'J41', 'J42X'],
  mode: 'commuter',
  name: 'Pendeltåg J40/J41/J42X · Stockholm City – Solna – Ulriksdal',
  color: '#E8618C',
  stations,
  segments: RUN.map(([i, t]) => ({ from: stations[i].id, to: stations[i + 1].id, runTimeSec: t })),
  turnaroundSec: assume(300, 'Sanal uçlar; filo kontrolü için.'),
  trunk: {
    fromStationId: 'stockholm-city',
    toStationId: 'stockholm-odenplan',
    maxTrainsPerHour: pub(16, 'wiki-citybanan', 'Citybanan yön başına saatte 24 tren; bunun en fazla 16’sı pendeltåg.'),
  },
};

export const FLEET_X60: Fleet = {
  unitType: {
    id: 'X60',
    seats: pub(374, 'wiki-x60', 'Ünite başına kabul edildi (kaynak çelişkili).'),
    standing: pub(530, 'wiki-x60', 'Ünite başına kabul edildi (kaynak çelişkili).'),
    lengthM: pub(107.1, 'wiki-x60'),
  },
  allowedUnitsPerTrain: pub([1, 2], 'wiki-x60', 'Tek ünite veya iki ünite (214 m).'),
  unitsAvailable: assume(40, 'Koridor hatlarına ayrılan ünite tahmini.'),
};

export const CORRIDOR_CONSTRAINTS: Constraints = {
  minHeadwayMin: derived(2.5, 'wiki-citybanan', 'Citybanan saatte 24 tren → 2,5 dk sinyal aralığı (ATC-2).'),
  maxHeadwayMin: assume(15, 'Erken sabah ve gece hizmet aralığı.'),
  maxLoadFactor: assume(0.9, 'Ürün kuralı: doluluk ≤ %90.'),
  platformDensityLimit: assume(2.0, 'Peronda güvenli yoğunluk eşiği (kişi/m²).'),
};

/** Koridorun yön dengesizliği: sabah merkeze (City), akşam dışarı. Solna bir iş merkezi olduğu için T14’ten zayıf. */
export const CORRIDOR_BIAS: Sourced<Bias> = assume(
  { am: 1.0, pm: 0.7, centerStationId: 'stockholm-city' },
  'Sabah City yönüne varışlar ×2, akşam dışarı ×1,7. Solna’ya ters yönlü işe gidişler nedeniyle T14’ten zayıf tutuldu.',
);

const toMin = (s: string) => {
  const [h, m] = s.split(':').map(Number);
  const v = h * 60 + m;
  return v < 300 ? v + 1440 : v;
};
type Band = { from: string; to: string; headwayMin: number; unitsPerTrain: number };
const fromBands = (bands: Band[]): PlanSlot[] =>
  SLOTS.map((s) => {
    const b = bands.find((x) => s.startMin >= toMin(x.from) && s.startMin < toMin(x.to));
    if (!b) throw new Error(`Koridor planı dilimi kapsanmıyor: ${s.label}`);
    return { slotIndex: s.index, headwayMin: b.headwayMin, unitsPerTrain: b.unitsPerTrain };
  });

const inPeak = (startMin: number) => (startMin >= toMin('06:30') && startMin < toMin('09:00')) || (startMin >= toMin('15:30') && startMin < toMin('18:30'));

export const CORRIDOR_PLAN: ServicePlan = {
  id: 'corridor-current',
  name: 'Pendeltåg mevcut tarife (Solna)',
  kind: 'current',
  slots: fromBands([
    { from: '05:00', to: '06:00', headwayMin: 15, unitsPerTrain: 1 },
    { from: '06:00', to: '06:30', headwayMin: 10, unitsPerTrain: 2 },
    { from: '06:30', to: '09:00', headwayMin: 7.5, unitsPerTrain: 2 },
    { from: '09:00', to: '15:30', headwayMin: 10, unitsPerTrain: 2 },
    { from: '15:30', to: '18:30', headwayMin: 7.5, unitsPerTrain: 2 },
    { from: '18:30', to: '21:00', headwayMin: 10, unitsPerTrain: 2 },
    { from: '21:00', to: '01:00', headwayMin: 15, unitsPerTrain: 1 },
  ]),
  src: {
    kind: 'derived',
    ref: 'wiki-pendeltag',
    note: 'Gündüz J41 15 dk + J40 30 dk ≈ 10 dk; zirvede ek seferlerle ortalama 7,5 dk; erken/geç 30’ar dk iki hat ≈ 15 dk. Saat sınırları ve ünite sayıları varsayım.',
  },
};

/** Citybanan’ı paylaşan diğer pendeltåg hatları (J43, J43X, J44): zirvede 8, gündüz 6, diğer saatler 4 tren/saat */
export const CITYBANAN_OTHER: OtherLineService = {
  lineId: 'J43',
  trainsPerHourBySlot: SLOTS.map((s) => (inPeak(s.startMin) ? 8 : s.startMin >= toMin('06:00') && s.startMin < toMin('21:00') ? 6 : 4)),
  src: {
    kind: 'derived',
    ref: 'wiki-citybanan',
    note: 'Citybanan pendeltåg kapasitesi 16 tren/saat; zirvede koridor hatları 8 kullanır, kalan 8 diğer hatlar varsayıldı.',
  },
};

/** Aktarma: T-Centralen ↔ Stockholm City yürüme bağlantısı */
export const TRANSFER_TC_CITY = {
  walkSec: assume(300, 'T-Centralen ile Stockholm City arası yürüyen merdivenli geçit; ortalama 5 dk tahmini.'),
  capacityPaxPerHour: assume(8_000, 'Yön başına yürüyen merdiven ve geçit kapasitesi tahmini.'),
  /** T14’ten T-Centralen’de inenlerin pendeltåg’a aktarma payı */
  metroToCommuterShare: assume(0.2, 'T14’ten T-Centralen’de inenlerin %20’si pendeltåg’a aktarır.'),
  /** Aktaranların koridor hatlarına (J40/J41/J42X) ve yönlere dağılımı */
  corridorShareByDirection: assume({ north: 0.25, south: 0.25 }, 'Aktaranların yarısı kuzeye, yarısı güneye; her yönde trenlerin yarısı koridor hatlarıdır.'),
};

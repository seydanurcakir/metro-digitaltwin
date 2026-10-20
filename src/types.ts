// Metro İkizi — veri modeli tipleri (Adım 1).
// Arayüz kodu yok. Her sayı bir kaynağa (Provenance) bağlanır.

/** Bir sayının nereden geldiği. */
export type ProvenanceKind =
  | 'published' // resmi yayından alınmış değer (ör. SL yıllık raporu)
  | 'derived' // yayınlanmış değerlerden hesaplanmış
  | 'assumption' // makul varsayım, gerçek değerle değiştirilmeli
  | 'synthetic'; // modelin ürettiği sentetik veri

export interface Provenance {
  kind: ProvenanceKind;
  /** sources.ts içindeki kaynak anahtarı */
  ref: string;
  note?: string;
}

/** Kaynağıyla birlikte bir değer. */
export interface Sourced<T> {
  value: T;
  src: Provenance;
}

/** Metro (T) ve pendeltåg (J) hatları */
export type LineId = 'T13' | 'T14' | 'J40' | 'J41' | 'J42X' | 'J43' | 'J43X' | 'J44';
export type LineMode = 'metro' | 'commuter';

/** Hat dizisinde artan sıra = north. T14: Mörby centrum yönü; pendeltåg koridoru: Solna/Ulriksdal yönü */
export type Direction = 'north' | 'south';
export const DIRECTIONS: Direction[] = ['north', 'south'];

export interface Platform {
  /** Bekleme için kullanılabilir peron alanı (m²), her iki yön toplamı */
  usableAreaM2: Sourced<number>;
  /** Ada perondaki alanın bir yöne düşen payı */
  areaShareByDirection: Sourced<number>;
  lengthM: Sourced<number>;
}

export interface Station {
  id: string;
  name: string;
  /** Hat üzerindeki sıra (0'dan başlar) */
  order: number;
  isTerminal: boolean;
  servedBy: LineId[];
  /** Başka hatlarla paylaşılan ortak gövdede mi (T14: T13 ile; koridor: Citybanan) */
  onTrunk: boolean;
  /** İstasyonun bu ulaşım türündeki kış iş günü ortalama günlük binişi */
  boardingsPerDay: Sourced<number>;
  /** Bu binişlerin modellenen hattın trenlerine düşen payı */
  lineShare: Sourced<number>;
  /** Koridor sınırını temsil eden sanal düğüm: koridor dışından gelen/giden yolcu. Ölçütlerden çıkarılır. */
  isBoundary?: boolean;
  /** Peronda bekleme süresi (kapılar açık) */
  dwellSec: Sourced<number>;
  platform: Platform;
}

export interface Segment {
  from: string;
  to: string;
  /** İki istasyon arası yolculuk süresi (bekleme hariç) */
  runTimeSec: Sourced<number>;
}

export interface Line {
  id: LineId;
  /** Koridorda birden çok hat aynı rayı kullanır (ör. J40, J41, J42X) */
  lineIds?: LineId[];
  mode?: LineMode;
  name: string;
  color: string;
  stations: Station[];
  segments: Segment[];
  /** Son durakta dönüş süresi */
  turnaroundSec: Sourced<number>;
  trunk: {
    fromStationId: string;
    toStationId: string;
    /** Ortak gövdede saatte en fazla tren (tüm hatlar toplamı) */
    maxTrainsPerHour: Sourced<number>;
  };
}

export interface TrainUnitType {
  id: string;
  seats: Sourced<number>;
  standing: Sourced<number>;
  lengthM: Sourced<number>;
}

export interface Fleet {
  unitType: TrainUnitType;
  /** Bir trende izin verilen ünite sayıları (kısa / uzun tren) */
  allowedUnitsPerTrain: Sourced<number[]>;
  /** Bu hatta ayrılabilen toplam ünite sayısı */
  unitsAvailable: Sourced<number>;
}

/** 15 dakikalık zaman dilimi */
export interface TimeSlot {
  index: number;
  /** Gün başından dakika (05:00 = 300). 24:00 sonrası 1440+ olabilir. */
  startMin: number;
  label: string;
}

export interface DemandProfile {
  slotMinutes: number;
  slots: TimeSlot[];
  /** Günlük talebin her dilime düşen payı; toplam = 1 */
  shares: number[];
  src: Provenance;
}

/** Bir dilimde bir istasyondan bir yöne perona gelen yolcu sayısı */
export interface DemandCell {
  slotIndex: number;
  stationId: string;
  direction: Direction;
  arrivals: number;
}

/** Talep dönemi: sabah zirvesi merkeze, akşam zirvesi merkezden dışarı ağırlıklı */
export type OdPeriod = 'am' | 'pm' | 'base';

/** Bir istasyondan binen yolcuların varış istasyonlarına dağılımı */
export interface OdRow {
  period: OdPeriod;
  originId: string;
  direction: Direction;
  /** destinationId -> pay; toplam = 1 */
  destinationShares: Record<string, number>;
}

export interface Demand {
  profile: DemandProfile;
  cells: DemandCell[];
  od: OdRow[];
  /** Her dilimin talep dönemi */
  periodBySlot: OdPeriod[];
  /** Yön dengesizliği katsayıları */
  directionalBias: Sourced<{ am: number; pm: number; centerStationId: string }>;
  src: Provenance;
}

/** Sefer planında bir dilim için karar */
export interface PlanSlot {
  slotIndex: number;
  /** İki tren arası süre (dakika) */
  headwayMin: number;
  /** Trendeki C20 ünitesi sayısı */
  unitsPerTrain: number;
}

export interface ServicePlan {
  id: string;
  name: string;
  kind: 'current' | 'candidate';
  slots: PlanSlot[];
  src: Provenance;
}

/** Diğer hattın (T13) ortak gövdede kullandığı tren sayısı */
export interface OtherLineService {
  lineId: LineId;
  /** dilim indeksi -> saatte tren */
  trainsPerHourBySlot: number[];
  src: Provenance;
}

export interface Constraints {
  minHeadwayMin: Sourced<number>;
  maxHeadwayMin: Sourced<number>;
  /** Vagon doluluğu sınırı (kapasiteye oran) */
  maxLoadFactor: Sourced<number>;
  /** Peronda güvenli yoğunluk sınırı (kişi/m²) */
  platformDensityLimit: Sourced<number>;
}

/** Simülasyonun her plan için üreteceği ölçütler (Adım 2'de hesaplanır) */
export interface Kpis {
  /** Ana ölçüt: perona gelenlerin %90'ının trene binip perondan ayrılma süresi (sn) */
  dispersionP90Sec: number;
  /** En yüksek vagon doluluğu (0–1+) */
  peakLoadFactor: number;
  /** Ortalama peron bekleme süresi (sn) */
  avgWaitSec: number;
  /** En yüksek peron yoğunluğu (kişi/m²) */
  maxPlatformDensity: number;
  /** Trene sığamayıp bir sonrakini bekleyen yolcu sayısı */
  leftBehind: number;
}

export interface SourceRef {
  id: string;
  title: string;
  url?: string;
  note?: string;
}

export interface TwinDataset {
  line: Line;
  fleet: Fleet;
  demand: Demand;
  plans: ServicePlan[];
  otherLine: OtherLineService;
  constraints: Constraints;
  sources: SourceRef[];
}

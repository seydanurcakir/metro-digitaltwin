import type { Line, Platform, Segment, Sourced, Station } from '../types';
import { SCALE_2019_TO_2022 } from './sources';

const pub2022 = (v: number): Sourced<number> => ({
  value: v,
  src: { kind: 'published', ref: 'sl-fakta-2022', note: 'İstasyon yalnızca Kırmızı Hat ile hizmet alıyor; istasyon toplamı = Kırmızı Hat.' },
});

const scaled2019 = (v2019: number): Sourced<number> => ({
  value: Math.round(v2019 * SCALE_2019_TO_2022),
  src: {
    kind: 'derived',
    ref: 'wiki-red-line',
    note: `2019 Kırmızı Hat değeri ${v2019} × 0,72 (2022/2019 metro toplam oranı). Aktarma istasyonu: yalnız Kırmızı Hat binişi.`,
  },
});

const assume = (v: number, note: string): Sourced<number> => ({ value: v, src: { kind: 'assumption', ref: 'assumption', note } });

const platform = (major: boolean): Platform => ({
  usableAreaM2: assume(major ? 900 : 600, 'Ada peron, ~145 m uzunluk; kenar güvenlik şeritleri ve merdivenler hariç bekleme alanı tahmini.'),
  areaShareByDirection: assume(0.5, 'Ada peronda iki yön alanı eşit paylaşır.'),
  lengthM: assume(145, '3 ünitelik C20 treni (3 × 46,5 m) alacak uzunluk.'),
});

type Row = [id: string, name: string, boardings: Sourced<number>, major: boolean];

// Fruängen'den Mörby centrum'a sırayla.
const ROWS: Row[] = [
  ['fruangen', 'Fruängen', pub2022(6_700), false],
  ['vastertorp', 'Västertorp', pub2022(3_200), false],
  ['hagerstensasen', 'Hägerstensåsen', pub2022(4_700), false],
  ['telefonplan', 'Telefonplan', pub2022(8_000), false],
  ['midsommarkransen', 'Midsommarkransen', pub2022(4_400), false],
  ['liljeholmen', 'Liljeholmen', scaled2019(36_350), true],
  ['hornstull', 'Hornstull', scaled2019(18_500), false],
  ['zinkensdamm', 'Zinkensdamm', pub2022(5_500), false],
  ['mariatorget', 'Mariatorget', scaled2019(17_100), false],
  ['slussen', 'Slussen', scaled2019(39_550), true],
  ['gamla-stan', 'Gamla stan', scaled2019(15_650), false],
  ['t-centralen', 'T-Centralen', scaled2019(88_750), true],
  ['ostermalmstorg', 'Östermalmstorg', scaled2019(38_550), true],
  ['stadion', 'Stadion', pub2022(7_000), false],
  ['tekniska-hogskolan', 'Tekniska högskolan', scaled2019(25_750), false],
  ['universitetet', 'Universitetet', pub2022(7_200), false],
  ['bergshamra', 'Bergshamra', pub2022(4_200), false],
  ['danderyds-sjukhus', 'Danderyds sjukhus', pub2022(10_500), false],
  ['morby-centrum', 'Mörby centrum', pub2022(5_400), false],
];

const TRUNK_FROM = 5; // Liljeholmen
const TRUNK_TO = 12; // Östermalmstorg

const stations: Station[] = ROWS.map(([id, name, boardings, major], order) => {
  const onTrunk = order >= TRUNK_FROM && order <= TRUNK_TO;
  return {
    id,
    name,
    order,
    isTerminal: order === 0 || order === ROWS.length - 1,
    servedBy: onTrunk ? ['T13', 'T14'] : ['T14'],
    onTrunk,
    redLineBoardingsPerDay: boardings,
    t14Share: onTrunk
      ? assume(0.5, 'Ortak gövdede T13 ve T14 eşit sıklıkta; binişlerin yarısı T14 trenlerine.')
      : { value: 1, src: { kind: 'derived', ref: 'wiki-red-line', note: 'İstasyona yalnız T14 uğruyor.' } },
    dwellSec: assume(major ? 45 : 30, major ? 'Büyük aktarma istasyonu, uzun kapı açık süresi.' : 'Standart kapı açık süresi.'),
    platform: platform(major),
  };
});

// İstasyonlar arası yolculuk süreleri (sn). Gerçek tarife (GTFS) ile değiştirilmeli.
const RUN_TIMES = [90, 75, 90, 75, 120, 120, 75, 75, 90, 60, 75, 90, 75, 75, 150, 120, 105, 90];

const segments: Segment[] = RUN_TIMES.map((sec, i) => ({
  from: stations[i].id,
  to: stations[i + 1].id,
  runTimeSec: assume(sec, 'Tahmini; Trafiklab GTFS tarifesiyle doğrulanmalı.'),
}));

export const LINE_T14: Line = {
  id: 'T14',
  name: 'Röda linjen T14 · Fruängen – Mörby centrum',
  color: '#D2382F',
  stations,
  segments,
  turnaroundSec: assume(240, 'Son durakta dönüş ve sürücü/sistem hazırlığı.'),
  trunk: {
    fromStationId: stations[TRUNK_FROM].id,
    toStationId: stations[TRUNK_TO].id,
    maxTrainsPerHour: {
      value: 24,
      src: { kind: 'published', ref: 'wiki-red-line', note: 'Zirvede Östermalmstorg–Liljeholmen arası 2,5 dakikada bir tren.' },
    },
  },
};

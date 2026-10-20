// İnceleme paneli için saf hesaplar. Her sayı simülasyon sonucundan ya da veri modelinden gelir.
import type { Direction, Provenance, SimResult, TwinDataset } from '../../src/index';
import { APPROACH_SEC, arrivalsBetween, platformAt, type StationView } from './selectors';

export const tripCode = (id: number) => `14-${String(id + 1).padStart(3, '0')}`;
export const directionName = (d: Direction) => (d === 'north' ? 'Mörby centrum' : 'Fruängen');

export interface TripStop {
  order: number;
  name: string;
  arrive: number;
  depart: number;
  loadFactor: number;
  boarded: number;
  alighted: number;
}

export interface TripDetail {
  code: string;
  direction: Direction;
  units: number;
  capacity: number;
  stops: TripStop[];
  /** Trenin t anındaki yeri: durakta (atIndex) ya da iki durak arasında (fromIndex → fromIndex+1) */
  where: { kind: 'before' } | { kind: 'at'; index: number } | { kind: 'between'; fromIndex: number; progress: number } | { kind: 'done' };
  /** Seçili istasyondaki durumu */
  focus: { status: 'yolda' | 'yaklaşıyor' | 'peronda' | 'kalkıyor' | 'geçti'; stop: TripStop };
  peak: TripStop;
}

export function tripDetail(ds: TwinDataset, r: SimResult, view: StationView, tripId: number, t: number): TripDetail | null {
  const trip = r.trips.find((x) => x.id === tripId);
  if (!trip) return null;
  const evs = new Map(r.events.filter((e) => e.tripId === tripId).map((e) => [e.stationOrder, e]));
  const stops: TripStop[] = trip.stops.map((s) => {
    const st = ds.line.stations[s.stationOrder];
    const e = evs.get(s.stationOrder)!;
    return {
      order: s.stationOrder, name: st.name, arrive: s.t, depart: s.t + (st.isTerminal ? 0 : st.dwellSec.value),
      loadFactor: e.loadAfter / e.capacity, boarded: e.boarded, alighted: e.alighted,
    };
  });
  let where: TripDetail['where'];
  if (t < stops[0].arrive) where = { kind: 'before' };
  else if (t > stops[stops.length - 1].arrive) where = { kind: 'done' };
  else {
    const i = stops.findIndex((s) => t >= s.arrive && t <= s.depart);
    if (i >= 0) where = { kind: 'at', index: i };
    else {
      const j = stops.findIndex((s, k) => k < stops.length - 1 && t > s.depart && t < stops[k + 1].arrive);
      where = { kind: 'between', fromIndex: j, progress: (t - stops[j].depart) / (stops[j + 1].arrive - stops[j].depart) };
    }
  }
  const fs = stops.find((s) => s.order === view.order)!;
  const status: TripDetail['focus']['status'] =
    t < fs.arrive - APPROACH_SEC ? 'yolda' : t < fs.arrive ? 'yaklaşıyor' : t <= fs.depart ? 'peronda' : t <= fs.depart + APPROACH_SEC ? 'kalkıyor' : 'geçti';
  const peak = stops.slice(0, -1).reduce((a, b) => (b.loadFactor > a.loadFactor ? b : a));
  return { code: tripCode(trip.id), direction: trip.direction, units: trip.units, capacity: trip.capacity, stops, where, focus: { status, stop: fs }, peak };
}

export interface SideDetail {
  direction: Direction;
  count: number;
  /** Bu yöne ayrılan peron alanına göre yoğunluk */
  density: number;
  areaM2: number;
  next: { tripId: number; code: string; eta: number; units: number; capacity: number; loadFactor: number; boarded: number; leftBehind: number }[];
  series: number[];
  seriesStepSec: number;
}

export function sideDetail(ds: TwinDataset, view: StationView, dir: Direction, t: number): SideDetail {
  const st = ds.line.stations[view.order];
  const area = st.platform.usableAreaM2.value * st.platform.areaShareByDirection.value;
  const p = platformAt(view, t);
  const count = dir === 'north' ? p.north : p.south;
  const next = view.calls
    .filter((c) => c.direction === dir && c.depart >= t)
    .slice(0, 3)
    .map((c) => ({ tripId: c.tripId, code: tripCode(c.tripId), eta: Math.max(0, c.arrive - t), units: c.units, capacity: c.capacity, loadFactor: c.loadFactor, boarded: c.boarded, leftBehind: c.leftBehind }));
  const step = 30;
  const n = 60; // son 30 dakika
  const series = Array.from({ length: n + 1 }, (_, i) => {
    const q = platformAt(view, t - (n - i) * step);
    return dir === 'north' ? q.north : q.south;
  });
  return { direction: dir, count, density: count / area, areaM2: area, next, series, seriesStepSec: step };
}

export interface EscalatorDetail {
  name: string;
  /** Perona inen (dakikada kişi) */
  downPerMin: number;
  /** Perondan çıkan (dakikada kişi), son 5 dakika ortalaması */
  upPerMin: number;
  share: number;
}

export function escalatorDetail(view: StationView, index: number, count: number, t: number): EscalatorDetail {
  const share = 1 / count;
  const down = (arrivalsBetween(view, 0, t - 60, t) + arrivalsBetween(view, 1, t - 60, t)) * share;
  const alighted = view.calls.filter((c) => c.arrive <= t && c.arrive > t - 300).reduce((a, c) => a + c.alighted, 0);
  return { name: index === 0 ? 'Batı ucu (Gamla stan yönü)' : 'Doğu ucu (Östermalmstorg yönü)', downPerMin: down, upPerMin: (alighted / 5) * share, share };
}

export interface FactRow {
  label: string;
  value: string;
  src: Provenance;
}

export function stationFacts(ds: TwinDataset, view: StationView): FactRow[] {
  const st = ds.line.stations[view.order];
  const fmt = (n: number) => Math.round(n).toLocaleString('tr-TR');
  return [
    { label: 'Kırmızı Hat günlük biniş', value: fmt(st.boardingsPerDay.value), src: st.boardingsPerDay.src },
    { label: 'T14 payı', value: `%${Math.round(st.lineShare.value * 100)}`, src: st.lineShare.src },
    { label: 'Peron uzunluğu', value: `${st.platform.lengthM.value} m`, src: st.platform.lengthM.src },
    { label: 'Bekleme alanı', value: `${fmt(st.platform.usableAreaM2.value)} m²`, src: st.platform.usableAreaM2.src },
    { label: 'Kapı açık süresi', value: `${st.dwellSec.value} sn`, src: st.dwellSec.src },
    { label: 'Güvenli yoğunluk sınırı', value: `${ds.constraints.platformDensityLimit.value.toLocaleString('tr-TR')} kişi/m²`, src: ds.constraints.platformDensityLimit.src },
  ];
}

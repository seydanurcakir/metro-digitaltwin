// Ağ katmanı: istasyonlar düğüm, ray bölümleri ve aktarma geçitleri kenar.
// Her hat kendi veri setinde (Line) tutulur; ağ bunları ve hatlar arası aktarmaları birbirine bağlar.

import type { Line, LineId, LineMode, ServicePlan, Sourced } from '../types';
import { SERVICE_START_MIN, SLOT_MINUTES } from '../data/time';

export interface NetworkNode {
  id: string;
  name: string;
  mode: LineMode;
  /** Bu düğüme uğrayan hatlar */
  lines: LineId[];
  /** Hangi hat veri setinde tanımlı */
  lineKey: string;
  boardingsPerDay: Sourced<number>;
  platform: { lengthM: Sourced<number>; usableAreaM2: Sourced<number>; type: 'ada' };
  dwellSec: Sourced<number>;
  isBoundary: boolean;
}

export interface Signalling {
  system: Sourced<string>;
  /** İki tren arasındaki en kısa süre */
  minHeadwaySec: Sourced<number>;
}

export interface NetworkEdge {
  id: string;
  from: string;
  to: string;
  kind: 'track' | 'transfer';
  lineKey?: string;
  lines: LineId[];
  travelTimeSec: Sourced<number>;
  /** Ray kenarı: yön başına saatte en fazla tren; aktarma kenarı: yön başına saatte yolcu */
  capacity?: { trainsPerHour?: Sourced<number>; paxPerHour?: Sourced<number> };
  signalling?: Signalling;
  /** Kenar iki yönde de kullanılabilir */
  bidirectional: true;
}

export interface LineEntry {
  key: string;
  line: Line;
  plan: ServicePlan;
  /** Ortak gövdedeki ray kenarlarının sinyalizasyonu */
  trunkSignalling?: Signalling;
  /** Gövde dışındaki ray kenarlarının sinyalizasyonu */
  signalling?: Signalling;
}

export interface Network {
  nodes: Map<string, NetworkNode>;
  edges: NetworkEdge[];
  lines: Map<string, LineEntry>;
}

export interface TransferSpec {
  id: string;
  from: string;
  to: string;
  walkSec: Sourced<number>;
  capacityPaxPerHour: Sourced<number>;
}

export function buildNetwork(lines: LineEntry[], transfers: TransferSpec[]): Network {
  const nodes = new Map<string, NetworkNode>();
  const edges: NetworkEdge[] = [];
  for (const e of lines) {
    const { line } = e;
    const mode: LineMode = line.mode ?? 'metro';
    const trunkFrom = line.stations.find((s) => s.id === line.trunk.fromStationId)!.order;
    const trunkTo = line.stations.find((s) => s.id === line.trunk.toStationId)!.order;
    for (const s of line.stations) {
      if (nodes.has(s.id)) throw new Error(`Düğüm iki kez tanımlandı: ${s.id}`);
      nodes.set(s.id, {
        id: s.id, name: s.name, mode, lines: s.servedBy, lineKey: e.key,
        boardingsPerDay: s.boardingsPerDay,
        platform: { lengthM: s.platform.lengthM, usableAreaM2: s.platform.usableAreaM2, type: 'ada' },
        dwellSec: s.dwellSec, isBoundary: !!s.isBoundary,
      });
    }
    line.segments.forEach((g, i) => {
      const onTrunk = i >= trunkFrom && i < trunkTo;
      const signalling = onTrunk ? e.trunkSignalling : e.signalling;
      const boundary = line.stations[i].isBoundary || line.stations[i + 1].isBoundary;
      // Gövde dışında kapasite, sinyalizasyonun izin verdiği en kısa aralıktan türetilir
      const capacity = onTrunk
        ? { trainsPerHour: line.trunk.maxTrainsPerHour }
        : signalling && !boundary
          ? { trainsPerHour: { value: Math.floor(3600 / signalling.minHeadwaySec.value), src: { kind: 'derived' as const, ref: signalling.minHeadwaySec.src.ref, note: `3600 / ${signalling.minHeadwaySec.value} sn en kısa aralık (teorik üst sınır).` } } }
          : undefined;
      edges.push({
        id: `${e.key}:${g.from}-${g.to}`, from: g.from, to: g.to, kind: 'track', lineKey: e.key,
        lines: line.lineIds ?? [line.id], travelTimeSec: g.runTimeSec,
        capacity,
        signalling: boundary ? undefined : signalling,
        bidirectional: true,
      });
    });
  }
  for (const t of transfers) {
    if (!nodes.has(t.from) || !nodes.has(t.to)) throw new Error(`Aktarma düğümü yok: ${t.id}`);
    edges.push({
      id: t.id, from: t.from, to: t.to, kind: 'transfer', lines: [], travelTimeSec: t.walkSec,
      capacity: { paxPerHour: t.capacityPaxPerHour }, bidirectional: true,
    });
  }
  return { nodes, edges, lines: new Map(lines.map((l) => [l.key, l])) };
}

/** Bir hattın t anındaki sefer aralığı (dk) */
export function headwayAt(entry: LineEntry, t: number): number {
  const i = Math.max(0, Math.min(entry.plan.slots.length - 1, Math.floor((t - SERVICE_START_MIN * 60) / (SLOT_MINUTES * 60))));
  return entry.plan.slots[i].headwayMin;
}

export interface RouteLeg {
  kind: 'walk' | 'wait' | 'ride' | 'dwell';
  from: string;
  to: string;
  sec: number;
  lineKey?: string;
}

export interface Route {
  from: string;
  to: string;
  totalSec: number;
  legs: RouteLeg[];
}

/**
 * t anında yola çıkan bir yolcu için en kısa güzergâh (Dijkstra).
 * Bir hatta binerken beklenen bekleme = sefer aralığının yarısı; ara duraklarda tren bekleme süresi eklenir.
 * Sanal sınır düğümleri güzergâhta kullanılmaz.
 */
export function route(net: Network, from: string, to: string, t: number): Route | null {
  type State = { node: string; line: string | null };
  const key = (s: State) => `${s.node}|${s.line ?? ''}`;
  const dist = new Map<string, number>();
  const prev = new Map<string, { state: State; leg: RouteLeg[] }>();
  const start: State = { node: from, line: null };
  dist.set(key(start), 0);
  const open: State[] = [start];
  while (open.length) {
    open.sort((a, b) => dist.get(key(a))! - dist.get(key(b))!);
    const cur = open.shift()!;
    const d = dist.get(key(cur))!;
    if (cur.node === to) {
      const legs: RouteLeg[] = [];
      for (let k = key(cur); prev.has(k); ) {
        const p = prev.get(k)!;
        legs.unshift(...p.leg);
        k = key(p.state);
      }
      return { from, to, totalSec: d, legs };
    }
    for (const e of net.edges) {
      const dirOk = e.from === cur.node || e.to === cur.node;
      if (!dirOk) continue;
      const nxt = e.from === cur.node ? e.to : e.from;
      if (net.nodes.get(nxt)!.isBoundary) continue;
      const legs: RouteLeg[] = [];
      let cost = 0;
      let line: string | null = null;
      if (e.kind === 'transfer') {
        legs.push({ kind: 'walk', from: cur.node, to: nxt, sec: e.travelTimeSec.value });
        cost += e.travelTimeSec.value;
      } else {
        line = e.lineKey!;
        if (cur.line !== line) {
          const w = (headwayAt(net.lines.get(line)!, t + d) * 60) / 2;
          legs.push({ kind: 'wait', from: cur.node, to: cur.node, sec: w, lineKey: line });
          cost += w;
        } else {
          const dw = net.nodes.get(cur.node)!.dwellSec.value;
          legs.push({ kind: 'dwell', from: cur.node, to: cur.node, sec: dw, lineKey: line });
          cost += dw;
        }
        legs.push({ kind: 'ride', from: cur.node, to: nxt, sec: e.travelTimeSec.value, lineKey: line });
        cost += e.travelTimeSec.value;
      }
      const ns: State = { node: nxt, line };
      const nk = key(ns);
      if (d + cost < (dist.get(nk) ?? Infinity)) {
        dist.set(nk, d + cost);
        prev.set(nk, { state: cur, leg: legs });
        if (!open.some((o) => key(o) === nk)) open.push(ns);
      }
    }
  }
  return null;
}

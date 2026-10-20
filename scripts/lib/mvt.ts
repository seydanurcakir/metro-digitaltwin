// Minimal Mapbox Vector Tile encoder for tests and the local test tile server (scripts/tile-server.ts).
// Not used by the app, which only decodes tiles.
import { PbfWriter } from 'pbf';

export type Coord = [number, number];
export interface EncFeature {
  /** 1 point, 2 line, 3 polygon */
  type: 1 | 2 | 3;
  /** Parts: points, line strings or rings (rings without the closing point) in tile units */
  geom: Coord[][];
  props: Record<string, string | number | boolean>;
}

const zig = (n: number) => (n << 1) ^ (n >> 31);

function geometry(f: EncFeature): number[] {
  const out: number[] = [];
  let cx = 0, cy = 0;
  for (const part of f.geom) {
    if (!part.length) continue;
    const pts = part.map(([x, y]) => [Math.round(x), Math.round(y)] as Coord);
    out.push((1 & 7) | (1 << 3));
    out.push(zig(pts[0][0] - cx), zig(pts[0][1] - cy));
    cx = pts[0][0]; cy = pts[0][1];
    if (pts.length > 1) {
      out.push((2 & 7) | ((pts.length - 1) << 3));
      for (let i = 1; i < pts.length; i++) {
        out.push(zig(pts[i][0] - cx), zig(pts[i][1] - cy));
        cx = pts[i][0]; cy = pts[i][1];
      }
    }
    if (f.type === 3) out.push((7 & 7) | (1 << 3));
  }
  return out;
}

export function encodeTile(layers: Record<string, EncFeature[]>, extent = 4096): Uint8Array {
  const pbf = new PbfWriter();
  for (const [name, feats] of Object.entries(layers)) {
    const keys: string[] = [], values: (string | number | boolean)[] = [];
    const ki = new Map<string, number>(), vi = new Map<string, number>();
    const tagsOf = (props: EncFeature['props']) => {
      const tags: number[] = [];
      for (const [k, v] of Object.entries(props)) {
        if (!ki.has(k)) { ki.set(k, keys.length); keys.push(k); }
        const vk = `${typeof v}:${v}`;
        if (!vi.has(vk)) { vi.set(vk, values.length); values.push(v); }
        tags.push(ki.get(k)!, vi.get(vk)!);
      }
      return tags;
    };
    const encoded = feats.map((f) => ({ tags: tagsOf(f.props), type: f.type, geom: geometry(f) }));
    pbf.writeMessage(3, (_: unknown, p: PbfWriter) => {
      p.writeVarintField(15, 2);
      p.writeStringField(1, name);
      for (const e of encoded) {
        p.writeMessage(2, (_2: unknown, q: PbfWriter) => {
          q.writePackedVarint(2, e.tags);
          q.writeVarintField(3, e.type);
          q.writePackedVarint(4, e.geom);
        }, null);
      }
      for (const k of keys) p.writeStringField(3, k);
      for (const v of values) {
        p.writeMessage(4, (_3: unknown, q: PbfWriter) => {
          if (typeof v === 'string') q.writeStringField(1, v);
          else if (typeof v === 'boolean') q.writeBooleanField(7, v);
          else if (Number.isInteger(v) && v >= 0) q.writeVarintField(5, v);
          else q.writeDoubleField(3, v);
        }, null);
      }
      p.writeVarintField(5, extent);
    }, null);
  }
  return pbf.finish();
}

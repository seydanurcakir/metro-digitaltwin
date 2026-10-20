// Live detail panel for the selected object. All values come from the pure functions in inspect.ts.
import type { ReactNode } from 'react';
import type { Direction, ProvenanceKind, SimResult } from '../../src/index';
import { useTwin, useLineData, type LineData } from '../twin/store';
import { escalatorDetail, sideDetail, stationFacts, tripDetail, whereText, type TripDetail } from '../twin/inspect';
import { buildStationView, fmtClock, fmtDec, fmtInt, fmtSecs, pct, platformAt, nextArrivals, type StationView } from '../twin/selectors';
import { LINES, TWINS, twinOfStation, type LineKey, type TwinId } from '../twin/world';
import { trainPose } from '../twin/trainpose';
import { loadColor } from '../scene/palette';
import { CAM } from '../scene/cam';

const KIND_LABEL: Record<ProvenanceKind, string> = { published: 'Published', derived: 'Derived', assumption: 'Assumption', synthetic: 'Synthetic' };

function Panel({ icon, title, sub, pill, pillTone = 'info', tone, children }: { icon: ReactNode; title: string; sub: string; pill?: string; pillTone?: 'info' | 'ok' | 'warn'; tone?: 'commuter'; children: ReactNode }) {
  const select = useTwin.getState().select;
  return (
    <section className="pane" aria-label={`${title} details`}>
      <header className="insp-head">
        <span className={`insp-icon ${tone ?? ''}`} aria-hidden="true">{icon}</span>
        <div className="insp-title">
          <h2>{title}</h2>
          <p className="muted">{sub}</p>
          {pill && <span className={`pill ${pillTone}`}>{pill}</span>}
        </div>
        <button type="button" id="inspector-close" className="icon-btn" aria-label="Close panel" onClick={() => select(null)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6 L18 18 M18 6 L6 18" /></svg>
        </button>
      </header>
      {children}
    </section>
  );
}

const TrainIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="3" width="14" height="14" rx="3" /><path d="M5 11 H19 M8 20 L6 22 M16 20 L18 22" /></svg>
);
const PlatformIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="7" r="2" /><circle cx="16" cy="7" r="2" /><path d="M5 20 V13 a3 3 0 0 1 6 0 V20 M13 20 V13 a3 3 0 0 1 6 0 V20" /></svg>
);
const StairsIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 20 H7 V16 H11 V12 H15 V8 H21" /></svg>
);
const StationIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20 H20 M6 20 V9 L12 5 L18 9 V20 M10 20 V14 H14 V20" /></svg>
);

function Stat({ label, value, sub, tone, text }: { label: string; value: string; sub?: string; tone?: 'warn'; text?: boolean }) {
  return (
    <div className="mini">
      <span className="label">{label}</span>
      <span className={`mini-val ${text ? 'text' : 'num'} ${tone === 'warn' ? 'warn' : ''}`}>{value}</span>
      {sub && <span className="muted mini-sub">{sub}</span>}
    </div>
  );
}

/** Load on departure from every stop along the line; 90% limit and the train's position marked */
function LoadProfile({ d, limit }: { d: TripDetail; limit: number }) {
  const W = 320, H = 112, top = 10, base = 78;
  const stops = d.stops.filter((s) => !s.virtual);
  const bw = W / stops.length;
  const y = (lf: number) => base - Math.min(1, lf) * (base - top);
  const idx = (i: number) => stops.indexOf(d.stops[i]);
  let here: number | null = null;
  if (d.where.kind === 'at' && !d.stops[d.where.index].virtual) here = (idx(d.where.index) + 0.5) * bw;
  if (d.where.kind === 'between') {
    const a = idx(d.where.fromIndex), b = idx(d.where.fromIndex + 1);
    if (a >= 0 && b >= 0) here = (a + 0.5 + d.where.progress) * bw;
    else if (b >= 0) here = (b + 0.5 - (1 - d.where.progress) * 0.5) * bw;
    else if (a >= 0) here = (a + 0.5 + d.where.progress * 0.5) * bw;
  }
  const focusIdx = d.focus ? stops.findIndex((s) => s.order === d.focus!.stop.order) : -1;
  return (
    <figure className="chart">
      <figcaption className="label">Load along the line (on departure)</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`Highest load ${pct(d.peak.loadFactor)}, departing ${d.peak.name}`}>
        <line x1="0" x2={W} y1={base} y2={base} stroke="var(--border)" />
        <line x1="0" x2={W} y1={y(limit)} y2={y(limit)} stroke="var(--warn)" strokeDasharray="4 3" />
        <text x={W - 2} y={y(limit) - 4} textAnchor="end" className="axis">{pct(limit)} limit</text>
        {stops.map((s, i) => (
          <rect key={s.order} x={i * bw + 1.5} y={y(s.loadFactor)} width={bw - 3} height={Math.max(0.5, base - y(s.loadFactor))}
            rx="1.5" fill={i === focusIdx ? 'var(--accent)' : loadColor(s.loadFactor)} opacity={i === focusIdx ? 1 : 0.75} />
        ))}
        {here != null && <path d={`M${here - 5} ${top - 8} L${here + 5} ${top - 8} L${here} ${top - 1} Z`} fill="var(--fg)" />}
        <text x="1" y={base + 14} className="axis">{stops[0].name}</text>
        <text x={W - 1} y={base + 14} textAnchor="end" className="axis">{stops[stops.length - 1].name}</text>
        {focusIdx >= 0 && <text x={Math.min(W - 40, Math.max(40, (focusIdx + 0.5) * bw))} y={base + 28} textAnchor="middle" className="axis strong">{stops[focusIdx].name}</text>}
      </svg>
    </figure>
  );
}

function TrainPanel({ line, tripId }: { line: LineKey; tripId: number }) {
  const t = useTwin((s) => Math.floor(s.t));
  const ld = useLineData(line);
  const following = useTwin((s) => s.follow?.line === line && s.follow.tripId === tripId);
  const { setFollow, flyTo } = useTwin.getState();
  const L = LINES[line];
  const tw = TWINS[L.twin];
  const d = tripDetail(L, ld.ds, ld.result, tripId, t, tw.stationId);
  if (!d) return null;
  const limit = ld.ds.constraints.maxLoadFactor.value;
  const tone = d.focus?.status === 'at the platform' ? 'ok' : 'info';
  const real = d.stops.filter((s) => !s.virtual);
  const lastDone = [...real].reverse().find((s) => s.depart <= t);
  const lf = lastDone ? lastDone.loadFactor : 0;
  const center = d.where.kind === 'at' ? d.where.index : d.where.kind === 'between' ? d.where.fromIndex + 1 : d.where.kind === 'done' ? d.stops.length - 1 : 0;
  const centerReal = Math.max(0, real.findIndex((s) => s.order === d.stops[Math.min(center, d.stops.length - 1)].order));
  const from = Math.max(0, Math.min(centerReal - 1, real.length - 5));
  const shown = real.slice(from, from + 5);
  const showOnMap = () => {
    const trip = ld.result.trips.find((x) => x.id === tripId);
    const p = trip ? trainPose(line, trip, t) : null;
    if (p) flyTo(p.x, p.z, Math.max(CAM.zoom, 1.4));
  };
  return (
    <Panel
      icon={<TrainIcon />} tone={line === 'PENDEL' ? 'commuter' : undefined}
      title={`Train ${d.code}`} sub={`${L.short} → ${L.dirName[d.direction]} · ${d.units} × ${L.unit} · ${fmtInt(d.capacity)} places`}
      pill={d.focus ? `${tw.name}: ${d.focus.status}` : undefined} pillTone={tone}
    >
      <div className="mini-grid">
        <Stat label="Now" value={whereText(d)} text />
        <Stat label="Next stop" value={d.next ? fmtSecs(d.next.inSec) : '–'} sub={d.next?.stop.name ?? 'end of trip'} />
        <Stat label="Load" value={pct(lf)} sub={`limit ${pct(limit)}`} tone={lf > limit ? 'warn' : undefined} />
      </div>
      <div className="btn-row">
        <button type="button" id="train-follow" className={`btn small ${following ? 'primary' : ''}`} aria-pressed={following} onClick={() => setFollow(following ? null : { line, tripId })}>
          {following ? 'Following on map' : 'Follow on map'}
        </button>
        <button type="button" id="train-show" className="btn small" onClick={showOnMap}>Show on map</button>
      </div>
      <LoadProfile d={d} limit={limit} />
      <ol className="stops">
        {shown.map((s) => {
          const state = s.depart < t ? 'past' : s.arrive <= t ? 'now' : 'next';
          return (
            <li key={s.order} className={state}>
              <span className="dot" aria-hidden="true" />
              <span className="stop-name">{s.name}</span>
              <span className="num muted">{fmtClock(s.arrive)}</span>
              <span className="num stop-load" style={{ color: s.loadFactor > limit ? 'var(--warn)' : undefined }}>{pct(s.loadFactor)}</span>
            </li>
          );
        })}
      </ol>
      <p className="note muted">Train numbers are sequence numbers generated by the model.</p>
    </Panel>
  );
}

function Sparkline({ values, stepSec, limit }: { values: number[]; stepSec: number; limit: number }) {
  const W = 320, H = 84, top = 8, base = 62;
  const max = Math.max(10, ...values) * 1.15;
  const showLimit = limit <= max * 1.6;
  const yMax = showLimit ? Math.max(max, limit * 1.08) : max;
  const x = (i: number) => (i / (values.length - 1)) * W;
  const y = (v: number) => base - (v / yMax) * (base - top);
  const line = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const area = `${line} L${W} ${base} L0 ${base} Z`;
  const mins = Math.round(((values.length - 1) * stepSec) / 60);
  return (
    <figure className="chart">
      <figcaption className="label">Last {mins} minutes: people on the platform</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`Now ${fmtInt(values[values.length - 1])} people`}>
        <line x1="0" x2={W} y1={base} y2={base} stroke="var(--border)" />
        {showLimit && (
          <g>
            <line x1="0" x2={W} y1={y(limit)} y2={y(limit)} stroke="var(--warn)" strokeDasharray="4 3" />
            <text x={W - 2} y={y(limit) - 4} textAnchor="end" className="axis">safe limit</text>
          </g>
        )}
        <path d={area} fill="var(--accent)" opacity="0.14" />
        <path d={line} fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinejoin="round" />
        <circle cx={W} cy={y(values[values.length - 1])} r="3.2" fill="var(--accent)" />
        <text x="1" y={base + 15} className="axis">−{mins} min</text>
        <text x={W - 1} y={base + 15} textAnchor="end" className="axis">now</text>
      </svg>
    </figure>
  );
}

function PlatformPanel({ twin, direction }: { twin: TwinId; direction: Direction }) {
  const t = useTwin((s) => Math.floor(s.t));
  const view = useTwin((s) => s.views[twin]);
  const ld = useLineData(TWINS[twin].line);
  const select = useTwin.getState().select;
  const tw = TWINS[twin];
  const L = LINES[tw.line];
  const d = sideDetail(ld.ds, L, view, direction, t);
  const limit = ld.ds.constraints.platformDensityLimit.value;
  const over = d.density >= limit;
  return (
    <Panel icon={<PlatformIcon />} tone={tw.line === 'PENDEL' ? 'commuter' : undefined} title={`Platform · towards ${L.dirName[direction].split(' · ')[0]}`} sub={`${tw.name} · ${fmtInt(d.areaM2)} m² waiting area`} pill={over ? 'Limit exceeded' : 'Normal'} pillTone={over ? 'warn' : 'ok'}>
      <div className="mini-grid">
        <Stat label="Waiting" value={fmtInt(d.count)} sub="people" />
        <Stat label="Density" value={fmtDec(d.density)} sub={`people/m² · limit ${fmtDec(limit)}`} tone={over ? 'warn' : undefined} />
      </div>
      <Sparkline values={d.series} stepSec={d.seriesStepSec} limit={limit * d.areaM2} />
      <div className="label">Next trains</div>
      <ul className="trains">
        {d.next.map((n) => (
          <li key={n.tripId}>
            <button type="button" id={`next-${n.tripId}`} className="train-row" onClick={() => select({ kind: 'train', line: tw.line, tripId: n.tripId })}>
              <span className="num eta">{n.eta === 0 ? 'now' : fmtSecs(n.eta)}</span>
              <span className="train-code">Train {n.code}<span className="muted"> · {n.units} {n.units === 1 ? 'unit' : 'units'}</span></span>
              <span className="bar" aria-hidden="true"><span style={{ width: `${Math.min(100, n.loadFactor * 100)}%`, background: loadColor(n.loadFactor) }} /></span>
              <span className="num">{pct(n.loadFactor)}</span>
            </button>
            {n.leftBehind >= 1 && <span className="left-behind">{fmtInt(n.leftBehind)} people will not fit on this train</span>}
          </li>
        ))}
        {d.next.length === 0 && <li className="muted">No more trains in this direction today.</li>}
      </ul>
    </Panel>
  );
}

function EscalatorPanel({ twin, index }: { twin: TwinId; index: number }) {
  const t = useTwin((s) => Math.floor(s.t));
  const view = useTwin((s) => s.views[twin]);
  const tw = TWINS[twin];
  const n = tw.layout.escalators.length;
  const d = escalatorDetail(view, tw.escalatorNames[index], n, t);
  return (
    <Panel icon={<StairsIcon />} title={tw.kind === 'surface' ? 'Escalator to footbridge' : 'Escalator'} sub={`${tw.name} · ${d.name}`}>
      <div className="mini-grid">
        <Stat label="Down to platform" value={fmtInt(d.downPerMin)} sub="people/min · last 1 min" />
        <Stat label="Up from platform" value={fmtInt(d.upPerMin)} sub="people/min · last 5 min" />
      </div>
      <p className="note muted">Model assumption: flow is split equally between the {n} escalators. Up-flow comes from passengers leaving trains, down-flow from platform arrivals.</p>
    </Panel>
  );
}

const viewCache = new WeakMap<SimResult, Map<string, StationView>>();
function cachedView(ld: LineData, stationId: string): StationView {
  let m = viewCache.get(ld.result);
  if (!m) viewCache.set(ld.result, (m = new Map()));
  let v = m.get(stationId);
  if (!v) m.set(stationId, (v = buildStationView(ld.ds, ld.result, stationId, ld.opts)));
  return v;
}

function StationPanel({ line, stationId }: { line: LineKey; stationId: string }) {
  const t = useTwin((s) => Math.floor(s.t));
  const ld = useLineData(line);
  const { focusTwin, select } = useTwin.getState();
  const L = LINES[line];
  const st = ld.ds.line.stations.find((s) => s.id === stationId)!;
  const twin = twinOfStation(stationId);
  const facts = stationFacts(ld.ds, stationId, line === 'T14' ? 'metro' : 'commuter');
  const sources = new Map(ld.ds.sources.map((s) => [s.id, s]));
  const view = cachedView(ld, stationId);
  const p = platformAt(view, t);
  const next = nextArrivals(view, t);
  const limit = ld.ds.constraints.platformDensityLimit.value;
  const nextCall = (dir: Direction) => view.calls.find((c) => c.direction === dir && c.depart >= t);
  const lines = st.servedBy.join(' · ');
  return (
    <Panel icon={<StationIcon />} tone={line === 'PENDEL' ? 'commuter' : undefined} title={st.name} sub={`${line === 'T14' ? 'Metro' : 'Commuter rail'} · ${lines}`} pill={twin ? '3D twin' : 'Map station'}>
      {twin && (
        <div className="btn-row">
          <button type="button" id="station-open-twin" className="btn small primary" onClick={() => focusTwin(twin)}>Open the 3D twin</button>
        </div>
      )}
      <div className="mini-grid">
        <Stat label="On platform" value={fmtInt(p.total)} sub={`${fmtDec(p.density)} people/m²`} tone={p.density >= limit ? 'warn' : undefined} />
        <Stat label={`↑ ${L.dirName.north.split(' · ')[0]}`} value={next.north == null ? '–' : fmtSecs(next.north)} sub="next train" />
        <Stat label={`↓ ${L.dirName.south.split(' · ')[0]}`} value={next.south == null ? '–' : fmtSecs(next.south)} sub="next train" />
      </div>
      <ul className="trains">
        {(['north', 'south'] as Direction[]).map((dir) => {
          const c = nextCall(dir);
          if (!c) return null;
          return (
            <li key={dir}>
              <button type="button" id={`station-next-${dir}`} className="train-row" onClick={() => select({ kind: 'train', line, tripId: c.tripId })}>
                <span className="num eta">{c.arrive <= t ? 'now' : fmtSecs(c.arrive - t)}</span>
                <span className="train-code">{dir === 'north' ? '↑' : '↓'} {L.code(c.tripId)}<span className="muted"> · {c.units}×{L.unit}</span></span>
                <span className="bar" aria-hidden="true"><span style={{ width: `${Math.min(100, c.loadFactor * 100)}%`, background: loadColor(c.loadFactor) }} /></span>
                <span className="num">{pct(c.loadFactor)}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="note muted">Every value shows where it comes from.</p>
      <dl className="facts">
        {facts.map((f) => (
          <div key={f.label} className="fact">
            <dt>{f.label}</dt>
            <dd className="num">{f.value}</dd>
            <dd className="fact-src">
              <span className={`kind ${f.src.kind}`}>{KIND_LABEL[f.src.kind]}</span>
              <span className="muted" title={f.src.note}>{sources.get(f.src.ref)?.title ?? f.src.ref}</span>
            </dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}

export function Inspector() {
  const sel = useTwin((s) => s.selection);
  if (!sel) {
    return (
      <section className="pane empty" aria-label="Inspect">
        <span className="insp-icon" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M9 4 L9 14 L12 11 L15 17 L17 16 L14 10 L18 10 Z" /></svg></span>
        <p>Click a <strong>train</strong>, a <strong>platform half</strong>, an <strong>escalator</strong> or a <strong>station sign</strong>, or any <strong>station on the map</strong>.</p>
      </section>
    );
  }
  if (sel.kind === 'train') return <TrainPanel key={`${sel.line}-${sel.tripId}`} line={sel.line} tripId={sel.tripId} />;
  if (sel.kind === 'platform') return <PlatformPanel twin={sel.twin} direction={sel.direction} />;
  if (sel.kind === 'escalator') return <EscalatorPanel twin={sel.twin} index={sel.index} />;
  return <StationPanel line={sel.line} stationId={sel.stationId} />;
}

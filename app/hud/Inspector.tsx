// Seçili nesnenin canlı bilgi paneli. Tüm değerler inspect.ts'deki saf fonksiyonlardan gelir.
import type { ReactNode } from 'react';
import type { Direction, ProvenanceKind } from '../../src/index';
import { useTwin, LAYOUT, STATION } from '../twin/store';
import { DATASET } from '../twin/model';
import { directionName, escalatorDetail, sideDetail, stationFacts, tripDetail, type TripDetail } from '../twin/inspect';
import { fmtClock, fmtSecs } from '../twin/selectors';
import { loadColor } from '../scene/palette';

const fmtInt = (n: number) => Math.round(n).toLocaleString('tr-TR');
const fmtDec = (n: number, d = 2) => n.toLocaleString('tr-TR', { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (x: number) => `%${Math.round(x * 100)}`;
const LIMIT_LF = DATASET.constraints.maxLoadFactor.value;

const KIND_LABEL: Record<ProvenanceKind, string> = { published: 'Yayın', derived: 'Hesaplanmış', assumption: 'Varsayım', synthetic: 'Sentetik' };

function Panel({ icon, title, sub, pill, pillTone = 'info', children }: { icon: ReactNode; title: string; sub: string; pill?: string; pillTone?: 'info' | 'ok' | 'warn'; children: ReactNode }) {
  const select = useTwin.getState().select;
  return (
    <section className="card inspector" aria-label={`${title} ayrıntıları`}>
      <header className="insp-head">
        <span className="insp-icon" aria-hidden="true">{icon}</span>
        <div className="insp-title">
          <h2>{title}</h2>
          <p className="muted">{sub}</p>
          {pill && <span className={`pill ${pillTone}`}>{pill}</span>}
        </div>
        <button type="button" id="inspector-close" className="icon-btn" aria-label="Paneli kapat" onClick={() => select(null)}>
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

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'warn' }) {
  return (
    <div className="mini">
      <span className="label">{label}</span>
      <span className={`mini-val num ${tone === 'warn' ? 'warn' : ''}`}>{value}</span>
      {sub && <span className="muted mini-sub">{sub}</span>}
    </div>
  );
}

/** Hat boyunca her duraktan kalkıştaki doluluk; %90 sınırı ve seçili istasyon işaretli */
function LoadProfile({ d }: { d: TripDetail }) {
  const W = 320, H = 112, top = 10, base = 78;
  const stops = d.stops;
  const bw = W / stops.length;
  const y = (lf: number) => base - Math.min(1, lf) * (base - top);
  const here =
    d.where.kind === 'at' ? (d.where.index + 0.5) * bw
    : d.where.kind === 'between' ? (d.where.fromIndex + 0.5 + d.where.progress) * bw
    : null;
  const focusIdx = stops.findIndex((s) => s.order === d.focus.stop.order);
  return (
    <figure className="chart">
      <figcaption className="label">Hat boyunca doluluk (kalkışta)</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`En yüksek doluluk ${pct(d.peak.loadFactor)}, ${d.peak.name} kalkışında`}>
        <line x1="0" x2={W} y1={base} y2={base} stroke="var(--border)" />
        <line x1="0" x2={W} y1={y(LIMIT_LF)} y2={y(LIMIT_LF)} stroke="var(--warn)" strokeDasharray="4 3" />
        <text x={W - 2} y={y(LIMIT_LF) - 4} textAnchor="end" className="axis">%90 sınır</text>
        {stops.map((s, i) => (
          <rect key={s.order} x={i * bw + 1.5} y={y(s.loadFactor)} width={bw - 3} height={Math.max(0.5, base - y(s.loadFactor))}
            rx="1.5" fill={i === focusIdx ? 'var(--accent)' : loadColor(s.loadFactor)} opacity={i === focusIdx ? 1 : 0.75} />
        ))}
        {here != null && <path d={`M${here - 5} ${top - 8} L${here + 5} ${top - 8} L${here} ${top - 1} Z`} fill="var(--fg)" />}
        <text x="1" y={base + 14} className="axis">{stops[0].name}</text>
        <text x={W - 1} y={base + 14} textAnchor="end" className="axis">{stops[stops.length - 1].name}</text>
        <text x={Math.min(W - 40, Math.max(40, (focusIdx + 0.5) * bw))} y={base + 28} textAnchor="middle" className="axis strong">{stops[focusIdx].name}</text>
      </svg>
    </figure>
  );
}

function TrainPanel({ tripId }: { tripId: number }) {
  const t = useTwin((s) => Math.floor(s.t));
  const r = useTwin((s) => s.result);
  const view = useTwin((s) => s.view);
  const d = tripDetail(DATASET, r, view, tripId, t);
  if (!d) return null;
  const tone = d.focus.status === 'peronda' ? 'ok' : 'info';
  const fs = d.focus.stop;
  // Trenin bulunduğu yer etrafında birkaç durak
  const center = d.where.kind === 'at' ? d.where.index : d.where.kind === 'between' ? d.where.fromIndex + 1 : d.where.kind === 'done' ? d.stops.length - 1 : 0;
  const from = Math.max(0, Math.min(center - 1, d.stops.length - 5));
  const shown = d.stops.slice(from, from + 5);
  return (
    <Panel icon={<TrainIcon />} title={`Sefer ${d.code}`} sub={`→ ${directionName(d.direction)} · ${d.units} × C20 · ${fmtInt(d.capacity)} kişi`} pill={`${STATION.name}: ${d.focus.status}`} pillTone={tone}>
      <div className="mini-grid">
        <Stat label="İnen" value={fmtInt(fs.alighted)} sub={STATION.name} />
        <Stat label="Binen" value={fmtInt(fs.boarded)} sub={STATION.name} />
        <Stat label="Kalkış doluluğu" value={pct(fs.loadFactor)} sub={`sınır ${pct(LIMIT_LF)}`} tone={fs.loadFactor > LIMIT_LF ? 'warn' : undefined} />
      </div>
      <LoadProfile d={d} />
      <ol className="stops">
        {shown.map((s) => {
          const idx = d.stops.indexOf(s);
          const state = d.where.kind === 'done' || (d.where.kind === 'at' && idx < d.where.index) || (d.where.kind === 'between' && idx <= d.where.fromIndex) ? 'past'
            : d.where.kind === 'at' && idx === d.where.index ? 'now' : 'next';
          return (
            <li key={s.order} className={state}>
              <span className="dot" aria-hidden="true" />
              <span className="stop-name">{s.name}</span>
              <span className="num muted">{fmtClock(s.arrive)}</span>
              <span className="num stop-load" style={{ color: s.loadFactor > LIMIT_LF ? 'var(--warn)' : undefined }}>{pct(s.loadFactor)}</span>
            </li>
          );
        })}
      </ol>
      <p className="note muted">Sefer numarası modelin ürettiği bir sıra numarasıdır.</p>
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
      <figcaption className="label">Son {mins} dakika: perondaki kişi</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`Şu an ${fmtInt(values[values.length - 1])} kişi`}>
        <line x1="0" x2={W} y1={base} y2={base} stroke="var(--border)" />
        {showLimit && (
          <g>
            <line x1="0" x2={W} y1={y(limit)} y2={y(limit)} stroke="var(--warn)" strokeDasharray="4 3" />
            <text x={W - 2} y={y(limit) - 4} textAnchor="end" className="axis">güvenli sınır</text>
          </g>
        )}
        <path d={area} fill="var(--accent)" opacity="0.14" />
        <path d={line} fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinejoin="round" />
        <circle cx={W} cy={y(values[values.length - 1])} r="3.2" fill="var(--accent)" />
        <text x="1" y={base + 15} className="axis">−{mins} dk</text>
        <text x={W - 1} y={base + 15} textAnchor="end" className="axis">şimdi</text>
      </svg>
    </figure>
  );
}

function PlatformPanel({ direction }: { direction: Direction }) {
  const t = useTwin((s) => Math.floor(s.t));
  const view = useTwin((s) => s.view);
  const select = useTwin.getState().select;
  const d = sideDetail(DATASET, view, direction, t);
  const limit = DATASET.constraints.platformDensityLimit.value;
  const over = d.density >= limit;
  return (
    <Panel icon={<PlatformIcon />} title={`Peron · ${directionName(direction)} yönü`} sub={`${STATION.name} · ${fmtInt(d.areaM2)} m² bekleme alanı`} pill={over ? 'Sınır aşıldı' : 'Normal'} pillTone={over ? 'warn' : 'ok'}>
      <div className="mini-grid">
        <Stat label="Bekleyen" value={fmtInt(d.count)} sub="kişi" />
        <Stat label="Yoğunluk" value={fmtDec(d.density)} sub={`kişi/m² · sınır ${fmtDec(limit)}`} tone={over ? 'warn' : undefined} />
      </div>
      <Sparkline values={d.series} stepSec={d.seriesStepSec} limit={limit * d.areaM2} />
      <div className="label">Gelecek trenler</div>
      <ul className="trains">
        {d.next.map((n) => (
          <li key={n.tripId}>
            <button type="button" id={`next-${n.tripId}`} className="train-row" onClick={() => select({ kind: 'train', tripId: n.tripId })}>
              <span className="num eta">{n.eta === 0 ? 'peronda' : fmtSecs(n.eta)}</span>
              <span className="train-code">Sefer {n.code}<span className="muted"> · {n.units} ünite</span></span>
              <span className="bar" aria-hidden="true"><span style={{ width: `${Math.min(100, n.loadFactor * 100)}%`, background: loadColor(n.loadFactor) }} /></span>
              <span className="num">{pct(n.loadFactor)}</span>
            </button>
            {n.leftBehind >= 1 && <span className="left-behind">{fmtInt(n.leftBehind)} kişi bu trene sığmayacak</span>}
          </li>
        ))}
        {d.next.length === 0 && <li className="muted">Bu yönde başka sefer yok.</li>}
      </ul>
    </Panel>
  );
}

function EscalatorPanel({ index }: { index: number }) {
  const t = useTwin((s) => Math.floor(s.t));
  const view = useTwin((s) => s.view);
  const d = escalatorDetail(view, index, LAYOUT.escalators.length, t);
  return (
    <Panel icon={<StairsIcon />} title="Yürüyen merdiven" sub={`${STATION.name} · ${d.name}`}>
      <div className="mini-grid">
        <Stat label="Perona inen" value={fmtInt(d.downPerMin)} sub="kişi/dk · son 1 dk" />
        <Stat label="Perondan çıkan" value={fmtInt(d.upPerMin)} sub="kişi/dk · son 5 dk" />
      </div>
      <p className="note muted">Model varsayımı: akış {LAYOUT.escalators.length} merdiven arasında eşit paylaşılır. İnenler trenden inen yolculardan, binenler perona gelişlerden hesaplanır.</p>
    </Panel>
  );
}

function StationPanel() {
  const view = useTwin((s) => s.view);
  const facts = stationFacts(DATASET, view);
  const sources = new Map(DATASET.sources.map((s) => [s.id, s]));
  return (
    <Panel icon={<StationIcon />} title={STATION.name} sub="Kırmızı Hat · T13 ve T14 ortak gövdesi">
      <p className="note muted">Her değerin yanında nereden geldiği yazar.</p>
      <dl className="facts">
        {facts.map((f) => (
          <div key={f.label} className="fact">
            <dt>{f.label}</dt>
            <dd className="num">{f.value}</dd>
            <dd className="fact-src">
              <span className={`kind ${f.src.kind}`}>{KIND_LABEL[f.src.kind]}</span>
              <span className="muted">{sources.get(f.src.ref)?.title ?? f.src.ref}</span>
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
      <section className="card inspector empty" aria-label="İnceleme">
        <span className="insp-icon" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M9 4 L9 14 L12 11 L15 17 L17 16 L14 10 L18 10 Z" /></svg></span>
        <p>Bir <strong>trene</strong>, <strong>peronun bir yarısına</strong>, <strong>yürüyen merdivene</strong> ya da <strong>istasyon tabelasına</strong> tıklayın.</p>
      </section>
    );
  }
  if (sel.kind === 'train') return <TrainPanel tripId={sel.tripId} />;
  if (sel.kind === 'platform') return <PlatformPanel direction={sel.direction} />;
  if (sel.kind === 'escalator') return <EscalatorPanel index={sel.index} />;
  return <StationPanel />;
}


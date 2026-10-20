// Network tab: the T-Centralen ⇄ Solna connection, with every commuter train in the corridor tracked live.
// Values come from the corridor simulation (app/twin/network.ts) and the shared train kinematics.
import { useTwin } from '../twin/store';
import { recentTransfer, routeNow } from '../twin/network';
import { fmtClock, fmtInt, fmtSecs, pct } from '../twin/selectors';
import { LINES, TWINS } from '../twin/world';
import { trainPose } from '../twin/trainpose';
import { loadColor } from '../scene/palette';
import { trainAt, SLOTS, type Trip } from '../../src/index';
import { SERVICE_START_MIN, SLOT_MINUTES } from '../../src/data/time';

const P = LINES.PENDEL;
const STATIONS = P.line.stations;
const shortName = (i: number) => (STATIONS[i].isBoundary ? (i === 0 ? 'south of City' : 'north of Ulriksdal') : STATIONS[i].name.replace('Stockholm ', ''));

interface LiveTrain {
  trip: Trip;
  s: number;
  where: string;
  load: number;
}

/** Commuter trains on the corridor at t, south to north */
function liveTrains(trips: Trip[], loads: Map<number, number[]>, t: number): LiveTrain[] {
  const out: LiveTrain[] = [];
  for (const trip of trips) {
    if (t < trip.stops[0].t || t > trip.stops[trip.stops.length - 1].t) continue;
    const p = trainAt(P.motion, trip, t);
    if (!p) continue;
    const a = trip.stops[p.i].stationOrder;
    const where = p.phase === 'dwell' ? `at ${shortName(a)}` : `${shortName(a)} → ${shortName(trip.stops[p.i + 1].stationOrder)}`;
    const lf = loads.get(trip.id)?.[a] ?? 0;
    out.push({ trip, s: p.s, where, load: lf });
  }
  return out.sort((x, y) => x.s - y.s);
}

function Corridor({ trains, t }: { trains: LiveTrain[]; t: number }) {
  const select = useTwin.getState().select;
  const sel = useTwin((s) => s.selection);
  const al = P.al;
  const W = 320, y = 46, padL = 16, padR = 16;
  const s0 = al.arcOf['stockholm-city'] - 900, s1 = al.arcOf.ulriksdal + 900;
  const x = (s: number) => padL + ((Math.max(s0, Math.min(s1, s)) - s0) / (s1 - s0)) * (W - padL - padR);
  const named = ['stockholm-city', 'stockholm-odenplan', 'solna', 'ulriksdal'];
  const xc = x(al.arcOf['stockholm-city']);
  return (
    <figure className="chart">
      <figcaption className="label">Live: commuter trains between Stockholm City and Ulriksdal · {fmtClock(t)}</figcaption>
      <svg viewBox={`0 0 ${W} 104`} width="100%" role="img" aria-label={`${trains.length} commuter trains on the corridor`}>
        <line x1={padL - 10} x2={xc} y1={y} y2={y} stroke="var(--commuter)" strokeWidth="3" opacity="0.4" />
        <line x1={x(al.arcOf.ulriksdal)} x2={W - padR + 10} y1={y} y2={y} stroke="var(--commuter)" strokeWidth="3" opacity="0.4" />
        <line x1={xc} x2={x(al.arcOf.ulriksdal)} y1={y} y2={y} stroke="var(--commuter)" strokeWidth="4" strokeLinecap="round" />
        {/* Walking link from T-Centralen (metro) down to Stockholm City */}
        <line x1={xc} x2={xc} y1={y + 22} y2={y + 6} stroke="var(--muted)" strokeWidth="1.5" strokeDasharray="3 3" />
        <circle cx={xc} cy={y + 27} r="5" fill="var(--panel)" stroke="var(--line)" strokeWidth="2.5" />
        <text x={xc + 9} y={y + 31} className="axis">T-Centralen (T14) · 5 min walk</text>
        {named.map((id) => (
          <g key={id}>
            <circle cx={x(al.arcOf[id])} cy={y} r={id === 'solna' ? 6.5 : 4.5} fill={id === 'solna' ? 'var(--commuter)' : 'var(--panel)'} stroke="var(--commuter)" strokeWidth="2.2" />
            <text x={x(al.arcOf[id])} y={y - 26} textAnchor="middle" className={id === 'solna' ? 'axis strong-c' : 'axis'}>{STATIONS.find((s) => s.id === id)!.name.replace('Stockholm ', '')}</text>
          </g>
        ))}
        {trains.map((tr) => {
          const north = tr.trip.direction === 'north';
          const cx = x(tr.s);
          const cy = north ? y - 12 : y + 12;
          const on = sel?.kind === 'train' && sel.line === 'PENDEL' && sel.tripId === tr.trip.id;
          const d = north ? `M${cx - 7} ${cy - 4} H${cx + 4} L${cx + 8} ${cy} L${cx + 4} ${cy + 4} H${cx - 7} Z` : `M${cx + 7} ${cy - 4} H${cx - 4} L${cx - 8} ${cy} L${cx - 4} ${cy + 4} H${cx + 7} Z`;
          return (
            <path key={tr.trip.id} d={d} fill={loadColor(tr.load)} stroke={on ? 'var(--fg)' : 'var(--panel)'} strokeWidth={on ? 2 : 1}
              className="corridor-train" onClick={() => select({ kind: 'train', line: 'PENDEL', tripId: tr.trip.id })}>
              <title>{`Train ${P.code(tr.trip.id)} · ${tr.where} · ${pct(tr.load)} full`}</title>
            </path>
          );
        })}
        <text x={padL - 10} y={y + 52} className="axis">↑ northbound above · ↓ southbound below</text>
      </svg>
    </figure>
  );
}

function DaySeries({ values, t }: { values: number[]; t: number }) {
  const W = 320, H = 96, L = 28, top = 8, base = 70;
  const n = values.length;
  const max = Math.max(50, ...values) * 1.1;
  const step = max > 400 ? 200 : max > 200 ? 100 : 50;
  const yMax = Math.ceil(max / step) * step;
  const x = (i: number) => L + (i / (n - 1)) * (W - L);
  const xt = (sec: number) => L + ((sec - SERVICE_START_MIN * 60) / (SLOT_MINUTES * 60 * (n - 1))) * (W - L);
  const y = (v: number) => base - (v / yMax) * (base - top);
  const line = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const ticks = Array.from({ length: yMax / step + 1 }, (_, i) => i * step);
  const idx = Math.max(0, Math.min(n - 1, Math.floor((t - SERVICE_START_MIN * 60) / (SLOT_MINUTES * 60))));
  return (
    <figure className="chart">
      <figcaption className="label">Solna: average people on the platform (15 min)</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`Busiest slot on the Solna platform: ${SLOTS[values.indexOf(Math.max(...values))].label}`}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={L} x2={W} y1={y(v)} y2={y(v)} stroke="var(--border)" />
            <text x={L - 4} y={y(v) + 3.5} textAnchor="end" className="axis">{v}</text>
          </g>
        ))}
        {[6, 9, 12, 15, 18, 21, 24].map((h) => (
          <text key={h} x={xt(h * 3600)} y={base + 14} textAnchor="middle" className="axis">{String(h % 24).padStart(2, '0')}</text>
        ))}
        <path d={`${line} L${W} ${base} L${L} ${base} Z`} fill="var(--commuter)" opacity="0.14" />
        <path d={line} fill="none" stroke="var(--commuter)" strokeWidth="1.8" strokeLinejoin="round" />
        <line x1={xt(t)} x2={xt(t)} y1={top} y2={base} stroke="var(--fg)" strokeDasharray="2 3" />
        <circle cx={x(idx)} cy={y(values[idx])} r="3.2" fill="var(--fg)" />
      </svg>
    </figure>
  );
}

const loadCache = new WeakMap<object, Map<number, number[]>>();

export function NetworkPanel() {
  const t = useTwin((s) => Math.floor(s.t));
  const v = useTwin((s) => s.corridor);
  const following = useTwin((s) => s.follow);
  const { select, setFollow, focusTwin, flyTo } = useTwin.getState();
  let loads = loadCache.get(v.result);
  if (!loads) {
    loads = new Map();
    for (const e of v.result.events) {
      let a = loads.get(e.tripId);
      if (!a) loads.set(e.tripId, (a = new Array(STATIONS.length).fill(0)));
      a[e.stationOrder] = e.capacity ? e.loadAfter / e.capacity : 0;
    }
    loadCache.set(v.result, loads);
  }
  const trains = liveTrains(v.result.trips, loads, t);
  const r = routeNow(v, t);
  const tr = recentTransfer(v, t);
  const totals = v.series.reduce((a, x) => ({ in: a.in + x.entries, out: a.out + x.exits }), { in: 0, out: 0 });
  const peak = v.series.reduce((a, b) => (b.platformMax > a.platformMax ? b : a));
  const legs = r ? {
    walk: r.legs.filter((l) => l.kind === 'walk').reduce((a, l) => a + l.sec, 0),
    wait: r.legs.filter((l) => l.kind === 'wait').reduce((a, l) => a + l.sec, 0),
    ride: r.legs.filter((l) => l.kind === 'ride' || l.kind === 'dwell').reduce((a, l) => a + l.sec, 0),
  } : null;
  const track = (trip: Trip) => {
    select({ kind: 'train', line: 'PENDEL', tripId: trip.id });
    setFollow({ line: 'PENDEL', tripId: trip.id });
    const p = trainPose('PENDEL', trip, t);
    if (p) flyTo(p.x, p.z, 1.6);
  };
  return (
    <section className="pane" aria-label="Network: T-Centralen to Solna">
      <header className="insp-head">
        <span className="insp-icon commuter" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="5" cy="12" r="2.5" /><circle cx="19" cy="12" r="2.5" /><path d="M7.5 12 H16.5" /></svg>
        </span>
        <div className="insp-title">
          <h2>T-Centralen ⇄ Solna</h2>
          <p className="muted">Walk to Stockholm City, then commuter rail via Odenplan</p>
        </div>
      </header>

      <Corridor trains={trains} t={t} />

      <div className="mini-grid">
        <div className="mini"><span className="label">Journey now</span><span className="mini-val num">{r ? fmtSecs(r.totalSec) : '–'}</span><span className="muted mini-sub">min, T-Centralen → Solna</span></div>
        <div className="mini"><span className="label">Trains on corridor</span><span className="mini-val num">{trains.length}</span><span className="muted mini-sub">{trains.filter((x) => x.trip.direction === 'north').length} north · {trains.filter((x) => x.trip.direction === 'south').length} south</span></div>
      </div>
      {legs && (
        <p className="net-legs num">
          <span>walk <b>{fmtSecs(legs.walk)}</b></span>
          <span>wait <b>{fmtSecs(legs.wait)}</b></span>
          <span>ride <b>{fmtSecs(legs.ride)}</b></span>
        </p>
      )}

      <div className="label">Track a train</div>
      <ul className="trains">
        {trains.map((x) => {
          const on = following?.line === 'PENDEL' && following.tripId === x.trip.id;
          return (
            <li key={x.trip.id}>
              <button type="button" id={`track-${x.trip.id}`} className={`train-row track ${on ? 'on' : ''}`} onClick={() => track(x.trip)} aria-pressed={on}>
                <span className="num eta">{x.trip.direction === 'north' ? '↑' : '↓'} {P.code(x.trip.id)}</span>
                <span className="train-code">{x.where}<span className="muted"> · {x.trip.units}×X60</span></span>
                <span className="bar" aria-hidden="true"><span style={{ width: `${Math.min(100, x.load * 100)}%`, background: loadColor(x.load) }} /></span>
                <span className="num">{pct(x.load)}</span>
              </button>
            </li>
          );
        })}
        {trains.length === 0 && <li className="muted">No commuter trains running at this time.</li>}
      </ul>

      <div className="btn-row">
        <button type="button" id="net-open-solna" className="btn small" onClick={() => focusTwin('solna')}>Open Solna 3D twin</button>
        <button type="button" id="net-open-tc" className="btn small" onClick={() => focusTwin('tc')}>Open T-Centralen 3D twin</button>
      </div>

      <DaySeries values={v.series.map((x) => x.platformAvg)} t={t} />

      <dl className="facts">
        <div className="fact"><dt>Solna entries / exits per day</dt><dd className="num">{fmtInt(totals.in)} / {fmtInt(totals.out)}</dd></div>
        <div className="fact"><dt>Busiest slot at Solna</dt><dd className="num">{peak.label} · {fmtInt(peak.platformMax)} people</dd></div>
        <div className="fact"><dt>T14 → commuter transfers, last 15 min</dt><dd className="num">{fmtInt(tr)} people</dd></div>
      </dl>
      <p className="note muted">Solna's daily boardings are published ({fmtInt(TWINS.solna.station.boardingsPerDay.value)}); the time-of-day profile is synthetic. Nearby attractions (mall, stadium) and event crowds are not modelled at this stage.</p>
    </section>
  );
}

// Ölçüt şeridi ve plan karşılaştırması. Tüm sayılar metrics.ts üzerinden simülasyondan hesaplanır.
import { useTwin } from '../twin/store';
import { DATASET, SCENARIOS, planLabel, resolvePlan } from '../twin/model';
import {
  METRIC_ROWS, WINDOWS, fmtDec, p90Series, planMetrics, slotIndexOf, trainsOnLine, verdict, windowRange,
  type MetricKey, type Scope, type WindowId,
} from '../twin/metrics';
import { fmtClock } from '../twin/selectors';
import { SLOTS } from '../../src/index';
import { SERVICE_START_MIN, SLOT_MINUTES } from '../../src/data/time';

const planName = planLabel;
/** Karşılaştırmanın referansı her zaman mevcut tarife; mevcut seçiliyse önerilen planla karşılaştırılır */
const otherPlan = (id: string) => (id === 'current' ? 'optimized' : 'current');
const comparedPlan = (id: string) => (id === 'current' ? 'optimized' : id);
const LIMIT_LF = DATASET.constraints.maxLoadFactor.value;
const LIMIT_D = DATASET.constraints.platformDensityLimit.value;

function Delta({ k, a, b, text }: { k: MetricKey; a: number; b: number; text: string }) {
  const v = verdict(k, a, b);
  if (v === 'same') return <span className="delta same">aynı</span>;
  return <span className={`delta ${v}`}>{text}</span>;
}

/** Üst şerit: seçili planın bu 15 dakikadaki ölçütleri, diğer plana göre farkıyla */
export function KpiStrip() {
  const t = useTwin((s) => Math.floor(s.t));
  const planId = useTwin((s) => s.planId);
  const scenario = useTwin((s) => s.scenario);
  const result = useTwin((s) => s.result);
  const other = otherPlan(planId);
  const st = planMetrics(planId, scenario, 'slot', 'station', t);
  const stO = planMetrics(other, scenario, 'slot', 'station', t);
  const ln = planMetrics(planId, scenario, 'slot', 'line', t);
  const lnO = planMetrics(other, scenario, 'slot', 'line', t);
  const [a, b] = windowRange('slot', t);
  const onLine = trainsOnLine(result, t);
  const rowFor = (k: MetricKey) => METRIC_ROWS.find((r) => r.key === k)!;
  const tile = (k: MetricKey, label: string, cur: number, ref: number, sub?: string, warn?: boolean) => (
    <div className="kpi" key={k + label}>
      <span className="kpi-label">{label}</span>
      <span className="kpi-row">
        <span className={`kpi-val num ${warn ? 'warn' : ''}`}>{rowFor(k).fmt(cur)}</span>
        <Delta k={k} a={ref} b={cur} text={rowFor(k).delta(cur - ref)} />
      </span>
      {sub && <span className="kpi-sub">{sub}</span>}
    </div>
  );
  return (
    <section className="card kpis" aria-label="Ölçütler">
      <p className="kpis-head">
        <span className="label">{fmtClock(a)}–{fmtClock(b)} · {planName(planId)} plan</span>
        <span className="muted">fark: {planName(other)} plana göre</span>
      </p>
      <div className="kpi-grid">
        {tile('dispersionP90Sec', 'Dağılma süresi · P90', st.dispersionP90Sec, stO.dispersionP90Sec, 'T-Centralen · dk:sn')}
        {tile('avgWaitSec', 'Ortalama bekleme', st.avgWaitSec, stO.avgWaitSec, 'T-Centralen · dk:sn')}
        {tile('maxPlatformDensity', 'Peron yoğunluğu', st.maxPlatformDensity, stO.maxPlatformDensity, `kişi/m² · sınır ${fmtDec(LIMIT_D)}`, st.maxPlatformDensity >= LIMIT_D)}
        {tile('peakLoadFactor', 'Vagon doluluğu', ln.peakLoadFactor, lnO.peakLoadFactor, `tüm hat · sınır %${Math.round(LIMIT_LF * 100)}`, ln.peakLoadFactor > LIMIT_LF)}
        <div className="kpi">
          <span className="kpi-label">Hattaki tren</span>
          <span className="kpi-row"><span className="kpi-val num">{onLine.trains}</span><span className="kpi-sub inline">{onLine.units} ünite</span></span>
          <span className="kpi-sub">filo {DATASET.fleet.unitsAvailable.value} ünite</span>
        </div>
      </div>
    </section>
  );
}

/** Gün boyu her 15 dakikada dağılma süresi; iki plan, seçili pencere ve şu an işaretli */
function DayChart({ scope, win }: { scope: Scope; win: WindowId }) {
  const t = useTwin((s) => Math.floor(s.t));
  const scenario = useTwin((s) => s.scenario);
  const planId = useTwin((s) => s.planId);
  const ids = ['current', comparedPlan(planId)];
  const series = ids.map((id) => p90Series(id, scenario, scope));
  const W = 420, H = 132, L = 30, R = 6, top = 8, base = 104;
  const n = SLOTS.length;
  const maxV = Math.max(300, ...series.flat());
  const yMax = Math.ceil(maxV / 300) * 300; // 5 dk adımlar
  const x = (i: number) => L + (i / (n - 1)) * (W - L - R);
  const xt = (sec: number) => L + ((sec - SERVICE_START_MIN * 60) / (SLOT_MINUTES * 60 * (n - 1))) * (W - L - R);
  const y = (v: number) => base - (v / yMax) * (base - top);
  const path = (s: number[]) => s.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const [wa, wb] = windowRange(win, t);
  const ticksY = Array.from({ length: yMax / 300 + 1 }, (_, i) => i * 300).filter((v, i, a) => a.length <= 6 || i % 2 === 0);
  const hours = [6, 9, 12, 15, 18, 21, 24];
  const colors = (id: string) => (id === 'current' ? 'var(--series-a)' : 'var(--series-b)');
  return (
    <figure className="chart">
      <figcaption className="chart-head">
        <span className="label">Gün boyu dağılma süresi (P90)</span>
        <span className="chart-legend">
          {ids.map((id) => (
            <span key={id}><span className="key-line" style={{ background: colors(id) }} />{planName(id)}</span>
          ))}
        </span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="İki planın gün boyu dağılma süresi">
        <rect x={xt(wa)} y={top} width={Math.max(2, xt(wb) - xt(wa))} height={base - top} fill="var(--accent)" opacity="0.08" />
        {ticksY.map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--border)" />
            <text x={L - 4} y={y(v) + 3.5} textAnchor="end" className="axis">{v / 60}</text>
          </g>
        ))}
        {hours.map((h) => (
          <text key={h} x={xt(h * 3600)} y={base + 14} textAnchor="middle" className="axis">{String(h % 24).padStart(2, '0')}</text>
        ))}
        <text x={L - 4} y={top - 1} textAnchor="end" className="axis">dk</text>
        {ids.map((id, k) => (
          <path key={id} d={path(series[k])} fill="none" stroke={colors(id)} strokeWidth={id === planId ? 2.2 : 1.4} strokeLinejoin="round" opacity={id === planId ? 1 : 0.85} />
        ))}
        <line x1={xt(t)} x2={xt(t)} y1={top} y2={base} stroke="var(--fg)" strokeDasharray="2 3" />
        <circle cx={xt(t)} cy={y(series[ids.indexOf(planId)][slotIndexOf(t)])} r="3.4" fill="var(--fg)" />
      </svg>
    </figure>
  );
}

export function Compare() {
  const t = useTwin((s) => Math.floor(s.t));
  const scenario = useTwin((s) => s.scenario);
  const planId = useTwin((s) => s.planId);
  const win = useTwin((s) => s.compareWindow);
  const scope = useTwin((s) => s.compareScope);
  const setCompare = useTwin.getState().setCompare;
  const [base, alt] = ['current', comparedPlan(planId)];
  const mA = planMetrics(base, scenario, win, scope, t);
  const mB = planMetrics(alt, scenario, win, scope, t);
  const slot = slotIndexOf(t);
  const ps = [base, alt].map((id) => ({ id, s: resolvePlan(id, scenario).slots[slot] }));
  const fmtHw = (m: number) => `${m.toLocaleString('tr-TR')} dk`;
  return (
    <section className="pane" aria-label="Plan karşılaştırması">
      <header className="compare-head">
        <h2>Plan karşılaştırması</h2>
        <span className="muted">{SCENARIOS[scenario].name}</span>
      </header>
      <div className="filters">
        <label htmlFor="compare-window" className="sr-only">Zaman penceresi</label>
        <select id="compare-window" value={win} onChange={(e) => setCompare({ window: e.target.value as WindowId })}>
          {WINDOWS.map((w) => <option key={w.id} value={w.id}>{w.label}</option>)}
        </select>
        <div className="seg" role="group" aria-label="Kapsam">
          <button type="button" id="scope-station" aria-pressed={scope === 'station'} onClick={() => setCompare({ scope: 'station' })}>T-Centralen</button>
          <button type="button" id="scope-line" aria-pressed={scope === 'line'} onClick={() => setCompare({ scope: 'line' })}>Tüm hat</button>
        </div>
      </div>
      <div className="table-wrap">
        <table className="cmp">
          <thead>
            <tr>
              <th scope="col">Ölçüt</th>
              <th scope="col" className={planId === base ? 'sel' : ''}>{planName(base)}</th>
              <th scope="col" className={planId === alt ? 'sel' : ''}>{planName(alt)}</th>
              <th scope="col">Fark</th>
            </tr>
          </thead>
          <tbody>
            {METRIC_ROWS.map((r) => (
              <tr key={r.key}>
                <th scope="row">{r.label}</th>
                <td className="num">{r.fmt(mA[r.key])}</td>
                <td className="num">{r.fmt(mB[r.key])}</td>
                <td className="num"><Delta k={r.key} a={mA[r.key]} b={mB[r.key]} text={r.delta(mB[r.key] - mA[r.key])} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <DayChart scope={scope} win={win} />
      <p className="slot-plan">
        <span className="label">Bu dilimde sefer</span>
        {ps.map((p) => (
          <span key={p.id} className="num"><strong>{planName(p.id)}</strong> {fmtHw(p.s.headwayMin)} · {p.s.unitsPerTrain} ünite</span>
        ))}
      </p>
      <p className="note muted">Fark: {planName(alt)} − Mevcut. Yeşil daha iyi, turuncu daha kötü. Tüm ölçütlerde küçük değer daha iyidir.</p>
    </section>
  );
}


// Ağ sekmesi: Solna istasyonu ve T-Centralen bağlantısı. Değerler koridor simülasyonundan (app/twin/network.ts) gelir.
import { useTwin } from '../twin/store';
import { getCorridor, recentTransfer, routeNow } from '../twin/network';
import { fmtClock, fmtSecs } from '../twin/selectors';
import { loadColor } from '../scene/palette';
import { SLOTS } from '../../src/index';
import { SERVICE_START_MIN, SLOT_MINUTES } from '../../src/data/time';

const fmtInt = (n: number) => Math.round(n).toLocaleString('tr-TR');
const pct = (x: number) => `%${Math.round(x * 100)}`;

function Schematic() {
  // T-Centralen (metro) — yürüme — Stockholm City — Odenplan — Solna — Ulriksdal
  const W = 320, y = 34;
  const xs = [14, 92, 162, 236, 306];
  const names = ['T-Centralen', 'City', 'Odenplan', 'Solna', 'Ulriksdal'];
  return (
    <figure className="chart">
      <figcaption className="label">Bağlantı</figcaption>
      <svg viewBox={`0 0 ${W} 78`} width="100%" role="img" aria-label="T-Centralen’den 5 dakika yürüyerek Stockholm City’ye, oradan pendeltåg ile Odenplan üzerinden 7 dakikada Solna’ya">
        <line x1={xs[0]} x2={xs[1]} y1={y} y2={y} stroke="var(--muted)" strokeWidth="2" strokeDasharray="3 4" />
        <line x1={xs[1]} x2={xs[4]} y1={y} y2={y} stroke="var(--commuter)" strokeWidth="4" strokeLinecap="round" />
        <text x={(xs[0] + xs[1]) / 2} y={y - 9} textAnchor="middle" className="axis">yürüme 5 dk</text>
        <text x={(xs[1] + xs[3]) / 2} y={y - 9} textAnchor="middle" className="axis">pendeltåg 7 dk</text>
        {xs.map((x, i) => (
          <g key={names[i]}>
            <circle cx={x} cy={y} r={i === 3 ? 7 : 5} fill={i === 3 ? 'var(--commuter)' : 'var(--panel)'} stroke={i === 0 ? 'var(--line)' : 'var(--commuter)'} strokeWidth="2.5" />
            <text x={x} y={y + 24} textAnchor={i === 0 ? 'start' : i === 4 ? 'end' : 'middle'} className={i === 3 ? 'axis strong' : 'axis'}>{names[i]}</text>
          </g>
        ))}
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
      <figcaption className="label">Gün boyu peronda ortalama kişi (15 dk)</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`Solna peronunda en kalabalık dilim ${SLOTS[values.indexOf(Math.max(...values))].label}`}>
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

export function NetworkPanel() {
  const t = useTwin((s) => Math.floor(s.t));
  const planId = useTwin((s) => s.planId);
  const scenario = useTwin((s) => s.scenario);
  const v = getCorridor(planId, scenario);
  const st = v.solna.stateAt(t);
  const r = routeNow(v, t);
  const tr = recentTransfer(v, t);
  const totals = v.series.reduce((a, x) => ({ in: a.in + x.entries, out: a.out + x.exits }), { in: 0, out: 0 });
  const peak = v.series.reduce((a, b) => (b.platformMax > a.platformMax ? b : a));
  const legs = r ? {
    walk: r.legs.filter((l) => l.kind === 'walk').reduce((a, l) => a + l.sec, 0),
    wait: r.legs.filter((l) => l.kind === 'wait').reduce((a, l) => a + l.sec, 0),
    ride: r.legs.filter((l) => l.kind === 'ride' || l.kind === 'dwell').reduce((a, l) => a + l.sec, 0),
  } : null;
  const next = [
    { dir: 'north' as const, name: '↑ Ulriksdal' },
    { dir: 'south' as const, name: '↓ Stockholm City' },
  ];
  return (
    <section className="pane" aria-label="Ağ: Solna istasyonu">
      <header className="insp-head">
        <span className="insp-icon commuter" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="5" cy="12" r="2.5" /><circle cx="19" cy="12" r="2.5" /><path d="M7.5 12 H16.5" /></svg>
        </span>
        <div className="insp-title">
          <h2>Solna station</h2>
          <p className="muted">Pendeltåg J40 · J41 · 42X · ada peron</p>
          <span className="pill info">Temel operasyon</span>
        </div>
      </header>

      <Schematic />

      <div className="mini-grid">
        <div className="mini"><span className="label">Peronda</span><span className="mini-val num">{fmtInt(st.total)}</span><span className="muted mini-sub">doluluk {pct(st.occupancy)}</span></div>
        <div className="mini"><span className="label">Yoğunluk</span><span className="mini-val num">{st.density.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span><span className="muted mini-sub">kişi/m² · sınır 2,00</span></div>
        <div className="mini"><span className="label">Yolculuk</span><span className="mini-val num">{r ? fmtSecs(r.totalSec) : '–'}</span><span className="muted mini-sub">dk, T-Centralen’den</span></div>
      </div>

      {legs && (
        <p className="net-legs num">
          <span>yürüme <b>{fmtSecs(legs.walk)}</b></span>
          <span>bekleme <b>{fmtSecs(legs.wait)}</b></span>
          <span>yolculuk <b>{fmtSecs(legs.ride)}</b></span>
        </p>
      )}

      <div className="label">Sonraki trenler</div>
      <ul className="trains">
        {next.map(({ dir, name }) => {
          const n = st.next[dir];
          return (
            <li key={dir}>
              <div className="train-row static">
                <span className="num eta">{n ? (n.inSec === 0 ? 'şimdi' : fmtSecs(n.inSec)) : '–'}</span>
                <span className="train-code">{name}<span className="muted">{n ? ` · ${n.units}×X60` : ''}</span></span>
                <span className="bar" aria-hidden="true"><span style={{ width: `${Math.min(100, (n?.loadFactorOnDeparture ?? 0) * 100)}%`, background: loadColor(n?.loadFactorOnDeparture ?? 0) }} /></span>
                <span className="num">{n ? pct(n.loadFactorOnDeparture) : ''}</span>
              </div>
            </li>
          );
        })}
      </ul>

      <DaySeries values={v.series.map((x) => x.platformAvg)} t={t} />

      <dl className="facts">
        <div className="fact"><dt>Günlük giriş / çıkış</dt><dd className="num">{fmtInt(totals.in)} / {fmtInt(totals.out)}</dd></div>
        <div className="fact"><dt>En kalabalık dilim</dt><dd className="num">{peak.label} · {fmtInt(peak.platformMax)} kişi</dd></div>
        <div className="fact"><dt>Son 15 dk’da T14’ten aktaran</dt><dd className="num">{fmtInt(tr)} kişi</dd></div>
      </dl>
      <p className="note muted">Saat {fmtClock(t)}. Solna’nın günlük binişi yayınlanmış veriden (16 000), gün içi dağılım sentetik. Çevredeki AVM, stadyum ve etkinlik etkisi bu aşamada modellenmedi.</p>
    </section>
  );
}

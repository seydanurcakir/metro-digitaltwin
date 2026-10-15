// Sahne üstündeki kontroller ve canlı okuma. Sayılar store + selectors'tan hesaplanır, elle yazılmaz.
import { useTwin, SPEEDS, STATION } from '../twin/store';
import { DATASET, SCENARIOS, UI_PLANS } from '../twin/model';
import { fmtClock, fmtSecs, nextArrivals, platformAt } from '../twin/selectors';
import { HEAT_STEPS } from '../scene/Crowd';
import { C } from '../scene/palette';
import { Inspector } from './Inspector';
import { Compare, KpiStrip } from './Metrics';

const fmtInt = (n: number) => Math.round(n).toLocaleString('tr-TR');
const fmtDec = (n: number) => n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const JUMPS: { label: string; hhmm: string; scenario: 'normal' | 'surge' }[] = [
  { label: 'Sabah zirvesi', hhmm: '07:56', scenario: 'normal' },
  { label: 'Öğle', hhmm: '12:28', scenario: 'normal' },
  { label: 'Akşam kalabalığı', hhmm: '20:58', scenario: 'surge' },
];

function Dock() {
  const panel = useTwin((s) => s.panel);
  const setPanel = useTwin.getState().setPanel;
  return (
    <section className="card dock">
      <div className="tabs" role="tablist" aria-label="Paneller">
        <button type="button" role="tab" id="tab-inspect" aria-selected={panel === 'inspect'} aria-controls="pane-body" onClick={() => setPanel('inspect')}>İnceleme</button>
        <button type="button" role="tab" id="tab-compare" aria-selected={panel === 'compare'} aria-controls="pane-body" onClick={() => setPanel('compare')}>Karşılaştırma</button>
      </div>
      <div className="dock-body" id="pane-body" role="tabpanel" aria-labelledby={panel === 'inspect' ? 'tab-inspect' : 'tab-compare'}>
        {panel === 'inspect' ? <Inspector /> : <Compare />}
      </div>
    </section>
  );
}

export function Hud() {
  const sec = useTwin((s) => Math.floor(s.t));
  const playing = useTwin((s) => s.playing);
  const speed = useTwin((s) => s.speed);
  const planId = useTwin((s) => s.planId);
  const scenario = useTwin((s) => s.scenario);
  const view = useTwin((s) => s.view);
  const { setPlaying, setSpeed, setPlan, jumpTo } = useTwin.getState();

  const p = platformAt(view, sec);
  const next = nextArrivals(view, sec);
  const limit = DATASET.constraints.platformDensityLimit.value;
  const over = p.density >= limit;

  return (
    <div className="hud">
      <div className="top-left">
      <section className="card brand" aria-label="İstasyon">
        <div className="line-badge" aria-hidden="true">T14</div>
        <div>
          <h1>{STATION.name}</h1>
          <p className="muted">Röda linjen · Fruängen – Mörby centrum</p>
        </div>
      </section>
        <KpiStrip />
      </div>

      <div className="right-col">
      <section className="card controls" aria-label="Simülasyon">
        <div className="clock-row">
          <div className="clock" aria-live="off">{fmtClock(sec)}</div>
          <button type="button" id="play" className="btn primary" onClick={() => setPlaying(!playing)}>
            {playing ? 'Duraklat' : 'Oynat'}
          </button>
        </div>
        <div className="row">
          <span className="label">Hız</span>
          <div className="seg" role="group" aria-label="Simülasyon hızı">
            {SPEEDS.map((s) => (
              <button type="button" key={s} id={`speed-${s}`} aria-pressed={speed === s} onClick={() => setSpeed(s)}>{s}×</button>
            ))}
          </div>
        </div>
        <div className="row">
          <span className="label">Plan</span>
          <div className="seg" role="group" aria-label="Sefer planı">
            {UI_PLANS.map((pl) => (
              <button type="button" key={pl.id} id={`plan-${pl.id}`} aria-pressed={planId === pl.id} onClick={() => setPlan(pl.id)}>
                {pl.label}
              </button>
            ))}
          </div>
        </div>
        <div className="row wrap">
          <span className="label">Git</span>
          {JUMPS.map((j) => (
            <button type="button" key={j.hhmm} id={`jump-${j.hhmm}`} className="chip" onClick={() => jumpTo(j.hhmm, j.scenario)}>
              {j.label} <span className="num">{j.hhmm}</span>
            </button>
          ))}
        </div>
        <p className="scenario">
          Senaryo: <strong>{SCENARIOS[scenario].name}</strong>
          {scenario === 'surge' && <span className="muted"> · 21:00–21:10 arası güneye +3 000 yolcu</span>}
        </p>
        <p className="hint">Sürükleyerek kaydırın · tekerlekle yakınlaştırın · sağ tuşla döndürün</p>
      </section>
        <Dock />
      </div>

      <section className="card live" aria-label="Canlı peron durumu">
        <div className="stat">
          <span className="label">Peronda</span>
          <span className="big num">{fmtInt(p.total)}</span>
          <span className="muted num">kuzey {fmtInt(p.north)} · güney {fmtInt(p.south)}</span>
        </div>
        <div className="stat">
          <span className="label">Yoğunluk</span>
          <span className={`big num ${over ? 'warn' : ''}`}>{fmtDec(p.density)}</span>
          <span className="muted num">kişi/m² · sınır {fmtDec(limit)}</span>
        </div>
        <div className="stat">
          <span className="label">Sonraki tren</span>
          <span className="num next">↑ Mörby c. <strong>{next.north == null ? '–' : fmtSecs(next.north)}</strong></span>
          <span className="num next">↓ Fruängen <strong>{next.south == null ? '–' : fmtSecs(next.south)}</strong></span>
        </div>
        <div className="legend" aria-label="Lejant">
          <div className="legend-row">
            <span className="label">Peron yoğunluğu</span>
            <span className="sw" style={{ background: C.heat.low }} />{HEAT_STEPS[0]}+
            <span className="sw" style={{ background: C.heat.mid }} />{HEAT_STEPS[1]}+
            <span className="sw" style={{ background: C.heat.high }} />{HEAT_STEPS[2]}+ kişi/m²
          </div>
          <div className="legend-row">
            <span className="label">Tren çatısı: doluluk</span>
            <span className="sw" style={{ background: C.load.ok }} />&lt;%75
            <span className="sw" style={{ background: C.load.busy }} />%75+
            <span className="sw" style={{ background: C.load.full }} />%90+
          </div>
        </div>
      </section>




    </div>
  );
}

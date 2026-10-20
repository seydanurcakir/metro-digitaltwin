import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { Scene } from './scene/Scene';
import { Hud } from './hud/Hud';
import { useTwin } from './twin/store';
import { SCENARIO_IDS, UI_PLANS, getResult } from './twin/model';
import { p90Series } from './twin/metrics';
import { getCorridor } from './twin/network';
import { removeHostingBadges } from './hosting-badge';
import './styles.css';

/** Advances the simulation clock (real time × speed) */
function useClock() {
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      useTwin.getState().tick(dt);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
}

/** Pre-computes the other plans and scenarios in idle time, so switching plans does not stutter */
function usePrewarm() {
  useEffect(() => {
    const jobs: (() => void)[] = [];
    for (const sc of SCENARIO_IDS)
      for (const p of UI_PLANS)
        jobs.push(() => { getResult(p.id, sc); p90Series(p.id, sc, 'station'); p90Series(p.id, sc, 'line'); getCorridor(p.id, sc); });
    let id = 0;
    const hasIdle = typeof window.requestIdleCallback === 'function';
    const idle = (cb: () => void) => (hasIdle ? window.requestIdleCallback(cb, { timeout: 2000 }) : window.setTimeout(cb, 200));
    const run = () => {
      const job = jobs.shift();
      if (!job) return;
      job();
      id = idle(run);
    };
    id = idle(run);
    return () => {
      jobs.length = 0;
      if (hasIdle) window.cancelIdleCallback(id);
      else window.clearTimeout(id);
    };
  }, []);
}

// Test hook: ?debug exposes the store to automated checks
if (new URLSearchParams(window.location.search).has('debug')) (window as unknown as Record<string, unknown>).__twin = useTwin;

function App() {
  useClock();
  usePrewarm();
  return (
    <div className="app">
      <div className="stage">
        <Scene />
      </div>
      <Hud />
    </div>
  );
}

removeHostingBadges();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

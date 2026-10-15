import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { Scene } from './scene/Scene';
import { Hud } from './hud/Hud';
import { useTwin } from './twin/store';
import './styles.css';

/** Simülasyon saatini ilerletir (gerçek zaman × hız) */
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

function App() {
  useClock();
  return (
    <div className="app">
      <div className="stage">
        <Scene />
      </div>
      <Hud />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

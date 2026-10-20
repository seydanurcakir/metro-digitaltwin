// Page theme (light/dark) for the parts of the scene that follow it: map ground and basemap style.
import { useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

export function currentTheme(): Theme {
  const forced = document.documentElement.dataset.theme;
  if (forced === 'light' || forced === 'dark') return forced;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function useTheme(): Theme {
  const [theme, setTheme] = useState<Theme>(currentTheme);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    const update = () => setTheme(currentTheme());
    mq?.addEventListener?.('change', update);
    const mo = new MutationObserver(update);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => { mq?.removeEventListener?.('change', update); mo.disconnect(); };
  }, []);
  return theme;
}

// Tıklama ve üzerine gelme davranışı. Sürükleme (kamera kaydırma) tıklama sayılmaz.
import type { ThreeEvent } from '@react-three/fiber';
import { useTwin, type Selection } from '../twin/store';

export const HIGHLIGHT = '#2E6FE0';
const DRAG_PX = 5;

export function clickable(get: () => Selection) {
  return {
    onClick: (e: ThreeEvent<MouseEvent>) => {
      if (e.delta > DRAG_PX) return;
      e.stopPropagation();
      const sel = get();
      if (sel) useTwin.getState().select(sel);
    },
    onPointerOver: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      useTwin.getState().setHover(true);
    },
    onPointerOut: () => useTwin.getState().setHover(false),
  };
}

export const sameSelection = (a: Selection, b: Selection) => JSON.stringify(a) === JSON.stringify(b);

// Tıklama ve üzerine gelme davranışı. Sürükleme (kamera kaydırma) tıklama sayılmaz.
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import type { Object3D } from 'three';
import { useTwin, type Selection } from '../twin/store';

/** Üzerine gelinen nesne. Görünmez olursa (ör. tren tünele girdi) imleç geri alınır. */
let hovered: Object3D | null = null;
const isShown = (o: Object3D | null) => { for (let x = o; x; x = x.parent) if (!x.visible) return false; return true; };

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
      hovered = e.eventObject;
      useTwin.getState().setHover(true);
    },
    onPointerOut: () => {
      hovered = null;
      useTwin.getState().setHover(false);
    },
  };
}

export const sameSelection = (a: Selection, b: Selection) => JSON.stringify(a) === JSON.stringify(b);

/** Her karede: üzerine gelinen nesne görünmez olduysa imleci sıfırla */
export function HoverGuard() {
  useFrame(() => {
    if (hovered && !isShown(hovered)) {
      hovered = null;
      useTwin.getState().setHover(false);
    }
  });
  return null;
}

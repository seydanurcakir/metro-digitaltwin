// Click and hover behaviour. Dragging (panning the camera) does not count as a click.
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import type { Object3D } from 'three';
import { useTwin, type Selection } from '../twin/store';

/** Hovered object. If it becomes invisible (e.g. a train enters a tunnel) the cursor is reset. */
let hovered: Object3D | null = null;
const isShown = (o: Object3D | null) => { for (let x = o; x; x = x.parent) if (!x.visible) return false; return true; };

export const HIGHLIGHT = '#2E6FE0';
const DRAG_PX = 5;

/**
 * Click/hover handlers that select an object. Hidden objects (e.g. unused trains in a pool) are still hit by
 * the raycaster, so they let the event pass through to whatever lies behind them.
 */
export function clickable(get: (e: ThreeEvent<MouseEvent>) => Selection, after?: () => void) {
  return {
    onClick: (e: ThreeEvent<MouseEvent>) => {
      if (e.delta > DRAG_PX) return;
      if (!isShown(e.eventObject)) return;
      const sel = get(e);
      if (!sel) return;
      e.stopPropagation();
      useTwin.getState().select(sel);
      after?.();
    },
    onPointerOver: (e: ThreeEvent<PointerEvent>) => {
      if (!isShown(e.eventObject)) return;
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

/** Every frame: if the hovered object became invisible, reset the cursor */
export function HoverGuard() {
  useFrame(() => {
    if (hovered && !isShown(hovered)) {
      hovered = null;
      useTwin.getState().setHover(false);
    }
  });
  return null;
}

import { useCallback, useEffect, useRef } from 'react';

export const LONG_PRESS_MS = 600;
const MOVE_TOLERANCE_PX = 10;

// Props for an element that should react to a press-and-hold. Moving more than
// 10px (a scroll), letting go or leaving cancels it.
export function useLongPress(onLongPress) {
  const timer = useRef(null);
  const start = useRef({ x: 0, y: 0 });
  const callback = useRef(onLongPress);

  useEffect(() => { callback.current = onLongPress; });

  const clear = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = null;
  }, []);

  useEffect(() => clear, [clear]);

  const onPointerDown = (e) => {
    clear();
    start.current = { x: e.clientX, y: e.clientY };
    timer.current = setTimeout(() => {
      timer.current = null;
      callback.current();
    }, LONG_PRESS_MS);
  };

  const onPointerMove = (e) => {
    if (timer.current === null) return;
    if (
      Math.abs(e.clientX - start.current.x) > MOVE_TOLERANCE_PX ||
      Math.abs(e.clientY - start.current.y) > MOVE_TOLERANCE_PX
    ) clear();
  };

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: clear,
    onPointerLeave: clear,
    onPointerCancel: clear,
    onContextMenu: (e) => e.preventDefault(),
  };
}

export default useLongPress;

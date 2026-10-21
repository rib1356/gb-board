import { useCallback, useEffect, useRef } from 'react';

export const LONG_PRESS_MS = 600;
const MOVE_TOLERANCE_PX = 10;
const GHOST_CLICK_MS = 600;

// iOS still sends a click where the finger lifts after a hold, and by then the
// hold has opened something there (the password sheet's backdrop, or the back
// button). Swallows that one click. A fresh touch, or 600ms after letting go,
// stands it down, so real taps always get through. Returns the stand-down.
function swallowNextClick() {
  let timer = null;
  const stop = () => {
    clearTimeout(timer);
    document.removeEventListener('click', swallow, true);
    document.removeEventListener('pointerdown', stop, true);
    document.removeEventListener('pointerup', lifted, true);
    document.removeEventListener('pointercancel', lifted, true);
  };
  const swallow = (e) => {
    e.preventDefault();
    e.stopPropagation();
    stop();
  };
  const lifted = () => {
    clearTimeout(timer);
    timer = setTimeout(stop, GHOST_CLICK_MS);
  };
  document.addEventListener('click', swallow, true);
  document.addEventListener('pointerdown', stop, true);
  document.addEventListener('pointerup', lifted, true);
  document.addEventListener('pointercancel', lifted, true);
  return stop;
}

// Props for an element that should react to a press-and-hold. Moving more than
// 10px (a scroll), letting go or leaving cancels it.
export function useLongPress(onLongPress) {
  const timer = useRef(null);
  const start = useRef({ x: 0, y: 0 });
  const callback = useRef(onLongPress);
  // Outlives the pressed element, which the hold usually swaps out.
  const stopSwallowing = useRef(null);

  useEffect(() => { callback.current = onLongPress; });

  const clear = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = null;
  }, []);

  useEffect(() => () => {
    clear();
    stopSwallowing.current?.();
  }, [clear]);

  const onPointerDown = (e) => {
    clear();
    start.current = { x: e.clientX, y: e.clientY };
    timer.current = setTimeout(() => {
      timer.current = null;
      stopSwallowing.current?.();
      stopSwallowing.current = swallowNextClick();
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

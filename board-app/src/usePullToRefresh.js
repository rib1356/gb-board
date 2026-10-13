import { useEffect, useRef, useState } from 'react';

// How far the indicator has to be dragged (after damping) before letting go
// refreshes, and the most it'll stretch.
export const PULL_THRESHOLD = 60;
const PULL_MAX = 90;

// Added to the home screen the app runs without browser chrome, so there's no
// built-in pull-to-refresh -- this does it for a page scrolled to the top.
// Returns the current pull distance (0 when idle) for drawing an indicator.
export function usePullToRefresh(enabled, onRefresh) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const onRefreshRef = useRef(onRefresh);

  useEffect(() => {
    onRefreshRef.current = onRefresh;
  });

  useEffect(() => {
    if (!enabled) return undefined;
    let startY = null;
    let distance = 0;

    const reset = () => {
      startY = null;
      distance = 0;
      setPull(0);
    };
    const onStart = (e) => {
      startY = window.scrollY <= 0 && e.touches.length === 1 ? e.touches[0].clientY : null;
      distance = 0;
    };
    const onMove = (e) => {
      if (startY === null) return;
      const dy = e.touches[0].clientY - startY;
      // Heading up is a normal scroll -- hand it back for the rest of the touch.
      if (dy <= 0) { reset(); return; }
      // Stops iOS rubber-banding the page while our own indicator stretches.
      e.preventDefault();
      distance = Math.min(dy / 2, PULL_MAX);
      setPull(distance);
    };
    const onEnd = async () => {
      if (startY === null) return;
      const pulledFarEnough = distance >= PULL_THRESHOLD;
      reset();
      if (!pulledFarEnough) return;
      setRefreshing(true);
      try {
        await onRefreshRef.current();
      } finally {
        setRefreshing(false);
      }
    };

    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd);
    window.addEventListener('touchcancel', reset);
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', reset);
      setPull(0);
    };
  }, [enabled]);

  return { pull, refreshing };
}

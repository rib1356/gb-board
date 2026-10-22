import { useRef } from 'react';

const MAX = 10;
const STEP = 0.5;
const TICKS = [0, 2, 4, 6, 8, 10];
const ACCENT = '#D9552B';

const snap = (v) => Math.round(v / STEP) * STEP;
const pct = (v) => `${(v / MAX) * 100}%`;
const keyFocusCss = '.pain-thumb:focus-visible { outline: 2px solid #EDEAE3; outline-offset: 3px; }';

// A 0-10 pain slider in half steps. Two thumbs give a range (low..high); with
// `single` there is one thumb (the high value) that can't go below `min`.
export default function PainSlider({ low, high, onChange, single = false, min = 0, label = 'Pain' }) {
  const trackRef = useRef(null);
  // Drag bookkeeping: which thumb is moving ('low', 'high', or 'pending' while
  // both sit on the same value and the first move hasn't picked one yet).
  const drag = useRef(null);
  const floor = single ? min : 0;

  const set = (nextLow, nextHigh) => {
    if (nextLow !== low || nextHigh !== high) onChange(nextLow, nextHigh);
  };
  const setThumb = (thumb, v) => {
    if (single) set(Math.max(v, floor), Math.max(v, floor));
    else if (thumb === 'low') set(Math.min(v, high), high);
    else set(low, Math.max(v, low));
  };

  const valueAt = (clientX) => {
    const { left, width } = trackRef.current.getBoundingClientRect();
    if (!width) return floor;
    const v = snap(((clientX - left) / width) * MAX);
    return Math.min(MAX, Math.max(floor, v));
  };

  const onPointerDown = (e) => {
    const v = valueAt(e.clientX);
    e.currentTarget.setPointerCapture?.(e.pointerId);
    if (single) {
      drag.current = { thumb: 'high' };
      setThumb('high', v);
      return;
    }
    const mid = (low + high) / 2;
    if (v === mid && low === high) {
      drag.current = { thumb: 'pending', anchor: v };
      return;
    }
    const which = v < mid ? 'low' : 'high';
    drag.current = { thumb: which };
    setThumb(which, v);
  };

  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d) return;
    const v = valueAt(e.clientX);
    if (d.thumb === 'pending') {
      if (v === d.anchor) return;
      d.thumb = v > d.anchor ? 'high' : 'low';
    }
    setThumb(d.thumb, v);
  };

  const endDrag = () => { drag.current = null; };

  const onKeyDown = (thumb) => (e) => {
    const current = thumb === 'low' ? low : high;
    const lo = thumb === 'high' && !single ? low : floor;
    const hi = thumb === 'low' ? high : MAX;
    let next;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = current + STEP;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = current - STEP;
    else if (e.key === 'Home') next = lo;
    else if (e.key === 'End') next = hi;
    else return;
    e.preventDefault();
    setThumb(thumb, Math.min(hi, Math.max(lo, next)));
  };

  const thumb = (which, value, name) => {
    const lo = which === 'high' && !single ? low : floor;
    const hi = which === 'low' ? high : MAX;
    return (
      <div
        className="pain-thumb"
        role="slider"
        tabIndex={0}
        aria-label={name}
        aria-valuemin={lo}
        aria-valuemax={hi}
        aria-valuenow={value}
        aria-orientation="horizontal"
        onKeyDown={onKeyDown(which)}
        style={{
          position: 'absolute', top: '50%', left: pct(value), width: 22, height: 22, boxSizing: 'border-box',
          transform: 'translate(-50%, -50%)', borderRadius: '50%', background: '#EDEAE3',
          border: `3px solid ${ACCENT}`,
        }}
      />
    );
  };

  const fillFrom = single ? floor : low;

  return (
    <div style={{ padding: '0 11px' }}>
      <style>{keyFocusCss}</style>
      <div
        ref={trackRef}
        data-testid="pain-track"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        style={{ position: 'relative', height: 36, cursor: 'pointer', touchAction: 'none' }}
      >
        <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 4, marginTop: -2, borderRadius: 2, background: '#3a3b3e' }} />
        <div style={{ position: 'absolute', top: '50%', height: 4, marginTop: -2, borderRadius: 2, background: ACCENT, left: pct(fillFrom), width: `${((high - fillFrom) / MAX) * 100}%` }} />
        {!single && thumb('low', low, 'Lowest pain')}
        {thumb('high', high, single ? label : 'Highest pain')}
      </div>
      <div aria-hidden="true" style={{ position: 'relative', height: 16, fontFamily: "'JetBrains Mono'", fontSize: 11, color: '#8b8d91' }}>
        {TICKS.map((t) => (
          <span key={t} style={{ position: 'absolute', left: pct(t), transform: 'translateX(-50%)' }}>{t}</span>
        ))}
      </div>
    </div>
  );
}

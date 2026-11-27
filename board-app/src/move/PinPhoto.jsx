import { useRef, useState } from 'react';
import { pointFromClientCoords } from '../lib/holds';

const PIN_HIT_PX = 22;
const LOUPE_PX = 120;
const LOUPE_ZOOM = 2.5;
const FINDER_PX = 104;
const FINDER_ZOOM = 3;
const PIN_COLOR = '#C9A227';

const clamp = (v) => Math.min(1, Math.max(0, v));

// A circle showing the photo zoomed in around a spot, with a crosshair on it.
function Zoom({ src, at, width, height, zoom, size, style }) {
  return (
    <div aria-hidden="true" style={{
      position: 'absolute', width: size, height: size, borderRadius: '50%', overflow: 'hidden',
      border: `2px solid ${PIN_COLOR}`, boxShadow: '0 4px 14px #000a', pointerEvents: 'none',
      backgroundColor: '#17181A', backgroundImage: `url("${src}")`, backgroundRepeat: 'no-repeat',
      backgroundSize: `${width * zoom}px ${height * zoom}px`,
      backgroundPosition: `${size / 2 - at.x * width * zoom}px ${size / 2 - at.y * height * zoom}px`,
      ...style,
    }}>
      <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: PIN_COLOR }} />
      <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 1, background: PIN_COLOR }} />
    </div>
  );
}

// A board photo you drop numbered pins on. Tap to add a pin; press on a pin
// to drag it. While a finger is down a magnifier shows the spot above it, so
// the finger doesn't hide what it's on. `finder(i)` can return
// { src, at } -- another photo to show zoomed in, for the pin being placed or
// dragged (the matching spot on the old photo).
export default function PinPhoto({ src, alt, pins, onChange, maxPins = 8, lockedCount = null, finder = null }) {
  const wrapRef = useRef(null);
  const [drag, setDrag] = useState(null); // { index, rect }
  const [size, setSize] = useState({ width: 0, height: 0 });
  const limit = lockedCount ?? maxPins;

  const measure = () => {
    const rect = wrapRef.current.getBoundingClientRect();
    setSize({ width: rect.width, height: rect.height });
    return rect;
  };

  const onPointerDown = (e) => {
    const rect = measure();
    const point = pointFromClientCoords(rect, e.clientX, e.clientY);
    let index = pins.findIndex((p) => Math.hypot((p.x - point.x) * rect.width, (p.y - point.y) * rect.height) <= PIN_HIT_PX);
    if (index === -1) {
      if (pins.length >= limit) return;
      index = pins.length;
      onChange([...pins, { x: clamp(point.x), y: clamp(point.y) }]);
    }
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setDrag({ index, rect });
  };

  const onPointerMove = (e) => {
    if (!drag) return;
    const point = pointFromClientCoords(drag.rect, e.clientX, e.clientY);
    onChange(pins.map((p, i) => (i === drag.index ? { x: clamp(point.x), y: clamp(point.y) } : p)));
  };

  const endDrag = () => setDrag(null);

  const active = drag ? pins[drag.index] : null;
  const findIndex = drag ? drag.index : pins.length;
  const find = finder && findIndex < limit ? finder(findIndex) : null;
  const { width, height } = size;

  return (
    <div style={{ position: 'relative' }}>
      <div
        ref={wrapRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        style={{
          position: 'relative', borderRadius: 14, overflow: 'hidden', border: '1px solid #2A2B2E',
          touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none', cursor: 'crosshair',
        }}
      >
        <img src={src} alt={alt} draggable={false} onLoad={measure} style={{ width: '100%', display: 'block' }} />
        {pins.map((p, i) => (
          <div key={i} data-testid="pin" style={{
            position: 'absolute', left: `${p.x * 100}%`, top: `${p.y * 100}%`, transform: 'translate(-50%, -50%)',
            width: 20, height: 20, borderRadius: '50%', border: `2px solid ${PIN_COLOR}`, background: '#17181Acc',
            color: PIN_COLOR, fontSize: 11, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace",
            display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none',
          }}>{i + 1}</div>
        ))}
      </div>
      {active && width > 0 && (
        <Zoom src={src} at={active} width={width} height={height} zoom={LOUPE_ZOOM} size={LOUPE_PX} style={{
          left: Math.min(width - LOUPE_PX, Math.max(0, active.x * width - LOUPE_PX / 2)),
          // Above the finger; below it when the spot is near the top.
          top: active.y * height > LOUPE_PX + 30 ? active.y * height - LOUPE_PX - 30 : active.y * height + 30,
        }} />
      )}
      {find && width > 0 && (
        // In the corner away from the spot: it'll be in about the same place
        // on this photo, and the zoom mustn't cover it.
        <div style={{
          position: 'absolute', pointerEvents: 'none', textAlign: 'center',
          ...(find.at.x > 0.5 ? { left: 8 } : { right: 8 }),
          ...(find.at.y > 0.5 ? { top: 8 } : { bottom: 8 }),
        }}>
          <Zoom src={find.src} at={find.at} width={width} height={height} zoom={FINDER_ZOOM} size={FINDER_PX} style={{ position: 'relative' }} />
          <div style={{ marginTop: 4, fontSize: 11, fontWeight: 700, color: PIN_COLOR, textShadow: '0 1px 3px #000' }}>
            Find spot {findIndex + 1}
          </div>
        </div>
      )}
    </div>
  );
}

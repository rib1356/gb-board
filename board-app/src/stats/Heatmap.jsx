import { useId, useMemo, useState } from 'react';
import { heatSpots } from '../lib/heatmap';

const muted = '#8b8d91';
const R = 28; // glow radius in viewBox units (the viewBox is 1000 wide): about one hold

// Warm ramp, pale amber (little used) to hot red-orange (most used). Heat
// also drives the glow's opacity, so the ramp still reads for colour-blind
// viewers. The glow is translucent and fades to nothing at its edge so the
// hold underneath stays visible; the photo itself is never darkened.
const LOW = [255, 176, 0];
const HIGH = [255, 69, 24];
const mix = (t) => `rgb(${LOW.map((c, i) => Math.round(c + (HIGH[i] - c) * t)).join(',')})`;
const strength = (heat, max) => (max > 1 ? (heat - 1) / (max - 1) : 0);

export default function Heatmap({ problems, photoUrl }) {
  const [aspect, setAspect] = useState(null); // photo height / width, once loaded
  const uid = useId().replace(/:/g, '');
  const spots = useMemo(
    () => (aspect ? heatSpots(problems, photoUrl, aspect) : []),
    [problems, photoUrl, aspect],
  );
  const max = spots.reduce((m, s) => Math.max(m, s.heat), 0);

  const onLoad = (e) => {
    const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
    if (w > 0 && h > 0) setAspect(h / w);
  };

  return (
    <div style={{ padding: '10px 0 12px' }}>
      <div style={{ position: 'relative', lineHeight: 0, borderRadius: 8, overflow: 'hidden' }}>
        <img
          src={photoUrl}
          alt="Board heatmap"
          onLoad={onLoad}
          style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 8 }}
        />
        {aspect && (
          <svg
            viewBox={`0 0 1000 ${1000 * aspect}`}
            aria-hidden="true"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
          >
            <defs>
              {[...new Set(spots.map((s) => s.heat))].map((heat) => {
                const t = strength(heat, max);
                const color = mix(t);
                return (
                  <radialGradient key={heat} id={`${uid}-g${heat}`}>
                    <stop offset="0" stopColor={color} stopOpacity={0.8 + 0.2 * t} />
                    <stop offset="0.55" stopColor={color} stopOpacity={0.55 + 0.3 * t} />
                    <stop offset="1" stopColor={color} stopOpacity="0" />
                  </radialGradient>
                );
              })}
            </defs>
            {spots.map((s, i) => (
              <circle
                key={i}
                data-testid="heat-spot"
                cx={s.x * 1000}
                cy={s.y * 1000 * aspect}
                r={R}
                fill={`url(#${uid}-g${s.heat})`}
              />
            ))}
          </svg>
        )}
      </div>
      <div style={{ marginTop: 10, fontSize: 11.5, color: muted, lineHeight: 1.4 }}>
        {max > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span>1 problem</span>
            {max > 1 && (
              <>
                <span aria-hidden="true" style={{ flex: 1, height: 8, borderRadius: 4, background: `linear-gradient(90deg, ${mix(0)}, ${mix(1)})` }} />
                <span>{`${max} problems`}</span>
              </>
            )}
          </div>
        )}
        <div>No glow: never used as a handhold</div>
      </div>
    </div>
  );
}

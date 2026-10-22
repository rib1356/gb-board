import { useId, useMemo, useState } from 'react';
import { heatSpots, HEAT_BANDS, heatBand } from '../lib/heatmap';

const muted = '#8b8d91';
const R = 28; // glow radius in viewBox units (the viewBox is 1000 wide): about one hold

// One colour per band of use (HEAT_BANDS), yellow to deep plum. Each step is
// clearly darker than the last, so the bands still read in order for
// colour-blind viewers. The glow fades to nothing at its edge so the hold
// underneath stays visible; the photo itself is never darkened.
const BAND_COLORS = ['#ffe14d', '#ff9a1f', '#e8361c', '#8e0d52'];

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
              {BAND_COLORS.map((color, band) => (
                <radialGradient key={band} id={`${uid}-g${band}`}>
                  <stop offset="0" stopColor={color} stopOpacity="0.95" />
                  <stop offset="0.55" stopColor={color} stopOpacity="0.8" />
                  <stop offset="1" stopColor={color} stopOpacity="0" />
                </radialGradient>
              ))}
            </defs>
            {spots.map((s, i) => (
              <circle
                key={i}
                data-testid="heat-spot"
                cx={s.x * 1000}
                cy={s.y * 1000 * aspect}
                r={R}
                fill={`url(#${uid}-g${heatBand(s.heat)})`}
              />
            ))}
          </svg>
        )}
      </div>
      <div style={{ marginTop: 10, fontSize: 11.5, color: muted, lineHeight: 1.4 }}>
        {max > 0 && (
          <div data-testid="heat-legend" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 12px', marginBottom: 4 }}>
            <span>Used by</span>
            {HEAT_BANDS.slice(0, heatBand(max) + 1).map((b, band) => (
              <span key={b.label} data-testid="heat-band" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 5, background: BAND_COLORS[band] }} />
                {b.label}
              </span>
            ))}
            <span>{max === 1 ? 'problem' : 'problems'}</span>
          </div>
        )}
        <div>No glow: never used as a handhold</div>
      </div>
    </div>
  );
}

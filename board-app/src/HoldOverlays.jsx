import { Fragment } from 'react';
import { isPinned, tagLabel, facesOnPhoto, faceCenter } from './lib/volumes';

export function ChalkRing({ x, y, color, label, size = 34 }) {
  return (
    <div
      data-testid="hold-marker"
      style={{
        position: 'absolute',
        left: `${x * 100}%`,
        top: `${y * 100}%`,
        transform: 'translate(-50%, -50%)',
        width: size,
        height: size,
        pointerEvents: 'none',
      }}
    >
      <svg width={size} height={size} viewBox="0 0 40 40">
        <circle
          cx="20" cy="20" r="15"
          fill="none"
          stroke={color}
          strokeWidth="2.5"
          strokeDasharray="4 3"
          strokeLinecap="round"
          transform="rotate(-12 20 20)"
        />
      </svg>
      {label ? (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 700, color,
        }}>{label}</div>
      ) : null}
    </div>
  );
}

// The same darker-shade border segment.js gives a segmented hold
// (BORDER_BRIGHTNESS), so a face reads as the same kind of mark.
function shade(hex, factor = 0.45) {
  const n = parseInt(hex.slice(1), 16);
  const channel = (shift) => Math.round(((n >> shift) & 255) * factor);
  return `rgb(${channel(16)}, ${channel(8)}, ${channel(0)})`;
}

// Drawn from the face's corner points rather than baked into the saved
// highlight image, so it needs no segmentation and stays crisp at any size.
export function FaceShape({ points, color, fillOpacity = 0.65 }) {
  return (
    <svg
      data-testid="face-shape"
      viewBox="0 0 1 1"
      preserveAspectRatio="none"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
    >
      <polygon
        points={points.map((p) => `${p.x},${p.y}`).join(' ')}
        fill={color}
        fillOpacity={fillOpacity}
        stroke={shade(color)}
        strokeOpacity={0.9}
        strokeWidth={3}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export function TagPill({ x, y, text, color }) {
  return (
    <div
      data-testid="tag-pill"
      style={{
        position: 'absolute', left: `${x * 100}%`, top: `${y * 100}%`,
        // Holds near the right edge get their label on the left, so it stays on the photo.
        transform: x > 0.75 ? 'translate(calc(-100% - 10px), 8px)' : 'translate(10px, 8px)',
        background: '#17181Ae6', color: '#EDEAE3', border: `1px solid ${color}`, borderRadius: 999,
        padding: '1px 7px', fontSize: 10.5, fontWeight: 700, whiteSpace: 'nowrap', pointerEvents: 'none',
      }}
    >{text}</div>
  );
}

// Drawn on top of whatever shows the hold itself (saved highlight, live mask
// or chalk ring). A pinned face has nothing else showing it, so it gets its
// own ring and always carries its name.
export function HoldLabels({ hold, color }) {
  const tag = tagLabel(hold);
  if (hold.face && isPinned(hold.face)) {
    return (
      <>
        <ChalkRing x={hold.x} y={hold.y} color={color} />
        <TagPill x={hold.x} y={hold.y} color={color} text={tag ? `${hold.face.label} · ${tag}` : hold.face.label} />
      </>
    );
  }
  return tag ? <TagPill x={hold.x} y={hold.y} color={color} text={tag} /> : null;
}

export function MarkingDots({ points }) {
  return points.map((p, i) => (
    <div key={i} style={{
      position: 'absolute', left: `${p.x * 100}%`, top: `${p.y * 100}%`, transform: 'translate(-50%, -50%)',
      width: 9, height: 9, borderRadius: '50%', background: '#D9552B', border: '2px solid #17181A',
      pointerEvents: 'none',
    }} />
  ));
}

const MARK_COLOR = '#C08552';

// Setup view: every face marked on this photo in one neutral colour, plus the
// outline being drawn right now.
export function VolumeMarks({ volumes, photoUrl, marking }) {
  return (
    <>
      {facesOnPhoto(volumes, photoUrl).flatMap(({ volume, faces }) => faces.map((face) => {
        // The side being re-marked is shown by its new outline instead.
        if (marking && marking.faceId === face.id) return null;
        const center = faceCenter(face.points);
        return (
          <Fragment key={face.id}>
            {isPinned(face)
              ? <ChalkRing x={center.x} y={center.y} color={MARK_COLOR} />
              : <FaceShape points={face.points} color={MARK_COLOR} fillOpacity={0.35} />}
            <TagPill x={center.x} y={center.y} color={MARK_COLOR} text={`${volume.name} ${face.name}`} />
          </Fragment>
        );
      }))}
      {marking && marking.points.length >= 3 && <FaceShape points={marking.points} color="#D9552B" fillOpacity={0.35} />}
      {marking && <MarkingDots points={marking.points} />}
    </>
  );
}

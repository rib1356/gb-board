import { useEffect, useRef, useState } from 'react';
import { isMovedBy, moveHold } from '../lib/movePhoto';
import { isPinned } from '../lib/volumes';
import { gradeLabel } from '../lib/problemList';
import { ChalkRing, FaceShape, PinnedFace } from '../HoldOverlays';
import { primaryButton, linkButton } from '../ui';
import OldProblem, { ThroughLineUp } from './OldProblem';

const HOLD_TO_COMPARE_MS = 250;

const heading = { fontFamily: "'Bebas Neue', sans-serif", fontSize: 26, letterSpacing: 1, margin: '0 0 2px', color: '#EDEAE3' };
const row = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginTop: 14 };
const fixButton = {
  background: 'transparent', color: '#EDEAE3', border: '1px solid #3a3b3e', borderRadius: 10,
  padding: '11px 16px', fontWeight: 700, fontSize: 14, cursor: 'pointer',
};
const fill = { position: 'absolute', left: 0, top: 0, pointerEvents: 'none' };

function Holds({ holds, colors, volumes, withRings }) {
  return (
    <>
      {holds.map((h, i) => (h.face && !isPinned(h.face) ? <FaceShape key={`f${i}`} points={h.face.points} color={colors[h.type]} /> : null))}
      {withRings && holds.map((h, i) => (h.face ? null : <ChalkRing key={`r${i}`} x={h.x} y={h.y} color={colors[h.type]} />))}
      {holds.map((h, i) => <PinnedFace key={`p${i}`} hold={h} color={colors[h.type]} volumes={volumes} />)}
    </>
  );
}

// One problem at a time, drawn on the new photo: Accept moves it, Fix holds
// re-places its holds there first, Skip leaves it on the old photo for now.
// Holding the photo shows the old one underneath, lined up, to spot a hold
// that's moved.
export default function CheckScreen({
  list, index, onIndexChange, alignment, H, colors, volumes, busyId, error,
  onAccept, onFix, onPutBack, onRedoLineUp,
}) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [comparing, setComparing] = useState(false);
  const holdTimer = useRef(null);
  useEffect(() => () => clearTimeout(holdTimer.current), []);

  if (list.length === 0) {
    return <p style={{ fontSize: 14, color: '#8b8d91' }}>Nothing to move.</p>;
  }

  const i = Math.min(Math.max(index, 0), list.length - 1);
  const problem = list[i];
  const isMoved = (p) => isMovedBy(p, alignment);
  const movedCount = list.filter(isMoved).length;
  const allMoved = movedCount === list.length;
  const done = isMoved(problem);
  // Anything saving locks the whole screen: two saves at once could leave the
  // app's copy of a problem out of step with the database.
  const busy = busyId != null;
  const savingThis = busyId === problem.id;
  const before = done ? problem.moved_from[problem.moved_from.length - 1] : problem;

  // The next problem still waiting, after this one, wrapping round.
  const skip = () => {
    const order = [...list.keys()].slice(i + 1).concat([...list.keys()].slice(0, i + 1));
    const next = order.find((j) => !isMoved(list[j]));
    onIndexChange(next ?? Math.min(i + 1, list.length - 1));
  };

  const startHold = () => {
    clearTimeout(holdTimer.current);
    holdTimer.current = setTimeout(() => setComparing(true), HOLD_TO_COMPARE_MS);
  };
  const endHold = () => {
    clearTimeout(holdTimer.current);
    setComparing(false);
  };
  const measure = (e) => setSize({ width: e.currentTarget.clientWidth, height: e.currentTarget.clientHeight });

  const shownHolds = done ? problem.holds : problem.holds.map((h) => moveHold(H, h, { volumes, to: alignment.to }));
  const hasMask = !!problem.mask_url;

  return (
    <div>
      {allMoved && (
        <div style={{ background: '#232427', border: '1px solid #3a3b3e', borderRadius: 12, padding: '12px 14px', marginBottom: 14 }}>
          <p style={{ margin: '0 0 10px', fontSize: 14 }}>All moved. The old photo isn&apos;t used any more.</p>
          <button onClick={() => onIndexChange(-1)} style={primaryButton(true)}>Back to Tweaks</button>
        </div>
      )}

      <h1 style={heading}>MOVE PROBLEMS</h1>
      <p style={{ margin: '0 0 12px', fontSize: 13, color: '#8b8d91' }}>{`${i + 1} of ${list.length} · ${movedCount} moved`}</p>

      <div
        onPointerDown={startHold}
        onPointerUp={endHold}
        onPointerCancel={endHold}
        onPointerLeave={endHold}
        onContextMenu={(e) => e.preventDefault()}
        style={{
          position: 'relative', borderRadius: 14, overflow: 'hidden', border: '1px solid #2A2B2E',
          userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none',
        }}
      >
        <img src={alignment.to} alt="New board photo" onLoad={measure} draggable={false} style={{ width: '100%', display: 'block' }} />
        {comparing ? (
          <OldProblem photoUrl={alignment.from} maskUrl={before.mask_url} holds={before.holds} H={H} size={size} colors={colors} />
        ) : (
          <>
            {done && problem.mask_url && (
              <img src={problem.mask_url} alt="" style={{ ...fill, width: '100%', height: '100%' }} />
            )}
            {!done && problem.mask_url && <ThroughLineUp src={problem.mask_url} H={H} size={size} testId="moved-highlight" />}
            <Holds holds={shownHolds} colors={colors} volumes={volumes} withRings={!hasMask} />
          </>
        )}
      </div>
      <p style={{ margin: '6px 0 0', fontSize: 12, color: '#6d6f73' }}>Hold the photo to compare with the old one.</p>

      <div style={{ marginTop: 12 }}>
        <div style={{ fontWeight: 600, fontSize: 16 }}>{problem.name}</div>
        <div style={{ fontSize: 12.5, color: '#8b8d91', marginTop: 2 }}>
          {[gradeLabel(problem), problem.setter ? `Set by ${problem.setter}` : null].filter(Boolean).join(' · ')}
        </div>
      </div>

      {done ? (
        <div style={{ ...row, alignItems: 'flex-start' }}>
          <span style={{ color: '#5C8A66', fontWeight: 700, fontSize: 14 }}>Moved ✓</span>
          <div style={{ textAlign: 'right' }}>
            <button onClick={() => onPutBack(problem)} disabled={busy} style={{ ...linkButton, marginLeft: 'auto' }}>Put back</button>
            <div style={{ fontSize: 11.5, color: '#6d6f73', marginTop: 2 }}>Undoes anything changed since the move.</div>
          </div>
        </div>
      ) : (
        <div style={row}>
          <button onClick={() => onFix(problem)} disabled={busy} style={fixButton}>Fix holds</button>
          <button onClick={() => onAccept(problem)} disabled={busy} style={{ ...primaryButton(!busy), minWidth: 120 }}>
            {savingThis ? 'Moving…' : 'Accept'}
          </button>
        </div>
      )}
      {error && <p role="alert" style={{ color: '#D9552B', fontSize: 13, margin: '10px 0 0' }}>{error}</p>}

      <div style={row}>
        <button onClick={() => onIndexChange(i - 1)} disabled={busy || i === 0} style={linkButton}>‹ Back</button>
        <button onClick={skip} disabled={busy} style={linkButton}>Skip ›</button>
      </div>

      <button onClick={onRedoLineUp} disabled={busy} style={{ ...linkButton, marginTop: 24, color: '#8b8d91', fontSize: 13 }}>Redo line-up</button>
    </div>
  );
}

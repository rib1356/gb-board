import { cssMatrix3d } from '../lib/homography';
import { moveHold } from '../lib/movePhoto';
import { isPinned } from '../lib/volumes';
import { ChalkRing, FaceShape } from '../HoldOverlays';

const fill = { position: 'absolute', left: 0, top: 0, pointerEvents: 'none' };

// An image from the old photo's frame, drawn over the new photo through the
// line-up. Before the photo has a size there's nothing to scale it to.
export function ThroughLineUp({ src, H, size, alt = '', testId }) {
  const sized = size.width > 0;
  return (
    <img
      src={src}
      alt={alt}
      data-testid={testId}
      draggable={false}
      style={{
        ...fill,
        width: sized ? size.width : '100%', height: sized ? size.height : '100%',
        transformOrigin: '0 0', transform: sized ? cssMatrix3d(H, size.width, size.height) : undefined,
      }}
    />
  );
}

// A problem as it was on the old photo, laid over the new one through the
// line-up: the old photo, then its highlight -- or rings and sides where it
// never had a highlight image.
export default function OldProblem({ photoUrl, maskUrl, holds, H, size, colors }) {
  return (
    <>
      <ThroughLineUp src={photoUrl} H={H} size={size} alt="Old photo" />
      {maskUrl ? (
        <ThroughLineUp src={maskUrl} H={H} size={size} />
      ) : (
        holds.map((h) => moveHold(H, h)).map((h, i) => (h.face && !isPinned(h.face)
          ? <FaceShape key={i} points={h.face.points} color={colors[h.type]} />
          : <ChalkRing key={i} x={h.x} y={h.y} color={colors[h.type]} />))
      )}
    </>
  );
}

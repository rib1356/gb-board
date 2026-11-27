// Moving problems from an old board photo onto a new one, once the two photos
// are lined up (see homography.js). A problem keeps a list of where it's been
// (`moved_from`, newest last), so any move can be put back exactly.

import { applyHomography } from './homography';
import { faceCenter } from './volumes';

const movePoint = (H, p) => applyHomography(H, p);

// A hold on the old photo, where it sits on the new one. A face's corners are
// copied into the problem when it's set, so they move with it; the hold sits
// at their centre, the same way faceHold places it.
export function moveHold(H, hold) {
  if (!hold.face) return { ...hold, ...movePoint(H, hold) };
  const points = hold.face.points.map((p) => movePoint(H, p));
  return { ...hold, ...faceCenter(points), face: { ...hold.face, points } };
}

// The photos problems are still on, other than the board's current one, with
// how many each -- most first.
export function olderPhotos(problems, currentPhotoUrl) {
  const counts = new Map();
  for (const p of problems) {
    if (!p.photo_url || p.photo_url === currentPhotoUrl) continue;
    counts.set(p.photo_url, (counts.get(p.photo_url) || 0) + 1);
  }
  return [...counts].map(([photoUrl, count]) => ({ photoUrl, count })).sort((a, b) => b.count - a.count);
}

const lastMove = (problem) => problem.moved_from?.[problem.moved_from.length - 1] ?? null;

export function isMovedBy(problem, alignment) {
  return problem.photo_url === alignment.to && lastMove(problem)?.photo_url === alignment.from;
}

// What the check goes through: problems still on the old photo, and the ones
// this line-up has already moved (so they can be looked at or put back).
export function checkList(problems, alignment) {
  return problems.filter((p) => p.photo_url === alignment.from || isMovedBy(p, alignment));
}

// The update that moves a problem, remembering what it was.
export function movedFields(problem, { photoUrl, holds, maskUrl }, movedAt) {
  const was = { photo_url: problem.photo_url, holds: problem.holds, mask_url: problem.mask_url ?? null, moved_at: movedAt };
  return { photo_url: photoUrl, holds, mask_url: maskUrl, moved_from: [...(problem.moved_from || []), was] };
}

// The update that undoes the last move.
export function putBackFields(problem) {
  const history = problem.moved_from || [];
  const { photo_url, holds, mask_url } = history[history.length - 1];
  const rest = history.slice(0, -1);
  return { photo_url, holds, mask_url, moved_from: rest.length ? rest : null };
}

export function sidesOnPhoto(volumes, photoUrl) {
  return (volumes || []).flatMap((v) => v.faces
    .filter((f) => f.points.length > 0 && f.photoUrl === photoUrl)
    .map((f) => ({ volumeId: v.id, faceId: f.id, points: f.points })));
}

const samePoints = (a, b) => a.length === b.length
  && a.every((p, i) => Math.abs(p.x - b[i].x) < 1e-6 && Math.abs(p.y - b[i].y) < 1e-6);

// Moves the volume sides that were on the old photo (sidesBefore) onto the new
// one. On a redo (prevH given), a side the first line-up moved is moved again
// from where it started; one Rob has since re-marked by hand is left alone.
export function moveSides(volumes, sidesBefore, { from, to, H, prevH = null }) {
  const before = new Map(sidesBefore.map((s) => [`${s.volumeId}/${s.faceId}`, s]));
  return volumes.map((v) => ({
    ...v,
    faces: v.faces.map((f) => {
      const start = before.get(`${v.id}/${f.id}`);
      if (!start) return f;
      if (f.photoUrl === from) return { ...f, points: f.points.map((p) => movePoint(H, p)), photoUrl: to };
      const untouched = prevH && f.photoUrl === to && samePoints(f.points, start.points.map((p) => movePoint(prevH, p)));
      if (untouched) return { ...f, points: start.points.map((p) => movePoint(H, p)), photoUrl: to };
      return f;
    }),
  }));
}

// Saves a line-up, replacing an earlier one between the same two photos. The
// earlier one's sidesBefore is kept: it's where the sides really started.
export function upsertAlignment(alignments, entry) {
  const list = alignments || [];
  const i = list.findIndex((a) => a.from === entry.from && a.to === entry.to);
  if (i === -1) return [...list, entry];
  return list.map((a, j) => (j === i ? { ...entry, sidesBefore: a.sidesBefore } : a));
}

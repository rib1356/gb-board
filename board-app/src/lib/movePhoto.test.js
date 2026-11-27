import { describe, it, expect } from 'vitest';
import { solveHomography } from './homography';
import {
  moveHold, olderPhotos, isMovedBy, checkList, movedFields, putBackFields,
  sidesOnPhoto, moveSides, upsertAlignment,
} from './movePhoto';

const OLD = 'https://cdn.example/old.jpg';
const NEW = 'https://cdn.example/new.jpg';
const OTHER = 'https://cdn.example/other.jpg';
const CORNERS = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
const shiftBy = (dx, dy) => solveHomography(CORNERS.map((p) => ({ from: p, to: { x: p.x + dx, y: p.y + dy } })));
const SHIFT = shiftBy(0.1, 0.05);
const close = (actual, expected) => {
  expect(actual.x).toBeCloseTo(expected.x, 6);
  expect(actual.y).toBeCloseTo(expected.y, 6);
};

describe('moveHold', () => {
  it('moves a plain hold and keeps its type', () => {
    const moved = moveHold(SHIFT, { x: 0.2, y: 0.3, type: 'start' });
    close(moved, { x: 0.3, y: 0.35 });
    expect(moved.type).toBe('start');
  });

  it("moves every corner of a face and centres the hold on them", () => {
    const face = { volumeId: 'v1', faceId: 'f1', label: 'Vol1 Top', points: [{ x: 0.1, y: 0.1 }, { x: 0.3, y: 0.1 }, { x: 0.2, y: 0.4 }] };
    const moved = moveHold(SHIFT, { x: 0.2, y: 0.2, type: 'hold', face });
    close(moved.face.points[0], { x: 0.2, y: 0.15 });
    close(moved.face.points[2], { x: 0.3, y: 0.45 });
    close(moved, { x: 0.3, y: 0.25 });
    expect(moved.face).toMatchObject({ volumeId: 'v1', faceId: 'f1', label: 'Vol1 Top' });
  });

  it('puts a pinned face on its moved pin', () => {
    const face = { volumeId: 'v1', faceId: 'f9', label: 'Vol1 Under', points: [{ x: 0.5, y: 0.6 }] };
    close(moveHold(SHIFT, { x: 0.5, y: 0.6, type: 'foot', face }), { x: 0.6, y: 0.65 });
  });

  describe('onto volume sides marked on the new photo', () => {
    const face = { volumeId: 'v1', faceId: 'f1', label: 'Vol1 Top', points: [{ x: 0.1, y: 0.1 }, { x: 0.3, y: 0.1 }, { x: 0.2, y: 0.4 }] };
    const remarked = [{ x: 0.5, y: 0.5 }, { x: 0.7, y: 0.5 }, { x: 0.6, y: 0.8 }];
    const volumes = (photoUrl, points = remarked) => [{ id: 'v1', name: 'Vol1', faces: [{ id: 'f1', name: 'Top', points, photoUrl }] }];

    it('takes the side as marked on the new photo, so a re-marked volume carries over', () => {
      const moved = moveHold(SHIFT, { x: 0.2, y: 0.2, type: 'hold', face }, { volumes: volumes('new.jpg'), to: 'new.jpg' });
      expect(moved.face.points).toEqual(remarked);
      close(moved, { x: 0.6, y: 0.6 });
      expect(moved.face).toMatchObject({ volumeId: 'v1', faceId: 'f1', label: 'Vol1 Top' });
      expect(moved.type).toBe('hold');
    });

    it("moves its own copy when the side isn't marked on the new photo", () => {
      const stillOld = moveHold(SHIFT, { x: 0.2, y: 0.2, type: 'hold', face }, { volumes: volumes('old.jpg'), to: 'new.jpg' });
      close(stillOld.face.points[0], { x: 0.2, y: 0.15 });
      const unmarked = moveHold(SHIFT, { x: 0.2, y: 0.2, type: 'hold', face }, { volumes: volumes('new.jpg', []), to: 'new.jpg' });
      close(unmarked.face.points[0], { x: 0.2, y: 0.15 });
      const gone = moveHold(SHIFT, { x: 0.2, y: 0.2, type: 'hold', face }, { volumes: [], to: 'new.jpg' });
      close(gone.face.points[0], { x: 0.2, y: 0.15 });
    });

    it('leaves plain holds to the line-up', () => {
      close(moveHold(SHIFT, { x: 0.2, y: 0.3, type: 'start' }, { volumes: volumes('new.jpg'), to: 'new.jpg' }), { x: 0.3, y: 0.35 });
    });
  });
});

describe('olderPhotos', () => {
  it('groups problems not on the current photo, most first, ignoring ones with no photo', () => {
    const problems = [
      { id: 'a', photo_url: 'old1' }, { id: 'b', photo_url: 'old2' }, { id: 'c', photo_url: 'old1' },
      { id: 'd', photo_url: NEW }, { id: 'e', photo_url: null }, { id: 'f', photo_url: 'old1' },
    ];
    expect(olderPhotos(problems, NEW)).toEqual([{ photoUrl: 'old1', count: 3 }, { photoUrl: 'old2', count: 1 }]);
  });
});

describe('isMovedBy and checkList', () => {
  const alignment = { from: OLD, to: NEW };
  const moved = { id: 'm', photo_url: NEW, moved_from: [{ photo_url: OLD }] };
  const movedElsewhere = { id: 'x', photo_url: NEW, moved_from: [{ photo_url: OTHER }] };
  const waiting = { id: 'w', photo_url: OLD, moved_from: null };
  const setOnNew = { id: 'n', photo_url: NEW, moved_from: null };

  it('knows which problems this line-up moved', () => {
    expect(isMovedBy(moved, alignment)).toBe(true);
    expect(isMovedBy(movedElsewhere, alignment)).toBe(false);
    expect(isMovedBy(waiting, alignment)).toBe(false);
    expect(isMovedBy(setOnNew, alignment)).toBe(false);
  });

  it('lists waiting and moved problems in their original order', () => {
    expect(checkList([setOnNew, moved, waiting, movedElsewhere], alignment).map((p) => p.id)).toEqual(['m', 'w']);
  });
});

describe('movedFields and putBackFields', () => {
  const problem = { id: 'p1', photo_url: OLD, holds: [{ x: 0.1, y: 0.1, type: 'start' }], mask_url: 'old-mask', moved_from: null };
  const target = { photoUrl: NEW, holds: [{ x: 0.2, y: 0.15, type: 'start' }], maskUrl: 'new-mask' };

  it('moves a problem and keeps what it was', () => {
    expect(movedFields(problem, target, '2026-11-27T10:00:00Z')).toEqual({
      photo_url: NEW, holds: target.holds, mask_url: 'new-mask',
      moved_from: [{ photo_url: OLD, holds: problem.holds, mask_url: 'old-mask', moved_at: '2026-11-27T10:00:00Z' }],
    });
  });

  it('keeps every earlier version when a problem moves twice', () => {
    const once = { ...problem, ...movedFields(problem, target, 't1') };
    const twice = movedFields(once, { photoUrl: OTHER, holds: [], maskUrl: null }, 't2');
    expect(twice.moved_from.map((m) => m.photo_url)).toEqual([OLD, NEW]);
  });

  it('puts a problem back exactly as it was', () => {
    const once = { ...problem, ...movedFields(problem, target, 't1') };
    expect(putBackFields(once)).toEqual({ photo_url: OLD, holds: problem.holds, mask_url: 'old-mask', moved_from: null });
  });

  it('puts back one move at a time', () => {
    const once = { ...problem, ...movedFields(problem, target, 't1') };
    const twice = { ...once, ...movedFields(once, { photoUrl: OTHER, holds: [], maskUrl: null }, 't2') };
    const back = putBackFields(twice);
    expect(back.photo_url).toBe(NEW);
    expect(back.moved_from.map((m) => m.photo_url)).toEqual([OLD]);
  });
});

describe('sidesOnPhoto and moveSides', () => {
  const top = { id: 'f1', name: 'Top', points: [{ x: 0.1, y: 0.1 }, { x: 0.3, y: 0.1 }, { x: 0.2, y: 0.3 }], photoUrl: OLD };
  const unmarked = { id: 'f2', name: 'Left', points: [], photoUrl: null };
  const elsewhere = { id: 'f3', name: 'Right', points: [{ x: 0.5, y: 0.5 }], photoUrl: OTHER };
  const volumes = [{ id: 'v1', name: 'Vol1', sidesListed: true, faces: [top, unmarked, elsewhere] }];
  const sidesBefore = sidesOnPhoto(volumes, OLD);

  it('lists the marked sides on a photo', () => {
    expect(sidesBefore).toEqual([{ volumeId: 'v1', faceId: 'f1', points: top.points }]);
  });

  it('moves sides on the old photo and leaves the rest alone', () => {
    const moved = moveSides(volumes, sidesBefore, { from: OLD, to: NEW, H: SHIFT });
    const [f1, f2, f3] = moved[0].faces;
    expect(f1.photoUrl).toBe(NEW);
    close(f1.points[0], { x: 0.2, y: 0.15 });
    expect(f2).toEqual(unmarked);
    expect(f3).toEqual(elsewhere);
  });

  it('re-moves a side from where it started when the line-up is redone', () => {
    const first = moveSides(volumes, sidesBefore, { from: OLD, to: NEW, H: SHIFT });
    const redone = moveSides(first, sidesBefore, { from: OLD, to: NEW, H: shiftBy(0.2, 0), prevH: SHIFT });
    close(redone[0].faces[0].points[0], { x: 0.3, y: 0.1 });
  });

  it('leaves a side alone if it was re-marked by hand after the first move', () => {
    const first = moveSides(volumes, sidesBefore, { from: OLD, to: NEW, H: SHIFT });
    const handMarked = [{ ...first[0], faces: [{ ...first[0].faces[0], points: [{ x: 0.9, y: 0.9 }] }, unmarked, elsewhere] }];
    const redone = moveSides(handMarked, sidesBefore, { from: OLD, to: NEW, H: shiftBy(0.2, 0), prevH: SHIFT });
    expect(redone[0].faces[0].points).toEqual([{ x: 0.9, y: 0.9 }]);
  });
});

describe('upsertAlignment', () => {
  const first = { from: OLD, to: NEW, pairs: ['a'], sidesBefore: ['s1'], saved_at: 't1' };

  it('adds a new line-up', () => {
    expect(upsertAlignment([], first)).toEqual([first]);
  });

  it('replaces a redone line-up but keeps where the sides started', () => {
    const redo = { from: OLD, to: NEW, pairs: ['b'], sidesBefore: ['s2'], saved_at: 't2' };
    expect(upsertAlignment([first], redo)).toEqual([{ ...redo, sidesBefore: ['s1'] }]);
  });

  it('keeps line-ups between other photos', () => {
    const other = { from: OTHER, to: NEW, pairs: [], sidesBefore: [], saved_at: 't3' };
    expect(upsertAlignment([first], other)).toEqual([first, other]);
  });
});

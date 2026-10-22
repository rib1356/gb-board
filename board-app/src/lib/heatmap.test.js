import { describe, it, expect } from 'vitest';
import { heatSpots, problemsOnPhoto } from './heatmap';

const P = (id, created_at, holds, photo_url = 'photo-1') => ({ id, created_at, photo_url, holds });
const H = (x, y, type = 'hold') => ({ x, y, type });
const F = (volumeId, faceId, x, y, type = 'hold') => ({
  x, y, type, face: { volumeId, faceId, label: 'Vol Top', points: [] },
});

describe('heatSpots', () => {
  it('merges marks of the same hold from different problems, and counts each problem once', () => {
    const problems = [
      P('a', '2026-10-01T00:00:00Z', [H(0.5, 0.5, 'start'), H(0.505, 0.5)]),
      P('b', '2026-10-02T00:00:00Z', [H(0.51, 0.505, 'finish')]),
    ];
    const spots = heatSpots(problems, 'photo-1', 1);
    expect(spots).toHaveLength(1);
    expect(spots[0].heat).toBe(2);
    expect(spots[0].x).toBeCloseTo((0.5 + 0.505 + 0.51) / 3);
    expect(spots[0].face).toBe(false);
  });

  it('keeps holds further apart than the radius as separate spots', () => {
    const spots = heatSpots([P('a', '2026-10-01T00:00:00Z', [H(0.5, 0.5), H(0.53, 0.5)])], 'photo-1', 1);
    expect(spots.map((s) => s.heat)).toEqual([1, 1]);
  });

  it('measures vertical gaps in real proportions using the aspect ratio', () => {
    const problems = [P('a', '2026-10-01T00:00:00Z', [H(0.5, 0.5), H(0.5, 0.515)])];
    expect(heatSpots(problems, 'photo-1', 1)).toHaveLength(1);
    expect(heatSpots(problems, 'photo-1', 1.5)).toHaveLength(2);
  });

  it('ignores foot holds, including a volume side used as a foot', () => {
    const problems = [P('a', '2026-10-01T00:00:00Z', [H(0.2, 0.2, 'foot'), F('v1', 'top', 0.4, 0.4, 'foot'), H(0.6, 0.6)])];
    expect(heatSpots(problems, 'photo-1', 1)).toEqual([{ x: 0.6, y: 0.6, heat: 1, face: false }]);
  });

  it('groups volume sides by which side they are, not by distance', () => {
    const problems = [
      P('a', '2026-10-01T00:00:00Z', [F('v1', 'top', 0.4, 0.4), H(0.401, 0.401)]),
      P('b', '2026-10-02T00:00:00Z', [F('v1', 'top', 0.42, 0.4)]),
    ];
    const spots = heatSpots(problems, 'photo-1', 1);
    expect(spots).toHaveLength(2);
    expect(spots.find((s) => s.face)).toMatchObject({ heat: 2, y: 0.4 });
    expect(spots.find((s) => s.face).x).toBeCloseTo(0.41);
    expect(spots.find((s) => !s.face).heat).toBe(1);
  });

  it('leaves out problems marked on another photo', () => {
    const problems = [P('a', '2026-10-01T00:00:00Z', [H(0.5, 0.5)], 'photo-0'), P('b', '2026-10-02T00:00:00Z', [H(0.7, 0.7)])];
    expect(heatSpots(problems, 'photo-1', 1)).toEqual([{ x: 0.7, y: 0.7, heat: 1, face: false }]);
  });

  it('gives the same spots whatever order the problems arrive in', () => {
    const problems = [
      P('a', '2026-10-01T00:00:00Z', [H(0.5, 0.5)]),
      P('b', '2026-10-02T00:00:00Z', [H(0.515, 0.5)]),
      P('c', '2026-10-03T00:00:00Z', [H(0.53, 0.5)]),
    ];
    expect(heatSpots([...problems].reverse(), 'photo-1', 1)).toEqual(heatSpots(problems, 'photo-1', 1));
  });
});

describe('problemsOnPhoto', () => {
  it('keeps only problems set on the given photo, and none without one', () => {
    const a = P('a', '2026-10-01T00:00:00Z', [], 'photo-1');
    const b = P('b', '2026-10-01T00:00:00Z', [], 'photo-0');
    expect(problemsOnPhoto([a, b], 'photo-1')).toEqual([a]);
    expect(problemsOnPhoto([a, b], null)).toEqual([]);
  });
});

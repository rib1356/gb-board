import { describe, it, expect } from 'vitest';
import { solveHomography, applyHomography, invertHomography, cssMatrix3d } from './homography';

const CORNERS = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
const pairsFor = (fn, points = CORNERS) => points.map((from) => ({ from, to: fn(from) }));
const expectPoint = (actual, expected) => {
  expect(actual.x).toBeCloseTo(expected.x, 6);
  expect(actual.y).toBeCloseTo(expected.y, 6);
};

describe('solveHomography and applyHomography', () => {
  it('maps every point to itself when the photos already match', () => {
    const H = solveHomography(pairsFor((p) => p));
    expectPoint(applyHomography(H, { x: 0.3, y: 0.7 }), { x: 0.3, y: 0.7 });
  });

  it('handles a shift and a scale', () => {
    const H = solveHomography(pairsFor((p) => ({ x: 0.1 + 0.8 * p.x, y: 0.05 + 0.9 * p.y })));
    expectPoint(applyHomography(H, { x: 0.5, y: 0.5 }), { x: 0.5, y: 0.5 });
    expectPoint(applyHomography(H, { x: 0.25, y: 0.75 }), { x: 0.3, y: 0.725 });
  });

  it('handles a change of camera angle', () => {
    const to = [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.05 }, { x: 0.95, y: 0.95 }, { x: 0.05, y: 0.9 }];
    const pairs = CORNERS.map((from, i) => ({ from, to: to[i] }));
    const H = solveHomography(pairs);
    pairs.forEach(({ from, to: t }) => expectPoint(applyHomography(H, from), t));
  });

  it('fits more than four points', () => {
    const to = [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.05 }, { x: 0.95, y: 0.95 }, { x: 0.05, y: 0.9 }];
    const pairs = CORNERS.map((from, i) => ({ from, to: to[i] }));
    const H4 = solveHomography(pairs);
    const H5 = solveHomography([...pairs, { from: { x: 0.5, y: 0.5 }, to: applyHomography(H4, { x: 0.5, y: 0.5 }) }]);
    pairs.forEach(({ from, to: t }) => expectPoint(applyHomography(H5, from), t));
  });

  it('gives no fit for three points in a line, a repeated point, or too few points', () => {
    const inLine = [{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.5 }, { x: 0.9, y: 0.9 }, { x: 0.1, y: 0.9 }];
    expect(solveHomography(pairsFor((p) => p, inLine))).toBeNull();
    const repeated = [{ x: 0.1, y: 0.1 }, { x: 0.1, y: 0.1 }, { x: 0.9, y: 0.9 }, { x: 0.1, y: 0.9 }];
    expect(solveHomography(pairsFor((p) => p, repeated))).toBeNull();
    expect(solveHomography(pairsFor((p) => p, CORNERS.slice(0, 3)))).toBeNull();
  });

  it('gives no fit when the new-photo points are in a line', () => {
    const to = [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }, { x: 0.3, y: 0.3 }, { x: 0.4, y: 0.4 }];
    expect(solveHomography(CORNERS.map((from, i) => ({ from, to: to[i] })))).toBeNull();
  });
});

describe('invertHomography', () => {
  it('undoes the mapping', () => {
    const to = [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.05 }, { x: 0.95, y: 0.95 }, { x: 0.05, y: 0.9 }];
    const H = solveHomography(CORNERS.map((from, i) => ({ from, to: to[i] })));
    const p = { x: 0.37, y: 0.61 };
    expectPoint(applyHomography(invertHomography(H), applyHomography(H, p)), p);
  });
});

describe('cssMatrix3d', () => {
  it('is the identity matrix when the photos already match', () => {
    const H = solveHomography(pairsFor((p) => p));
    expect(cssMatrix3d(H, 200, 100)).toBe('matrix3d(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1)');
  });

  it('scales the shift to the element size', () => {
    const H = solveHomography(pairsFor((p) => ({ x: 0.1 + 0.8 * p.x, y: 0.05 + 0.9 * p.y })));
    expect(cssMatrix3d(H, 200, 100)).toBe('matrix3d(0.8,0,0,0,0,0.9,0,0,0,0,1,0,20,5,0,1)');
  });
});

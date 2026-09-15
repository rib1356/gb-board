import { describe, it, expect } from 'vitest';
import { pointFromClientCoords, validateDraft, holdAtPoint } from './holds';

describe('pointFromClientCoords', () => {
  it('converts a click at the center of the image to {0.5, 0.5}', () => {
    const rect = { left: 100, top: 50, width: 400, height: 200 };
    expect(pointFromClientCoords(rect, 300, 150)).toEqual({ x: 0.5, y: 0.5 });
  });

  it('converts a click at the top-left corner to {0, 0}', () => {
    const rect = { left: 0, top: 0, width: 400, height: 200 };
    expect(pointFromClientCoords(rect, 0, 0)).toEqual({ x: 0, y: 0 });
  });
});

describe('validateDraft', () => {
  it('rejects a blank name', () => {
    expect(
      validateDraft({ name: '   ', holds: [{ x: 0.1, y: 0.1, type: 'hold' }] })
    ).toBe('Give the problem a name first.');
  });

  it('rejects zero holds', () => {
    expect(validateDraft({ name: 'Gaston Traverse', holds: [] })).toBe(
      'Tap the board to mark at least one hold.'
    );
  });

  it('accepts a name and at least one hold', () => {
    expect(
      validateDraft({ name: 'Gaston Traverse', holds: [{ x: 0.1, y: 0.1, type: 'hold' }] })
    ).toBeNull();
  });
});

describe('holdAtPoint', () => {
  it('returns -1 when no hold is near the tapped point', () => {
    const holds = [{ x: 0.1, y: 0.1, type: 'hold' }];
    expect(holdAtPoint(holds, 0.9, 0.9, 0.05, 0.05)).toBe(-1);
  });

  it('finds a maskless hold within its circle radius', () => {
    const holds = [{ x: 0.5, y: 0.5, type: 'hold' }];
    expect(holdAtPoint(holds, 0.51, 0.49, 0.05, 0.05)).toBe(0);
  });

  it('does not match a maskless hold outside its circle radius', () => {
    const holds = [{ x: 0.5, y: 0.5, type: 'hold' }];
    expect(holdAtPoint(holds, 0.6, 0.5, 0.05, 0.05)).toBe(-1);
  });

  it('hit-tests a masked hold against its actual mask pixels, not a fixed radius', () => {
    // 4x4 mask, only the top-left quadrant is filled -- a point over the
    // filled quadrant should hit even though it's outside the tiny circle
    // radius that would apply to a maskless hold.
    const data = new Uint8Array(16);
    data[0] = data[1] = data[4] = data[5] = 1; // (0,0) (1,0) (0,1) (1,1)
    const holds = [{ x: 0.5, y: 0.5, type: 'hold', _mask: { width: 4, height: 4, data } }];
    expect(holdAtPoint(holds, 0.1, 0.1, 0.02, 0.02)).toBe(0);
    expect(holdAtPoint(holds, 0.9, 0.9, 0.02, 0.02)).toBe(-1);
  });

  it('returns the topmost (last-placed) hold when two overlap', () => {
    const holds = [
      { x: 0.5, y: 0.5, type: 'start' },
      { x: 0.5, y: 0.5, type: 'hold' },
    ];
    expect(holdAtPoint(holds, 0.5, 0.5, 0.05, 0.05)).toBe(1);
  });
});

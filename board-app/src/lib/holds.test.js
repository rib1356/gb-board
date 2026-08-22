import { describe, it, expect } from 'vitest';
import { pointFromClientCoords, validateDraft } from './holds';

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

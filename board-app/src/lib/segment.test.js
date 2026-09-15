import { describe, it, expect } from 'vitest';
import { fracToPixel, maskToRgba } from './segment';

describe('fracToPixel', () => {
  it('converts the center fraction to the center pixel', () => {
    expect(fracToPixel(0.5, 0.5, 400, 200)).toEqual({ x: 200, y: 100 });
  });

  it('converts the top-left fraction to the origin pixel', () => {
    expect(fracToPixel(0, 0, 400, 200)).toEqual({ x: 0, y: 0 });
  });
});

describe('maskToRgba', () => {
  it('tints masked pixels with the given color and leaves others transparent', () => {
    const mask = { width: 2, height: 1, data: [1, 0] };
    const result = maskToRgba(mask, '#D9552B', 0.5);

    expect(Array.from(result)).toEqual([
      217, 85, 43, Math.round(0.5 * 255),
      0, 0, 0, 0,
    ]);
  });

  it('returns an all-transparent buffer for an empty mask', () => {
    const mask = { width: 2, height: 2, data: [0, 0, 0, 0] };
    const result = maskToRgba(mask, '#5C8A66', 0.5);

    expect(result.every((v) => v === 0)).toBe(true);
    expect(result.length).toBe(16);
  });
});

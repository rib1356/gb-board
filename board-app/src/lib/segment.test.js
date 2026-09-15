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
  it('tints an interior masked pixel with the fill color', () => {
    // 3x3 fully-masked square: the center pixel has all 4 neighbors masked,
    // so it's interior; every other pixel touches the mask's edge.
    const mask = { width: 3, height: 3, data: [1, 1, 1, 1, 1, 1, 1, 1, 1] };
    const result = maskToRgba(mask, '#D9552B', 0.5, '#000000', 1);

    const centerOffset = 4 * 4; // pixel index 4 = (1,1)
    expect(Array.from(result.slice(centerOffset, centerOffset + 4))).toEqual([
      217, 85, 43, Math.round(0.5 * 255),
    ]);
  });

  it('outlines the mask boundary with the border color instead of the fill color', () => {
    const mask = { width: 3, height: 3, data: [1, 1, 1, 1, 1, 1, 1, 1, 1] };
    const result = maskToRgba(mask, '#D9552B', 0.5, '#000000', 1);

    const topLeftOffset = 0; // pixel index 0 = (0,0), touches the mask edge
    expect(Array.from(result.slice(topLeftOffset, topLeftOffset + 4))).toEqual([0, 0, 0, 255]);
  });

  it('leaves unmasked pixels transparent', () => {
    const mask = { width: 2, height: 1, data: [1, 0] };
    const result = maskToRgba(mask, '#D9552B', 0.5, '#000000', 1);

    expect(Array.from(result.slice(4, 8))).toEqual([0, 0, 0, 0]);
  });

  it('returns an all-transparent buffer for an empty mask', () => {
    const mask = { width: 2, height: 2, data: [0, 0, 0, 0] };
    const result = maskToRgba(mask, '#5C8A66', 0.5);

    expect(result.every((v) => v === 0)).toBe(true);
    expect(result.length).toBe(16);
  });
});

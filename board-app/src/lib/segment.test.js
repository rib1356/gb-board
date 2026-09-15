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

function filledSquare(size) {
  return { width: size, height: size, data: new Array(size * size).fill(1) };
}

describe('maskToRgba', () => {
  it('tints a deep-interior masked pixel with the fill color', () => {
    // 20x20 fully-masked square: the center pixel is far from every edge,
    // so it's interior even with a multi-pixel-thick border band.
    const mask = filledSquare(20);
    const result = maskToRgba(mask, '#D9552B', 0.5);

    const centerIndex = 10 * 20 + 10;
    const centerOffset = centerIndex * 4;
    expect(Array.from(result.slice(centerOffset, centerOffset + 4))).toEqual([
      217, 85, 43, Math.round(0.5 * 255),
    ]);
  });

  it('outlines the mask boundary with a darker shade of the fill color, not a fixed color', () => {
    const mask = filledSquare(20);
    const result = maskToRgba(mask, '#D9552B', 0.5, 1);

    const topLeftOffset = 0; // pixel index 0 = (0,0), touches the mask edge
    // Darkened #D9552B (217, 85, 43) at 45% brightness.
    expect(Array.from(result.slice(topLeftOffset, topLeftOffset + 4))).toEqual([98, 38, 19, 255]);
  });

  it('gives the border band real width, not just the single outermost pixel', () => {
    // A pixel a few pixels in from the edge should still read as border --
    // a single-pixel-wide outline looks jagged against SAM's rough mask
    // edges, so the band needs to be thick enough to smooth that out.
    const mask = filledSquare(20);
    const result = maskToRgba(mask, '#D9552B', 0.5, 1);

    const nearEdgeIndex = 3 * 20 + 3; // (3,3) -- a few px in from the (0,0) corner
    const nearEdgeOffset = nearEdgeIndex * 4;
    expect(Array.from(result.slice(nearEdgeOffset, nearEdgeOffset + 4))).toEqual([98, 38, 19, 255]);
  });

  it('keeps the border band from getting too thick', () => {
    const mask = filledSquare(20);
    const result = maskToRgba(mask, '#D9552B', 0.5);

    // (5,5) is close enough to the (0,0) corner to have been swallowed by an
    // overly generous border band -- it should read as fill, not border.
    const index = 5 * 20 + 5;
    const offset = index * 4;
    expect(Array.from(result.slice(offset, offset + 4))).toEqual([217, 85, 43, 128]);
  });

  it('leaves unmasked pixels transparent', () => {
    const mask = { width: 2, height: 1, data: [1, 0] };
    const result = maskToRgba(mask, '#D9552B', 0.5, 1);

    expect(Array.from(result.slice(4, 8))).toEqual([0, 0, 0, 0]);
  });

  it('returns an all-transparent buffer for an empty mask', () => {
    const mask = { width: 2, height: 2, data: [0, 0, 0, 0] };
    const result = maskToRgba(mask, '#5C8A66', 0.5);

    expect(result.every((v) => v === 0)).toBe(true);
    expect(result.length).toBe(16);
  });
});

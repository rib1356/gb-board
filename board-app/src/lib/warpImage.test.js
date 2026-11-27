import { describe, it, expect } from 'vitest';
import { solveHomography } from './homography';
import { warpImageData } from './warpImage';

const CORNERS = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
const IDENTITY = solveHomography(CORNERS.map((p) => ({ from: p, to: p })));
const image = (width, height, pixels) => ({ width, height, data: new Uint8ClampedArray(pixels.flat()) });

describe('warpImageData', () => {
  it('copies the image when nothing moves', () => {
    const src = image(2, 2, [[255, 0, 0, 255], [0, 255, 0, 255], [0, 0, 255, 255], [9, 9, 9, 128]]);
    const out = warpImageData(src, IDENTITY, 2, 2);
    expect(out.width).toBe(2);
    expect(Array.from(out.data)).toEqual(Array.from(src.data));
  });

  it('leaves pixels transparent where they come from outside the image', () => {
    const offImage = solveHomography(CORNERS.map((p) => ({ from: p, to: { x: p.x + 5, y: p.y } })));
    const src = image(2, 2, [[255, 0, 0, 255], [255, 0, 0, 255], [255, 0, 0, 255], [255, 0, 0, 255]]);
    const out = warpImageData(src, offImage, 2, 2);
    expect(Array.from(out.data).filter((_, i) => i % 4 === 3)).toEqual([0, 0, 0, 0]);
  });

  it('scales to the output size', () => {
    const out = warpImageData(image(1, 1, [[255, 0, 0, 255]]), IDENTITY, 4, 4);
    expect(out.data.length).toBe(4 * 4 * 4);
    for (let i = 0; i < out.data.length; i += 4) expect(Array.from(out.data.slice(i, i + 4))).toEqual([255, 0, 0, 255]);
  });
});

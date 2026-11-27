import { describe, it, expect, vi, afterEach } from 'vitest';
import { solveHomography } from './homography';
import { warpImageData, warpMaskBlob } from './warpImage';

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

describe('warpMaskBlob', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("reads the new photo's size once, and frees the images and canvases it used", async () => {
    const bitmaps = [];
    const fetchMock = vi.fn(async () => ({ ok: true, blob: async () => new Blob(['x']) }));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('createImageBitmap', vi.fn(async () => {
      const bitmap = { width: 2, height: 2, close: vi.fn() };
      bitmaps.push(bitmap);
      return bitmap;
    }));
    const imagesMade = [];
    vi.stubGlobal('Image', class {
      constructor() { imagesMade.push(this); }
      set src(url) { this.naturalWidth = 4; this.naturalHeight = 4; queueMicrotask(() => this.onload()); }
    });
    vi.stubGlobal('ImageData', class { constructor(data, width, height) { Object.assign(this, { data, width, height }); } });
    const canvases = [];
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      if (tag !== 'canvas') return realCreate(tag);
      const canvas = {
        width: 0, height: 0,
        getContext: () => ({
          drawImage: vi.fn(),
          getImageData: () => ({ width: 2, height: 2, data: new Uint8ClampedArray(16) }),
          putImageData: vi.fn(),
        }),
        toBlob: (cb) => cb(new Blob(['png'], { type: 'image/png' })),
      };
      canvases.push(canvas);
      return canvas;
    });

    await warpMaskBlob('mask-1.png', 'photo.jpg', IDENTITY);
    const blob = await warpMaskBlob('mask-2.png', 'photo.jpg', IDENTITY);

    expect(blob.type).toBe('image/png');
    expect(imagesMade).toHaveLength(1);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['mask-1.png', 'mask-2.png']);
    bitmaps.forEach((b) => expect(b.close).toHaveBeenCalled());
    expect(canvases.length).toBeGreaterThan(0);
    canvases.forEach((c) => expect(c.width).toBe(0));
  });
});

// Redraws a problem's highlight image from the old board photo onto the new
// one, so a moved problem keeps its highlight without re-segmenting.

import { applyHomography, invertHomography } from './homography';

// For each output pixel, find where it came from on the source (Hinv maps a
// new-photo fraction back to an old-photo fraction) and copy that pixel.
// Nearest-neighbour: highlights are flat colour, so smoothing buys nothing.
export function warpImageData(src, Hinv, outWidth, outHeight) {
  const data = new Uint8ClampedArray(outWidth * outHeight * 4);
  for (let y = 0; y < outHeight; y++) {
    for (let x = 0; x < outWidth; x++) {
      const from = applyHomography(Hinv, { x: (x + 0.5) / outWidth, y: (y + 0.5) / outHeight });
      if (!(from.x >= 0 && from.x < 1 && from.y >= 0 && from.y < 1)) continue;
      const s = (Math.floor(from.y * src.height) * src.width + Math.floor(from.x * src.width)) * 4;
      const o = (y * outWidth + x) * 4;
      data[o] = src.data[s];
      data[o + 1] = src.data[s + 1];
      data[o + 2] = src.data[s + 2];
      data[o + 3] = src.data[s + 3];
    }
  }
  return { width: outWidth, height: outHeight, data };
}

// Fetched rather than loaded with <img crossOrigin>: a browser that already
// cached the image without CORS headers would refuse it to a canvas.
async function loadBitmap(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Could not load ${url} (${res.status})`);
  return createImageBitmap(await res.blob());
}

// Browser-only (needs a canvas). The highlight comes out at the new photo's
// size, ready to upload.
export async function warpMaskBlob(maskUrl, newPhotoUrl, H) {
  const Hinv = invertHomography(H);
  if (!Hinv) throw new Error('The line-up has no inverse');
  const [mask, photo] = await Promise.all([loadBitmap(maskUrl), loadBitmap(newPhotoUrl)]);

  const read = document.createElement('canvas');
  read.width = mask.width;
  read.height = mask.height;
  const readCtx = read.getContext('2d');
  readCtx.drawImage(mask, 0, 0);
  const src = readCtx.getImageData(0, 0, mask.width, mask.height);

  const out = warpImageData(src, Hinv, photo.width, photo.height);
  const write = document.createElement('canvas');
  write.width = out.width;
  write.height = out.height;
  write.getContext('2d').putImageData(new ImageData(out.data, out.width, out.height), 0, 0);
  return new Promise((resolve, reject) => {
    write.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not create highlight image'))), 'image/png');
  });
}

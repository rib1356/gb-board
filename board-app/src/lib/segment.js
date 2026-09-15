import { SamModel, AutoProcessor, RawImage } from '@huggingface/transformers';

const MODEL_ID = 'Xenova/slimsam-77-uniform';

let segmenterPromise = null;

async function loadModel(device) {
  const model = await SamModel.from_pretrained(MODEL_ID, { dtype: 'fp16', device });
  const processor = await AutoProcessor.from_pretrained(MODEL_ID);
  return { model, processor, device };
}

// Loads once per page session (the encoder/decoder weights are cached by the
// browser after the first successful load). Tries WebGPU first for fast
// per-tap decoding; falls back to wasm on devices without WebGPU support.
export function loadSegmenter() {
  if (!segmenterPromise) {
    segmenterPromise = loadModel('webgpu').catch(() => loadModel('wasm'));
  }
  return segmenterPromise;
}

// Runs the (expensive, ~1-3s) image encoder once per photo. Everything after
// this is a cheap per-point decode against the cached embeddings.
export async function computeEmbedding(segmenter, photoUrl) {
  const image = await RawImage.fromURL(photoUrl);
  const imageProcessed = await segmenter.processor(image);
  const imageEmbeddings = await segmenter.model.get_image_embeddings(imageProcessed);
  return { imageEmbeddings, imageProcessed, width: image.width, height: image.height };
}

// Decodes a mask for a single tapped point (fractions 0-1, same space as a
// hold's stored x/y) against embeddings already computed for this photo.
export async function maskAtPoint(segmenter, embedding, xFrac, yFrac) {
  const { x, y } = fracToPixel(xFrac, yFrac, embedding.width, embedding.height);

  const { pred_masks, iou_scores } = await segmenter.model({
    ...embedding.imageEmbeddings,
    input_points: [[[[x, y]]]],
    input_labels: [[[1]]],
  });

  const masks = await segmenter.processor.post_process_masks(
    pred_masks,
    embedding.imageProcessed.original_sizes,
    embedding.imageProcessed.reshaped_input_sizes
  );

  const [maskTensor] = masks;
  const scores = iou_scores.data;
  let bestIndex = 0;
  for (let i = 1; i < scores.length; i++) {
    if (scores[i] > scores[bestIndex]) bestIndex = i;
  }

  const [, , height, width] = maskTensor.dims;
  const stride = height * width;
  const data = maskTensor.data.slice(bestIndex * stride, (bestIndex + 1) * stride);

  return { width, height, data };
}

// DOM-dependent glue (canvas) -- not unit tested here, same as image.js's
// resizeFileToBlob. Verified by manual QA in a real browser.
export function maskToDataUrl(mask, hexColor, alpha = 0.55) {
  const canvas = document.createElement('canvas');
  canvas.width = mask.width;
  canvas.height = mask.height;
  const ctx = canvas.getContext('2d');
  const rgba = maskToRgba(mask, hexColor, alpha);
  ctx.putImageData(new ImageData(rgba, mask.width, mask.height), 0, 0);
  return canvas.toDataURL('image/png');
}

// Flattens every hold's mask (tinted by its own color) onto one canvas the
// size of the board photo, for a single stored highlight per problem.
export function compositeMaskBlob(entries, width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  for (const { mask, color } of entries) {
    const rgba = maskToRgba(mask, color, 0.55);
    ctx.putImageData(new ImageData(rgba, mask.width, mask.height), 0, 0);
  }
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not create mask blob'))), 'image/png');
  });
}

export function fracToPixel(xFrac, yFrac, width, height) {
  return {
    x: Math.round(xFrac * width),
    y: Math.round(yFrac * height),
  };
}

function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

export function maskToRgba(mask, hexColor, alpha) {
  const { r, g, b } = hexToRgb(hexColor);
  const a = Math.round(alpha * 255);
  const out = new Uint8ClampedArray(mask.width * mask.height * 4);

  for (let i = 0; i < mask.data.length; i++) {
    if (!mask.data[i]) continue;
    const offset = i * 4;
    out[offset] = r;
    out[offset + 1] = g;
    out[offset + 2] = b;
    out[offset + 3] = a;
  }

  return out;
}

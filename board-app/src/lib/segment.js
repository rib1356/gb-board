import { SamModel, AutoProcessor, RawImage, Tensor } from '@huggingface/transformers';

const MODEL_ID = 'Xenova/slimsam-77-uniform';

let segmenterPromise = null;

// fp16 is well-supported natively on GPU (webgpu) but onnxruntime-web's wasm/CPU
// path has broken fp16 support for this model -- session creation throws on
// internal precision-cast fusion nodes, and even with that fusion pass
// disabled, a separate fp16 type-mismatch error follows. q8 (int8 quantized,
// transformers.js's own documented default dtype for the wasm device) avoids
// this entirely -- verified directly: the full encode-then-decode pipeline
// produces a real mask with q8 on wasm, where fp16 never got past session
// creation. It also downloads a smaller model, which helps on memory-
// constrained mobile hardware regardless of the fp16 bug.
const DTYPE_BY_DEVICE = { webgpu: 'fp16', wasm: 'q8' };

async function loadModel(device) {
  const model = await SamModel.from_pretrained(MODEL_ID, { dtype: DTYPE_BY_DEVICE[device], device });
  const processor = await AutoProcessor.from_pretrained(MODEL_ID);
  return { model, processor, device };
}

// onnxruntime-web's WebGPU backend fails to register on WebKit -- the engine
// every iOS browser is required to embed (Safari, Chrome, Firefox all run on
// WebKit on iOS, Apple-mandated) -- even though navigator.gpu itself reports
// as available there (confirmed directly: requestAdapter() resolves fine,
// but onnxruntime-web's own EP registration still throws). Trying webgpu
// anyway means paying for a full, wasted onnxruntime-web WASM-runtime
// initialization on every load before the wasm fallback gets its turn --
// exactly the kind of memory spike that's the leading suspect for the tab
// getting killed and silently reloaded on constrained mobile hardware.
export function isWebGpuUnreliable(userAgent) {
  const isIOS = /iPad|iPhone|iPod/.test(userAgent);
  const isDesktopSafari = /^((?!chrome|android).)*safari/i.test(userAgent);
  return isIOS || isDesktopSafari;
}

// Loads once per page session (the encoder/decoder weights are cached by the
// browser after the first successful load). Tries WebGPU first for fast
// per-tap decoding; falls back to wasm on devices without WebGPU support (or
// skips straight to wasm on WebKit, see isWebGpuUnreliable above).
export function loadSegmenter() {
  if (!segmenterPromise) {
    segmenterPromise = isWebGpuUnreliable(navigator.userAgent)
      ? loadModel('wasm')
      : loadModel('webgpu').catch(() => loadModel('wasm'));
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
  // The point prompt must be in the processor's reshaped/padded input space
  // (not the original photo's pixel space) -- reshaped_input_sizes is [h, w].
  const [reshapedHeight, reshapedWidth] = embedding.imageProcessed.reshaped_input_sizes[0];
  const { x, y } = fracToPixel(xFrac, yFrac, reshapedWidth, reshapedHeight);

  // input_points/input_labels must be real Tensor instances -- plain nested
  // arrays are silently treated as absent by the model's input validator.
  const input_points = new Tensor('float32', [x, y], [1, 1, 1, 2]);
  const input_labels = new Tensor('int64', [1n], [1, 1, 1]);

  const { pred_masks, iou_scores } = await segmenter.model({
    ...embedding.imageEmbeddings,
    input_points,
    input_labels,
  });

  const masksPerImage = await segmenter.processor.post_process_masks(
    pred_masks,
    embedding.imageProcessed.original_sizes,
    embedding.imageProcessed.reshaped_input_sizes
  );

  // SAM returns 3 candidate masks per point; post_process_masks comes back
  // channel-interleaved (mask.data[numMasks * pixel + maskIndex]) once read
  // through RawImage.fromTensor, so the highest-IoU candidate is picked per
  // pixel that way rather than by slicing a contiguous block.
  const mask = RawImage.fromTensor(masksPerImage[0][0]);
  const scores = iou_scores.data;
  const numMasks = scores.length;
  let bestIndex = 0;
  for (let i = 1; i < numMasks; i++) {
    if (scores[i] > scores[bestIndex]) bestIndex = i;
  }

  const data = new Uint8Array(mask.width * mask.height);
  for (let i = 0; i < data.length; i++) {
    data[i] = mask.data[numMasks * i + bestIndex] === 1 ? 1 : 0;
  }

  return { width: mask.width, height: mask.height, data };
}

// DOM-dependent glue (canvas) -- not unit tested here, same as image.js's
// resizeFileToBlob. Verified by manual QA in a real browser.
export function maskToDataUrl(mask, hexColor, alpha = DEFAULT_FILL_ALPHA) {
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
    // putImageData writes raw pixels -- including each mask's transparent
    // background -- straight onto the canvas, wiping out any hold drawn
    // there before it. Painting onto a throwaway layer first and compositing
    // that with drawImage (which alpha-blends) keeps every hold visible.
    const layer = document.createElement('canvas');
    layer.width = mask.width;
    layer.height = mask.height;
    const layerCtx = layer.getContext('2d');
    const rgba = maskToRgba(mask, color);
    layerCtx.putImageData(new ImageData(rgba, mask.width, mask.height), 0, 0);
    ctx.drawImage(layer, 0, 0);
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

// A single-pixel-wide outline follows SAM's rough mask edges exactly, which
// reads as jagged/squiggly. Widening the border to a band a few pixels thick
// makes that far less noticeable without smoothing the mask itself.
const BORDER_THICKNESS_PX = 4;

function isBoundaryPixel(mask, x, y, thickness = BORDER_THICKNESS_PX) {
  const { width, height, data } = mask;
  const t2 = thickness * thickness;
  for (let dy = -thickness; dy <= thickness; dy++) {
    const ny = y + dy;
    if (ny < 0 || ny >= height) return true;
    for (let dx = -thickness; dx <= thickness; dx++) {
      if (dx * dx + dy * dy > t2) continue;
      const nx = x + dx;
      if (nx < 0 || nx >= width || !data[ny * width + nx]) return true;
    }
  }
  return false;
}

export const DEFAULT_FILL_ALPHA = 0.65;
export const DEFAULT_BORDER_ALPHA = 0.9;
const BORDER_BRIGHTNESS = 0.45;

function darken({ r, g, b }, factor) {
  return { r: Math.round(r * factor), g: Math.round(g * factor), b: Math.round(b * factor) };
}

// A border around the mask's boundary, in a darker shade of the same fill
// color, keeps it visible regardless of fill color -- a pale fill (e.g. the
// white "hold" type) can otherwise disappear against a light board.
export function maskToRgba(mask, hexColor, alpha = DEFAULT_FILL_ALPHA, borderAlpha = DEFAULT_BORDER_ALPHA) {
  const fill = hexToRgb(hexColor);
  const border = darken(fill, BORDER_BRIGHTNESS);
  const fillA = Math.round(alpha * 255);
  const borderA = Math.round(borderAlpha * 255);
  const out = new Uint8ClampedArray(mask.width * mask.height * 4);

  for (let y = 0; y < mask.height; y++) {
    for (let x = 0; x < mask.width; x++) {
      const i = y * mask.width + x;
      if (!mask.data[i]) continue;
      const offset = i * 4;
      const { r, g, b, a } = isBoundaryPixel(mask, x, y)
        ? { r: border.r, g: border.g, b: border.b, a: borderA }
        : { r: fill.r, g: fill.g, b: fill.b, a: fillA };
      out[offset] = r;
      out[offset + 1] = g;
      out[offset + 2] = b;
      out[offset + 3] = a;
    }
  }

  return out;
}

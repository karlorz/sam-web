/**
 * SAM Web - Image Utilities
 * Canvas and tensor conversion functions
 */

import type { ImageInput, Size, BoundingBox } from '../models/types';

// Helper type for 2D context
type Canvas2DContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/**
 * Get 2D context from canvas with proper typing
 */
function get2DContext(canvas: HTMLCanvasElement | OffscreenCanvas): Canvas2DContext {
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to get 2D context');
  }
  return ctx as Canvas2DContext;
}

/**
 * Convert image input to canvas for processing
 */
export function imageToCanvas(input: ImageInput): HTMLCanvasElement | OffscreenCanvas {
  // If already a canvas, return it
  if (input instanceof HTMLCanvasElement || input instanceof OffscreenCanvas) {
    return input;
  }

  // Create canvas and draw image
  const canvas = typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(
        input instanceof ImageData ? input.width : input.width,
        input instanceof ImageData ? input.height : input.height
      )
    : document.createElement('canvas');

  if (input instanceof ImageData) {
    canvas.width = input.width;
    canvas.height = input.height;
    const ctx = get2DContext(canvas);
    ctx.putImageData(input, 0, 0);
  } else {
    // HTMLImageElement or ImageBitmap
    canvas.width = input.width;
    canvas.height = input.height;
    const ctx = get2DContext(canvas);
    ctx.drawImage(input, 0, 0);
  }

  return canvas;
}

/**
 * Resize canvas to target size
 */
export function resizeCanvas(
  canvasOrig: HTMLCanvasElement | OffscreenCanvas,
  size: Size
): HTMLCanvasElement | OffscreenCanvas {
  const canvas = typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(size.w, size.h)
    : document.createElement('canvas');

  canvas.width = size.w;
  canvas.height = size.h;

  const ctx = get2DContext(canvas);
  ctx.drawImage(
    canvasOrig as CanvasImageSource,
    0, 0, canvasOrig.width, canvasOrig.height,
    0, 0, size.w, size.h
  );

  return canvas;
}

/**
 * Calculate resize box to fit source into target preserving aspect ratio
 */
export function resizeAndPadBox(sourceDim: Size, targetDim: Size): { x: number; y: number; w: number; h: number } {
  if (sourceDim.h === sourceDim.w) {
    return { x: 0, y: 0, w: targetDim.w, h: targetDim.h };
  } else if (sourceDim.h > sourceDim.w) {
    // Portrait => resize and pad left/right
    const newW = (sourceDim.w / sourceDim.h) * targetDim.w;
    const padLeft = Math.floor((targetDim.w - newW) / 2);
    return { x: padLeft, y: 0, w: newW, h: targetDim.h };
  } else {
    // Landscape => resize and pad top/bottom
    const newH = (sourceDim.h / sourceDim.w) * targetDim.h;
    const padTop = Math.floor((targetDim.h - newH) / 2);
    return { x: 0, y: padTop, w: targetDim.w, h: newH };
  }
}

/**
 * Create a square canvas with padding (for non-square images)
 */
export function createSquareCanvas(
  source: HTMLCanvasElement | OffscreenCanvas,
  targetSize: Size
): HTMLCanvasElement | OffscreenCanvas {
  const canvas = typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(targetSize.w, targetSize.h)
    : document.createElement('canvas');

  canvas.width = targetSize.w;
  canvas.height = targetSize.h;

  const ctx = get2DContext(canvas);

  // Fill with black/neutral background
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, targetSize.w, targetSize.h);

  // Calculate padding box
  const box = resizeAndPadBox(
    { w: source.width, h: source.height },
    targetSize
  );

  // Draw source into padded position
  ctx.drawImage(
    source as CanvasImageSource,
    0, 0, source.width, source.height,
    box.x, box.y, box.w, box.h
  );

  return canvas;
}

/**
 * Convert canvas to Float32Array tensor in CHW format [1, 3, H, W]
 * Output values are normalized 0-1
 */
export function canvasToFloat32Array(
  canvas: HTMLCanvasElement | OffscreenCanvas
): { float32Array: Float32Array; shape: [number, number, number, number] } {
  const ctx = get2DContext(canvas);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const { width, height } = canvas;
  const shape: [number, number, number, number] = [1, 3, height, width];
  const channelSize = height * width;
  const float32Array = new Float32Array(3 * channelSize);

  // Populate float32Array with CHW format
  for (let i = 0; i < channelSize; i++) {
    const idx = i * 4; // RGBA stride
    float32Array[i] = imageData[idx] / 255.0; // Red
    float32Array[i + channelSize] = imageData[idx + 1] / 255.0; // Green
    float32Array[i + 2 * channelSize] = imageData[idx + 2] / 255.0; // Blue
  }

  return { float32Array, shape };
}

/**
 * Convert mask canvas to Float32Array tensor [1, 1, W, H]
 */
export function maskCanvasToFloat32Array(
  canvas: HTMLCanvasElement | OffscreenCanvas
): Float32Array {
  const ctx = get2DContext(canvas);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const float32Array = new Float32Array(canvas.width * canvas.height);

  for (let i = 0; i < float32Array.length; i++) {
    const idx = i * 4; // RGBA stride
    // Average of RGB channels normalized
    float32Array[i] = (imageData[idx] + imageData[idx + 1] + imageData[idx + 2]) / (3 * 255.0);
  }

  return float32Array;
}

/**
 * Slice a single mask from multi-mask tensor
 * Input: tensor [B, Masks, W, H]
 * Output: Float32Array for a single mask
 */
export function sliceTensor(
  data: Float32Array,
  dims: number[],
  maskIndex: number
): Float32Array {
  const [, , width, height] = dims;
  const stride = width * height;
  const start = stride * maskIndex;
  const end = start + stride;
  return data.slice(start, end);
}

/**
 * Convert Float32Array mask to canvas with green overlay
 */
export function float32ArrayToCanvas(
  array: Float32Array,
  width: number,
  height: number
): HTMLCanvasElement | OffscreenCanvas {
  const C = 4; // RGBA channels
  const imageData = new Uint8ClampedArray(array.length * C);

  for (let srcIdx = 0; srcIdx < array.length; srcIdx++) {
    const trgIdx = srcIdx * C;
    const maskedPx = array[srcIdx] > 0;
    // Green color for mask: #32CD32 (LimeGreen)
    imageData[trgIdx] = maskedPx ? 0x32 : 0;
    imageData[trgIdx + 1] = maskedPx ? 0xcd : 0;
    imageData[trgIdx + 2] = maskedPx ? 0x32 : 0;
    imageData[trgIdx + 3] = maskedPx ? 255 : 0; // Alpha
  }

  const canvas = typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(width, height)
    : document.createElement('canvas');

  canvas.width = width;
  canvas.height = height;
  const ctx = get2DContext(canvas);
  ctx.putImageData(new ImageData(imageData, width, height), 0, 0);

  return canvas;
}

/**
 * Find bounding box of mask
 */
export function findMaskBounds(
  data: Float32Array,
  width: number,
  height: number,
  threshold = 0
): BoundingBox {
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (data[idx] > threshold) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  // Handle empty mask
  if (minX > maxX || minY > maxY) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

/**
 * Convert canvas to ImageBitmap for efficient rendering
 */
export async function canvasToImageBitmap(
  canvas: HTMLCanvasElement | OffscreenCanvas
): Promise<ImageBitmap> {
  if (canvas instanceof OffscreenCanvas) {
    return canvas.transferToImageBitmap();
  }
  return createImageBitmap(canvas);
}

/**
 * Merge source mask onto target mask canvas
 */
export function mergeMasks(
  sourceMask: HTMLCanvasElement | OffscreenCanvas,
  targetMask: HTMLCanvasElement | OffscreenCanvas
): HTMLCanvasElement | OffscreenCanvas {
  const canvas = typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(targetMask.width, targetMask.height)
    : document.createElement('canvas');

  canvas.width = targetMask.width;
  canvas.height = targetMask.height;

  const ctx = get2DContext(canvas);
  ctx.drawImage(targetMask as CanvasImageSource, 0, 0);
  ctx.drawImage(
    sourceMask as CanvasImageSource,
    0, 0, sourceMask.width, sourceMask.height,
    0, 0, targetMask.width, targetMask.height
  );

  return canvas;
}

/**
 * Composite mask over image (for crop/export)
 */
export function maskImageCanvas(
  imageCanvas: HTMLCanvasElement | OffscreenCanvas,
  maskCanvas: HTMLCanvasElement | OffscreenCanvas
): HTMLCanvasElement | OffscreenCanvas {
  const canvas = typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(imageCanvas.width, imageCanvas.height)
    : document.createElement('canvas');

  canvas.width = imageCanvas.width;
  canvas.height = imageCanvas.height;

  const ctx = get2DContext(canvas);

  // Draw mask first
  ctx.drawImage(
    maskCanvas as CanvasImageSource,
    0, 0, maskCanvas.width, maskCanvas.height,
    0, 0, canvas.width, canvas.height
  );

  // Composite image using mask as alpha
  ctx.globalCompositeOperation = 'source-in';
  ctx.drawImage(
    imageCanvas as CanvasImageSource,
    0, 0, imageCanvas.width, imageCanvas.height,
    0, 0, canvas.width, canvas.height
  );

  return canvas;
}

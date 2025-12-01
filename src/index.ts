/**
 * SAM Web - Client-side Segment Anything Model
 *
 * Easy-to-use click-to-segment for the browser with WebGPU acceleration.
 *
 * @example
 * ```typescript
 * import { SAMClient } from 'sam-web';
 *
 * const sam = new SAMClient({ model: 'mobilesam' });
 * await sam.initialize(new URL('./worker.js', import.meta.url));
 * await sam.setImage(imageElement);
 *
 * const mask = await sam.segment({
 *   points: [{ x: 0.5, y: 0.5, label: 1 }]
 * });
 * ```
 *
 * @packageDocumentation
 */

// Main client
export { SAMClient } from './SAMClient';

// Worker manager (for advanced usage)
export { SAMWorker } from './SAMWorker';

// Core class (for advanced usage)
export { SAM2 } from './core/SAM2';

// Model configurations
export {
  MODEL_CONFIGS,
  MODELS,
  MOBILESAM_CONFIG,
  SAM2_TINY_CONFIG,
  DEFAULT_MODEL_ID,
  getModelConfig,
} from './models/config';

// Image utilities
export {
  imageToCanvas,
  resizeCanvas,
  createSquareCanvas,
  canvasToFloat32Array,
  maskCanvasToFloat32Array,
  float32ArrayToCanvas,
  sliceTensor,
  findMaskBounds,
  canvasToImageBitmap,
  resizeAndPadBox,
  mergeMasks,
  maskImageCanvas,
} from './core/imageutils';

// Types
export type {
  // Model types
  ModelConfig,
  ModelType,
  TensorFormat,
  Size,
  Normalization,

  // Client types
  SAMClientOptions,
  Device,
  ProgressStage,
  ProgressCallback,

  // Segment types
  PointPrompt,
  BoxPrompt,
  SegmentOptions,
  SegmentResult,
  BoundingBox,

  // Capabilities
  Capabilities,

  // Image input
  ImageInput,

  // Worker types
  WorkerRequestMessage,
  WorkerResponseMessage,
  DecodeMaskResult,
  WorkerStats,
} from './models/types';

/**
 * SAM Web - TypeScript Types
 * Client-side Segment Anything Model for the browser
 */

// ============================================================================
// Model Configuration Types
// ============================================================================

/**
 * Tensor format for model input
 * - CHW: Channels, Height, Width [1, 3, H, W] - used by SAM2
 * - HWC: Height, Width, Channels [H, W, 3] - used by MobileSAM
 */
export type TensorFormat = 'CHW' | 'HWC';

/**
 * Model type identifier
 */
export type ModelType = 'sam2' | 'mobilesam';

/**
 * Image/mask dimensions
 */
export interface Size {
  w: number;
  h: number;
}

/**
 * Optional normalization parameters (ImageNet-style)
 */
export interface Normalization {
  mean: [number, number, number];
  std: [number, number, number];
  scale: number;
}

/**
 * Configuration for a SAM model
 */
export interface ModelConfig {
  /** Unique identifier for the model */
  id: string;
  /** Display name */
  name: string;
  /** Description of the model */
  description: string;
  /** URL to download encoder ONNX model */
  encoderUrl: string;
  /** URL to download decoder ONNX model */
  decoderUrl: string;
  /** Input image size (typically 1024x1024) */
  imageSize: Size;
  /** Mask size for refinement (typically 256x256) */
  maskSize: Size;
  /** Model type (sam2 or mobilesam) */
  modelType: ModelType;
  /** Name of the encoder input tensor */
  encoderInputName: string;
  /** Whether tensor includes batch dimension */
  useBatchDimension: boolean;
  /** Tensor format (CHW or HWC) */
  tensorFormat: TensorFormat;
  /** Optional input range scaling (255 for MobileSAM) */
  inputRange?: number;
  /** Optional normalization parameters */
  normalization?: Normalization;
}

// ============================================================================
// SAMClient Types
// ============================================================================

/**
 * Device for inference execution
 */
export type Device = 'webgpu' | 'cpu' | 'auto';

/**
 * Progress callback stages
 */
export type ProgressStage =
  | 'downloading'
  | 'loading'
  | 'encoding'
  | 'decoding'
  | 'ready';

/**
 * Progress callback function
 */
export type ProgressCallback = (stage: ProgressStage, progress?: number) => void;

/**
 * Options for SAMClient initialization
 */
export interface SAMClientOptions {
  /** Model to use (predefined id or custom config) */
  model?: string | ModelConfig;
  /** Preferred device for inference */
  device?: Device;
  /** Progress callback for download/processing stages */
  onProgress?: ProgressCallback;
}

/**
 * A point prompt with coordinates and label
 * Coordinates are normalized 0-1 (not pixels)
 */
export interface PointPrompt {
  /** X coordinate (0-1, normalized) */
  x: number;
  /** Y coordinate (0-1, normalized) */
  y: number;
  /** 1 = foreground (include), 0 = background (exclude) */
  label: 0 | 1;
}

/**
 * A box prompt with corners
 * Coordinates are normalized 0-1 (not pixels)
 */
export interface BoxPrompt {
  /** Top-left X (0-1) */
  x1: number;
  /** Top-left Y (0-1) */
  y1: number;
  /** Bottom-right X (0-1) */
  x2: number;
  /** Bottom-right Y (0-1) */
  y2: number;
}

/**
 * Options for the segment() method
 */
export interface SegmentOptions {
  /** Point prompts (clicks) */
  points?: PointPrompt[];
  /** Box prompt (bounding box) */
  box?: BoxPrompt;
  /** Previous mask for refinement */
  previousMask?: SegmentResult;
}

/**
 * Bounding box of the segmented region
 */
export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Result from the segment() method
 */
export interface SegmentResult {
  /** ImageBitmap for direct canvas rendering */
  bitmap: ImageBitmap;
  /** Raw mask data (0-1 values) */
  data: Float32Array;
  /** Shape of the mask [height, width] */
  shape: [number, number];
  /** IoU confidence score */
  score: number;
  /** Bounding box of the mask */
  bounds: BoundingBox;
}

/**
 * Browser capabilities check result
 */
export interface Capabilities {
  /** WebGPU support */
  webgpu: boolean;
  /** Origin Private File System support */
  opfs: boolean;
  /** Web Worker support */
  workers: boolean;
  /** Recommended model based on capabilities */
  recommended: string;
}

// ============================================================================
// Worker Message Types
// ============================================================================

/**
 * Messages sent from main thread to worker
 */
export type WorkerRequestMessage =
  | { type: 'ping'; data: { modelId: string } }
  | { type: 'encodeImage'; data: { float32Array: Float32Array; shape: number[] } }
  | { type: 'decodeMask'; data: { points: PointPrompt[]; maskArray?: Float32Array; maskShape?: number[] } }
  | { type: 'stats'; data?: undefined };

/**
 * Messages sent from worker to main thread
 */
export type WorkerResponseMessage =
  | { type: 'downloadInProgress' }
  | { type: 'loadingInProgress' }
  | { type: 'pong'; data: { success: boolean; device: string | null } }
  | { type: 'encodeImageDone'; data: { durationMs: number } }
  | { type: 'decodeMaskResult'; data: DecodeMaskResult }
  | { type: 'stats'; data: WorkerStats }
  | { type: 'error'; data: { message: string } };

/**
 * Decoder output from ONNX model
 */
export interface DecodeMaskResult {
  masks: {
    data: Float32Array;
    dims: number[];
  };
  iou_predictions: {
    data: Float32Array;
    dims: number[];
  };
}

/**
 * Performance statistics from worker
 */
export interface WorkerStats {
  modelId: string | null;
  device: string;
  downloadModelsTime: number[];
  encodeImageTimes: number[];
  decodeTimes: number[];
}

// ============================================================================
// Image Input Types
// ============================================================================

/**
 * Valid image input types for setImage()
 */
export type ImageInput =
  | HTMLImageElement
  | HTMLCanvasElement
  | OffscreenCanvas
  | ImageBitmap
  | ImageData;

/**
 * SAM Web - SAMClient
 * High-level API for click-to-segment
 */

import type {
  SAMClientOptions,
  ImageInput,
  SegmentOptions,
  SegmentResult,
  Capabilities,
  PointPrompt,
  ModelConfig,
  Size,
} from './models/types';
import { getModelConfig, DEFAULT_MODEL_ID, MODEL_CONFIGS } from './models/config';
import { SAMWorker } from './SAMWorker';
import {
  imageToCanvas,
  createSquareCanvas,
  canvasToFloat32Array,
  resizeCanvas,
  sliceTensor,
  float32ArrayToCanvas,
  findMaskBounds,
  canvasToImageBitmap,
  maskCanvasToFloat32Array,
} from './core/imageutils';

/**
 * High-level SAM client for easy click-to-segment
 *
 * @example
 * ```typescript
 * const sam = new SAMClient({ model: 'mobilesam' });
 * await sam.setImage(imageElement);
 * const mask = await sam.segment({ points: [{ x: 0.5, y: 0.5, label: 1 }] });
 * ```
 */
export class SAMClient {
  private worker: SAMWorker;
  private modelConfig: ModelConfig;
  private imageCanvas: HTMLCanvasElement | OffscreenCanvas | null = null;
  private encodedImageSize: Size | null = null;
  private isReady = false;

  constructor(options: SAMClientOptions = {}) {
    // Get model config
    if (typeof options.model === 'string') {
      this.modelConfig = getModelConfig(options.model);
    } else if (options.model) {
      this.modelConfig = options.model;
    } else {
      this.modelConfig = getModelConfig(DEFAULT_MODEL_ID);
    }

    // Create worker manager
    this.worker = new SAMWorker(options.onProgress);
  }

  /**
   * Check browser capabilities for SAM
   */
  static async checkCapabilities(): Promise<Capabilities> {
    const webgpu = 'gpu' in navigator;

    let opfs = false;
    try {
      await navigator.storage.getDirectory();
      opfs = true;
    } catch {
      opfs = false;
    }

    const workers = typeof Worker !== 'undefined';

    // Recommend MobileSAM if no WebGPU (faster on CPU)
    const recommended = webgpu ? 'sam2_tiny' : 'mobilesam';

    return { webgpu, opfs, workers, recommended };
  }

  /**
   * Get available models
   */
  static getAvailableModels(): Record<string, ModelConfig> {
    return MODEL_CONFIGS;
  }

  /**
   * Initialize the client with a worker
   * Call this before using setImage or segment
   *
   * @param workerUrl - URL to the worker script (use import.meta.url based path)
   */
  async initialize(workerUrl?: URL | string): Promise<void> {
    // Create worker
    if (workerUrl) {
      this.worker.createWorker(workerUrl);
    } else {
      // Default: try to use bundled worker
      // Consumer should provide their own worker URL in most cases
      throw new Error(
        'Worker URL required. Use: new URL("@anthropic-ai/sam-web/worker", import.meta.url)'
      );
    }

    // Initialize with model
    const result = await this.worker.initialize(this.modelConfig.id);

    if (!result.success) {
      throw new Error('Failed to initialize SAM model');
    }

    this.isReady = true;
  }

  /**
   * Load and encode an image
   * This should be called once per image. Subsequent segment() calls are fast.
   *
   * @param image - Image input (HTMLImageElement, Canvas, ImageData, etc.)
   */
  async setImage(image: ImageInput): Promise<void> {
    if (!this.isReady) {
      throw new Error('Client not initialized. Call initialize() first.');
    }

    // Convert to canvas
    const sourceCanvas = imageToCanvas(image);

    // Create square canvas with padding
    const squareCanvas = createSquareCanvas(sourceCanvas, this.modelConfig.imageSize);

    // Store for later coordinate conversion
    this.imageCanvas = squareCanvas;
    this.encodedImageSize = this.modelConfig.imageSize;

    // Convert to tensor
    const { float32Array, shape } = canvasToFloat32Array(squareCanvas);

    // Encode in worker
    await this.worker.encodeImage(float32Array, shape);
  }

  /**
   * Segment objects based on point/box prompts
   *
   * @param options - Segment options with points and/or box
   * @returns Segmentation result with bitmap, data, score, and bounds
   */
  async segment(options: SegmentOptions): Promise<SegmentResult> {
    if (!this.isReady || !this.imageCanvas) {
      throw new Error('Image not set. Call setImage() first.');
    }

    const { points = [], box, previousMask } = options;

    // Build point prompts
    const allPoints: PointPrompt[] = [];

    // Add user points (convert from normalized 0-1 to pixel coords)
    for (const p of points) {
      allPoints.push({
        x: p.x * this.encodedImageSize!.w,
        y: p.y * this.encodedImageSize!.h,
        label: p.label,
      });
    }

    // Add box as two corner points if provided
    if (box) {
      // Top-left corner (label 2 for box point in SAM)
      allPoints.push({
        x: box.x1 * this.encodedImageSize!.w,
        y: box.y1 * this.encodedImageSize!.h,
        label: 2 as 0 | 1, // Box corner label
      });
      // Bottom-right corner (label 3 for box point in SAM)
      allPoints.push({
        x: box.x2 * this.encodedImageSize!.w,
        y: box.y2 * this.encodedImageSize!.h,
        label: 3 as 0 | 1, // Box corner label
      });
    }

    if (allPoints.length === 0) {
      throw new Error('At least one point or box required');
    }

    // Prepare previous mask if provided
    let maskArray: Float32Array | undefined;
    let maskShape: number[] | undefined;

    if (previousMask) {
      // Resize previous mask to maskSize for refinement
      const prevCanvas = float32ArrayToCanvas(
        previousMask.data,
        previousMask.shape[1],
        previousMask.shape[0]
      );
      const resizedMask = resizeCanvas(prevCanvas, this.modelConfig.maskSize);
      maskArray = maskCanvasToFloat32Array(resizedMask);
      maskShape = [1, 1, this.modelConfig.maskSize.h, this.modelConfig.maskSize.w];
    }

    // Decode mask
    const result = await this.worker.decodeMask(allPoints, maskArray, maskShape);

    // Process result - select best mask
    const { masks, iou_predictions } = result;
    const maskData = new Float32Array(masks.data);
    const iouData = new Float32Array(iou_predictions.data);

    // Find best mask by IoU score (manual iteration to avoid stack overflow)
    let bestMaskIdx = 0;
    let bestScore = -Infinity;
    for (let i = 0; i < iouData.length; i++) {
      if (iouData[i] > bestScore) {
        bestScore = iouData[i];
        bestMaskIdx = i;
      }
    }

    // Extract best mask
    const maskWidth = masks.dims[3];
    const maskHeight = masks.dims[2];
    const bestMaskData = sliceTensor(maskData, masks.dims, bestMaskIdx);

    // Create canvas from mask
    const maskCanvas = float32ArrayToCanvas(bestMaskData, maskWidth, maskHeight);

    // Create ImageBitmap
    const bitmap = await canvasToImageBitmap(maskCanvas);

    // Find bounding box
    const bounds = findMaskBounds(bestMaskData, maskWidth, maskHeight);

    // Normalize bounds to 0-1
    const normalizedBounds = {
      x: bounds.x / maskWidth,
      y: bounds.y / maskHeight,
      width: bounds.width / maskWidth,
      height: bounds.height / maskHeight,
    };

    return {
      bitmap,
      data: bestMaskData,
      shape: [maskHeight, maskWidth],
      score: bestScore,
      bounds: normalizedBounds,
    };
  }

  /**
   * Preload models (download to cache)
   * Optional - models are also downloaded on first use
   */
  async preloadModels(): Promise<void> {
    // This would require a separate download-only method
    // For now, initialize does the download
    console.log('[SAMClient] Models will be downloaded on initialize()');
  }

  /**
   * Get current model configuration
   */
  getModelConfig(): ModelConfig {
    return this.modelConfig;
  }

  /**
   * Check if client is ready
   */
  isInitialized(): boolean {
    return this.isReady;
  }

  /**
   * Get performance statistics
   */
  async getStats() {
    return this.worker.getStats();
  }

  /**
   * Cleanup resources
   */
  dispose(): void {
    this.worker.terminate();
    this.imageCanvas = null;
    this.encodedImageSize = null;
    this.isReady = false;
  }
}

/**
 * SAM Web - SAM2 Core Class
 * Low-level ONNX model management and inference
 */

import * as ort from 'onnxruntime-web/all';
import type { ModelConfig } from '../models/types';
import { getModelConfig, DEFAULT_MODEL_ID } from '../models/config';

// Type for ONNX inference session with execution provider
type SessionWithDevice = [ort.InferenceSession, string];

/**
 * SAM2 Core - handles ONNX model loading and inference
 * This is a low-level class; use SAMClient for high-level API
 */
export class SAM2 {
  private bufferEncoder: ArrayBuffer | null = null;
  private bufferDecoder: ArrayBuffer | null = null;
  private sessionEncoder: SessionWithDevice | null = null;
  private sessionDecoder: SessionWithDevice | null = null;

  /** Cached image embeddings from encoder */
  public imageEncoded: Record<string, ort.Tensor> | null = null;

  /** Current model configuration */
  public readonly modelConfig: ModelConfig;

  /** Model type (sam2 or mobilesam) */
  public readonly modelType: string;

  constructor(modelConfig?: ModelConfig | string) {
    if (typeof modelConfig === 'string') {
      this.modelConfig = getModelConfig(modelConfig);
    } else {
      this.modelConfig = modelConfig ?? getModelConfig(DEFAULT_MODEL_ID);
    }
    this.modelType = this.modelConfig.modelType;
  }

  /**
   * Download both encoder and decoder models
   */
  async downloadModels(): Promise<void> {
    this.bufferEncoder = await this.downloadModel(this.modelConfig.encoderUrl);
    this.bufferDecoder = await this.downloadModel(this.modelConfig.decoderUrl);
  }

  /**
   * Download a single model with OPFS caching
   */
  private async downloadModel(url: string): Promise<ArrayBuffer | null> {
    // Extract filename from URL
    const filename = url.split('/').pop() ?? 'model.onnx';

    // Step 1: Check OPFS cache
    try {
      const root = await navigator.storage.getDirectory();
      const fileHandle = await root.getFileHandle(filename);
      const file = await fileHandle.getFile();
      if (file.size > 0) {
        console.log(`[SAM] Loaded ${filename} from cache`);
        return await file.arrayBuffer();
      }
    } catch {
      // File not in cache, continue to download
    }

    // Step 2: Download
    console.log(`[SAM] Downloading ${filename}...`);
    let buffer: ArrayBuffer;
    try {
      const response = await fetch(url, {
        headers: { Origin: location.origin },
        mode: 'cors',
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      buffer = await response.arrayBuffer();
    } catch (e) {
      console.error(`[SAM] Download failed: ${url}`, e);
      return null;
    }

    // Step 3: Cache in OPFS
    try {
      const root = await navigator.storage.getDirectory();
      const fileHandle = await root.getFileHandle(filename, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(buffer);
      await writable.close();
      console.log(`[SAM] Cached ${filename}`);
    } catch (e) {
      console.warn(`[SAM] OPFS cache failed for ${filename}`, e);
    }

    return buffer;
  }

  /**
   * Create ONNX inference sessions for encoder and decoder
   */
  async createSessions(): Promise<{ success: boolean; device: string | null }> {
    const success = (await this.getEncoderSession()) && (await this.getDecoderSession());
    return {
      success: !!success,
      device: success ? this.sessionEncoder![1] : null,
    };
  }

  /**
   * Create ONNX session with execution provider fallback
   * Tries WebGPU first, falls back to CPU
   */
  private async getORTSession(model: ArrayBuffer): Promise<SessionWithDevice> {
    // Loop through providers to avoid Safari/Firefox bug with multiple EPs
    // See: https://github.com/microsoft/onnxruntime/issues/22113
    for (const ep of ['webgpu', 'cpu'] as const) {
      try {
        const session = await ort.InferenceSession.create(model, {
          executionProviders: [ep],
        });
        console.log(`[SAM] Session created with ${ep}`);
        return [session, ep];
      } catch (e) {
        console.warn(`[SAM] ${ep} provider failed:`, e);
        continue;
      }
    }

    throw new Error('[SAM] Failed to create ONNX session with any provider');
  }

  /**
   * Get or create encoder session
   */
  private async getEncoderSession(): Promise<SessionWithDevice | null> {
    if (!this.sessionEncoder && this.bufferEncoder) {
      this.sessionEncoder = await this.getORTSession(this.bufferEncoder);
    }
    return this.sessionEncoder;
  }

  /**
   * Get or create decoder session
   */
  private async getDecoderSession(): Promise<SessionWithDevice | null> {
    if (!this.sessionDecoder && this.bufferDecoder) {
      this.sessionDecoder = await this.getORTSession(this.bufferDecoder);
    }
    return this.sessionDecoder;
  }

  /**
   * Encode image to embeddings
   */
  async encodeImage(inputTensor: ort.Tensor): Promise<void> {
    const [session] = (await this.getEncoderSession())!;

    // Use dynamic encoder input name from config
    const results = await session.run({
      [this.modelConfig.encoderInputName]: inputTensor,
    });

    // Handle different encoder output structures
    if (this.modelType === 'sam2') {
      // SAM2 has 3 outputs: high_res_feats_0, high_res_feats_1, image_embed
      this.imageEncoded = {
        high_res_feats_0: results[session.outputNames[0]],
        high_res_feats_1: results[session.outputNames[1]],
        image_embed: results[session.outputNames[2]],
      };
    } else if (this.modelType === 'mobilesam') {
      // MobileSAM has 1 output: image_embeddings
      this.imageEncoded = {
        image_embed: results[session.outputNames[0]],
      };
    }
  }

  /**
   * Decode segmentation masks from point prompts
   */
  async decode(
    points: Array<{ x: number; y: number; label: number }>,
    masks?: ort.Tensor
  ): Promise<ort.InferenceSession.OnnxValueMapType> {
    if (!this.imageEncoded) {
      throw new Error('[SAM] Image not encoded. Call encodeImage first.');
    }

    const [session] = (await this.getDecoderSession())!;

    const flatPoints = points.map((p) => [p.x, p.y]);
    const flatLabels = points.map((p) => p.label);

    let maskInput: ort.Tensor;
    let hasMaskInput: ort.Tensor;

    if (masks) {
      maskInput = masks;
      hasMaskInput = new ort.Tensor('float32', [1], [1]);
    } else {
      // Dummy mask when no previous mask
      maskInput = new ort.Tensor(
        'float32',
        new Float32Array(256 * 256),
        [1, 1, 256, 256]
      );
      hasMaskInput = new ort.Tensor('float32', [0], [1]);
    }

    // Build decoder inputs based on model type
    let inputs: ort.InferenceSession.OnnxValueMapType;

    if (this.modelType === 'mobilesam') {
      inputs = {
        image_embeddings: this.imageEncoded.image_embed,
        point_coords: new ort.Tensor('float32', flatPoints.flat(), [
          1,
          flatPoints.length,
          2,
        ]),
        point_labels: new ort.Tensor('float32', flatLabels, [
          1,
          flatLabels.length,
        ]),
        mask_input: maskInput,
        has_mask_input: hasMaskInput,
        orig_im_size: new ort.Tensor(
          'float32',
          [this.modelConfig.imageSize.h, this.modelConfig.imageSize.w],
          [2]
        ),
      };
    } else {
      // SAM2
      inputs = {
        image_embed: this.imageEncoded.image_embed,
        high_res_feats_0: this.imageEncoded.high_res_feats_0,
        high_res_feats_1: this.imageEncoded.high_res_feats_1,
        point_coords: new ort.Tensor('float32', flatPoints.flat(), [
          1,
          flatPoints.length,
          2,
        ]),
        point_labels: new ort.Tensor('float32', flatLabels, [
          1,
          flatLabels.length,
        ]),
        mask_input: maskInput,
        has_mask_input: hasMaskInput,
      };
    }

    return await session.run(inputs);
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    this.sessionEncoder?.[0].release();
    this.sessionDecoder?.[0].release();
    this.sessionEncoder = null;
    this.sessionDecoder = null;
    this.bufferEncoder = null;
    this.bufferDecoder = null;
    this.imageEncoded = null;
  }
}

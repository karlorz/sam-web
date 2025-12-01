/**
 * SAM Web - Model Configurations
 * Pre-configured model settings for SAM2 and MobileSAM
 */

import type { ModelConfig } from './types';

/**
 * MobileSAM configuration
 * - Smaller model (45 MB)
 * - Faster encoding (~345ms)
 * - Good for interactive use
 */
export const MOBILESAM_CONFIG: ModelConfig = {
  id: 'mobilesam',
  name: 'MobileSAM',
  description: 'Mobile SAM (45 MB, TinyViT encoder) - Fast and lightweight',
  encoderUrl: 'https://huggingface.co/Acly/MobileSAM/resolve/main/mobile_sam_image_encoder.onnx',
  decoderUrl: 'https://huggingface.co/Acly/MobileSAM/resolve/main/sam_mask_decoder_multi.onnx',
  imageSize: { w: 1024, h: 1024 },
  maskSize: { w: 256, h: 256 },
  modelType: 'mobilesam',
  encoderInputName: 'input_image',
  useBatchDimension: false,
  tensorFormat: 'HWC', // Height, Width, Channels - [H, W, 3]
  // Acly ONNX export expects 0-255 range (includes normalization in graph)
  inputRange: 255, // Scale 0-1 back to 0-255
};

/**
 * SAM2 Tiny configuration
 * - Larger model (151 MB)
 * - Higher quality masks
 * - Better for accuracy-critical use
 */
export const SAM2_TINY_CONFIG: ModelConfig = {
  id: 'sam2_tiny',
  name: 'SAM2 Tiny',
  description: "Meta's SAM2 Tiny (151 MB, Hiera encoder) - Higher quality",
  encoderUrl: 'https://huggingface.co/g-ronimo/sam2-tiny/resolve/main/sam2_hiera_tiny_encoder.with_runtime_opt.ort',
  decoderUrl: 'https://huggingface.co/g-ronimo/sam2-tiny/resolve/main/sam2_hiera_tiny_decoder_pr1.onnx',
  imageSize: { w: 1024, h: 1024 },
  maskSize: { w: 256, h: 256 },
  modelType: 'sam2',
  encoderInputName: 'image',
  useBatchDimension: true,
  tensorFormat: 'CHW', // Channels, Height, Width - [1, 3, H, W]
};

/**
 * All available model configurations
 */
export const MODEL_CONFIGS: Record<string, ModelConfig> = {
  mobilesam: MOBILESAM_CONFIG,
  sam2_tiny: SAM2_TINY_CONFIG,
  // Aliases
  sam2: SAM2_TINY_CONFIG,
} as const;

/**
 * Default model to use
 */
export const DEFAULT_MODEL_ID = 'sam2_tiny';

/**
 * Get model configuration by ID
 */
export function getModelConfig(modelId: string): ModelConfig {
  const config = MODEL_CONFIGS[modelId];
  if (!config) {
    throw new Error(
      `Unknown model: ${modelId}. Available models: ${Object.keys(MODEL_CONFIGS).join(', ')}`
    );
  }
  return config;
}

/**
 * Exported model constants for easy access
 */
export const MODELS = {
  MOBILESAM: 'mobilesam',
  SAM2_TINY: 'sam2_tiny',
  SAM2: 'sam2', // alias
} as const;

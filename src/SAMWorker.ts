/**
 * SAM Web - Worker Manager
 * Manages Web Worker lifecycle and message passing
 */

import type {
  WorkerResponseMessage,
  DecodeMaskResult,
  WorkerStats,
  ProgressCallback,
  PointPrompt,
} from './models/types';

/**
 * Manages communication with the SAM inference worker
 */
export class SAMWorker {
  private worker: Worker | null = null;
  private onProgress?: ProgressCallback;
  private initialized = false;

  constructor(onProgress?: ProgressCallback) {
    this.onProgress = onProgress;
  }

  /**
   * Initialize worker with model
   */
  async initialize(modelId: string): Promise<{ success: boolean; device: string | null }> {
    if (!this.worker) {
      throw new Error('Worker not set. Call setWorker() first.');
    }

    return new Promise((resolve, reject) => {
      const handleResponse = (e: MessageEvent<WorkerResponseMessage>) => {
        const { type } = e.data;

        if (type === 'downloadInProgress') {
          this.onProgress?.('downloading');
        } else if (type === 'loadingInProgress') {
          this.onProgress?.('loading');
        } else if (type === 'pong') {
          this.initialized = true;
          this.onProgress?.('ready');
          const data = e.data as Extract<WorkerResponseMessage, { type: 'pong' }>;
          resolve(data.data);
        } else if (type === 'error') {
          const data = e.data as Extract<WorkerResponseMessage, { type: 'error' }>;
          reject(new Error(data.data.message));
        }
      };

      this.worker!.addEventListener('message', handleResponse);
      this.worker!.postMessage({ type: 'ping', data: { modelId } });
    });
  }

  /**
   * Set the worker instance
   */
  setWorker(worker: Worker): void {
    if (this.worker) {
      this.worker.terminate();
    }
    this.worker = worker;
    this.setupMessageHandler();
  }

  /**
   * Create worker from URL
   */
  createWorker(workerUrl: URL | string): void {
    const url = typeof workerUrl === 'string' ? new URL(workerUrl) : workerUrl;
    this.setWorker(new Worker(url, { type: 'module' }));
  }

  /**
   * Setup message handler for worker responses
   */
  private setupMessageHandler(): void {
    if (!this.worker) return;

    this.worker.onmessage = (e: MessageEvent<WorkerResponseMessage>) => {
      const { type } = e.data;

      // Handle progress updates
      if (type === 'downloadInProgress') {
        this.onProgress?.('downloading');
      } else if (type === 'loadingInProgress') {
        this.onProgress?.('loading');
      }
      // Stats are informational, handled by specific request handlers
    };

    this.worker.onerror = (e) => {
      console.error('[SAMWorker] Worker error:', e);
    };
  }

  /**
   * Encode image in worker
   */
  async encodeImage(
    float32Array: Float32Array,
    shape: number[]
  ): Promise<{ durationMs: number }> {
    if (!this.worker || !this.initialized) {
      throw new Error('Worker not initialized');
    }

    this.onProgress?.('encoding');

    return new Promise((resolve, reject) => {
      const handleResponse = (e: MessageEvent<WorkerResponseMessage>) => {
        const { type } = e.data;

        if (type === 'encodeImageDone') {
          this.worker!.removeEventListener('message', handleResponse);
          const data = e.data as Extract<WorkerResponseMessage, { type: 'encodeImageDone' }>;
          resolve(data.data);
        } else if (type === 'error') {
          this.worker!.removeEventListener('message', handleResponse);
          const data = e.data as Extract<WorkerResponseMessage, { type: 'error' }>;
          reject(new Error(data.data.message));
        }
      };

      this.worker!.addEventListener('message', handleResponse);
      this.worker!.postMessage({
        type: 'encodeImage',
        data: { float32Array, shape },
      });
    });
  }

  /**
   * Decode mask from points
   */
  async decodeMask(
    points: PointPrompt[],
    maskArray?: Float32Array,
    maskShape?: number[]
  ): Promise<DecodeMaskResult> {
    if (!this.worker || !this.initialized) {
      throw new Error('Worker not initialized');
    }

    this.onProgress?.('decoding');

    return new Promise((resolve, reject) => {
      const handleResponse = (e: MessageEvent<WorkerResponseMessage>) => {
        const { type } = e.data;

        if (type === 'decodeMaskResult') {
          this.worker!.removeEventListener('message', handleResponse);
          const data = e.data as Extract<WorkerResponseMessage, { type: 'decodeMaskResult' }>;
          resolve(data.data);
        } else if (type === 'error') {
          this.worker!.removeEventListener('message', handleResponse);
          const data = e.data as Extract<WorkerResponseMessage, { type: 'error' }>;
          reject(new Error(data.data.message));
        }
      };

      this.worker!.addEventListener('message', handleResponse);
      this.worker!.postMessage({
        type: 'decodeMask',
        data: { points, maskArray, maskShape },
      });
    });
  }

  /**
   * Get worker statistics
   */
  async getStats(): Promise<WorkerStats> {
    if (!this.worker) {
      throw new Error('Worker not initialized');
    }

    return new Promise((resolve, reject) => {
      const handleResponse = (e: MessageEvent<WorkerResponseMessage>) => {
        const { type } = e.data;

        if (type === 'stats') {
          this.worker!.removeEventListener('message', handleResponse);
          const data = e.data as Extract<WorkerResponseMessage, { type: 'stats' }>;
          resolve(data.data);
        } else if (type === 'error') {
          this.worker!.removeEventListener('message', handleResponse);
          const data = e.data as Extract<WorkerResponseMessage, { type: 'error' }>;
          reject(new Error(data.data.message));
        }
      };

      this.worker!.addEventListener('message', handleResponse);
      this.worker!.postMessage({ type: 'stats' });
    });
  }

  /**
   * Check if worker is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Terminate worker
   */
  terminate(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
      this.initialized = false;
    }
  }
}

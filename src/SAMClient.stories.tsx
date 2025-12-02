import type { Meta, StoryObj } from '@storybook/react-vite';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { ProgressStage, SegmentResult } from './models/types';

/**
 * # SAMClient
 *
 * The main high-level API for click-to-segment functionality.
 * SAMClient handles image preprocessing, coordinate normalization,
 * and worker lifecycle management.
 *
 * ## Installation
 *
 * ```bash
 * npm install sam-web onnxruntime-web
 * ```
 *
 * ## Basic Usage
 *
 * ```typescript
 * import { SAMClient } from 'sam-web';
 *
 * const client = new SAMClient({
 *   model: 'sam2_tiny',
 *   onProgress: (stage) => console.log(stage),
 * });
 *
 * // Initialize with worker
 * await client.initialize(new URL('sam-web/worker', import.meta.url));
 *
 * // Set image (encodes the image)
 * await client.setImage(imageElement);
 *
 * // Segment with click points (normalized 0-1 coordinates)
 * const result = await client.segment({
 *   points: [{ x: 0.5, y: 0.5, label: 1 }],
 * });
 *
 * // result.bitmap contains the segmentation mask
 * ```
 */
const meta = {
  title: 'API/SAMClient',
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component: `
SAMClient is the main entry point for the sam-web library. It provides a high-level API
for click-to-segment functionality with automatic image preprocessing and coordinate normalization.

## Features

- **Multiple Models**: SAM2 Tiny, SAM2 Small, and MobileSAM
- **WebGPU Acceleration**: Fast inference when GPU is available
- **Automatic Fallback**: Falls back to CPU when WebGPU unavailable
- **OPFS Caching**: Models are cached locally after first download
- **Iterative Refinement**: Pass previous masks for better results
        `,
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Interactive demo showing SAMClient in action.
 * Click on the image to segment objects.
 */
export const InteractiveDemo: Story = {
  render: function Render() {
    const [status, setStatus] = useState('Click "Initialize" to start');
    const [loading, setLoading] = useState(false);
    const [imageLoaded, setImageLoaded] = useState(false);
    const [imageEncoded, setImageEncoded] = useState(false);
    const [maskResult, setMaskResult] = useState<SegmentResult | null>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const imageCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const clientRef = useRef<any>(null);
    const pointsRef = useRef<Array<{ x: number; y: number; label: 0 | 1 }>>([]);

    const handleProgress = useCallback((stage: ProgressStage) => {
      switch (stage) {
        case 'downloading':
          setStatus('Downloading model...');
          break;
        case 'loading':
          setStatus('Loading model...');
          break;
        case 'encoding':
          setStatus('Encoding image...');
          break;
        case 'decoding':
          setStatus('Decoding mask...');
          break;
        case 'ready':
          setStatus('Ready');
          setLoading(false);
          break;
      }
    }, []);

    const initialize = async () => {
      setLoading(true);
      setStatus('Initializing...');

      try {
        // Dynamic import to avoid SSR issues
        const { SAMClient } = await import('./index');

        const client = new SAMClient({
          model: 'sam2_tiny',
          onProgress: handleProgress,
        });

        // Use the built worker from staticDirs - handle GitHub Pages base path
        const base = window.location.pathname.replace(/\/iframe\.html.*$/, '');
        const workerUrl = new URL(`${base}/dist/worker.js`, window.location.origin);
        await client.initialize(workerUrl);
        clientRef.current = client;
        setStatus('Model loaded. Load an image to continue.');
        setLoading(false);
      } catch (error) {
        setStatus(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        setLoading(false);
      }
    };

    const loadImage = async () => {
      const url =
        'https://upload.wikimedia.org/wikipedia/commons/thumb/3/38/Flamingos_Laguna_Colorada.jpg/512px-Flamingos_Laguna_Colorada.jpg';

      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = url;

      img.onload = () => {
        const canvas = document.createElement('canvas');
        const size = Math.max(img.width, img.height);
        canvas.width = size;
        canvas.height = size;

        const ctx = canvas.getContext('2d');
        if (ctx) {
          const x = (size - img.width) / 2;
          const y = (size - img.height) / 2;
          ctx.drawImage(img, x, y);
        }

        imageCanvasRef.current = canvas;
        setImageLoaded(true);
        drawCanvas();
        setStatus('Image loaded. Click "Encode Image" to process.');
      };
    };

    const encodeImage = async () => {
      if (!clientRef.current || !imageCanvasRef.current) return;

      setLoading(true);
      setStatus('Encoding image...');

      try {
        await clientRef.current.setImage(imageCanvasRef.current);
        setImageEncoded(true);
        setStatus('Ready. Click on the image to segment.');
        setLoading(false);
      } catch (error) {
        setStatus(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        setLoading(false);
      }
    };

    const handleCanvasClick = async (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!imageEncoded || !clientRef.current) return;

      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) / canvas.width;
      const y = (e.clientY - rect.top) / canvas.height;
      const label = e.button === 0 ? 1 : 0;

      pointsRef.current.push({ x, y, label: label as 0 | 1 });

      setLoading(true);
      setStatus('Segmenting...');

      try {
        const result = await clientRef.current.segment({
          points: pointsRef.current,
          previousMask: maskResult ?? undefined,
        });

        setMaskResult(result);
        setStatus(`Segmented! Score: ${result.score.toFixed(3)}`);
        setLoading(false);
      } catch (error) {
        setStatus(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        setLoading(false);
      }
    };

    const drawCanvas = useCallback(() => {
      const canvas = canvasRef.current;
      const imageCanvas = imageCanvasRef.current;
      if (!canvas || !imageCanvas) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(imageCanvas, 0, 0, canvas.width, canvas.height);

      if (maskResult) {
        ctx.globalAlpha = 0.5;
        ctx.drawImage(maskResult.bitmap, 0, 0, canvas.width, canvas.height);
        ctx.globalAlpha = 1;
      }
    }, [maskResult]);

    useEffect(() => {
      drawCanvas();
    }, [maskResult, drawCanvas]);

    const reset = () => {
      pointsRef.current = [];
      setMaskResult(null);
      drawCanvas();
      setStatus('Reset. Click on the image to segment.');
    };

    return (
      <div style={{ fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ marginBottom: 16 }}>
          <div
            style={{
              padding: '8px 16px',
              background: loading ? '#fff3cd' : '#d4edda',
              borderRadius: 4,
              marginBottom: 16,
            }}
          >
            <strong>Status:</strong> {status}
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <button
              onClick={initialize}
              disabled={loading || clientRef.current}
              style={{
                padding: '8px 16px',
                background: '#007bff',
                color: 'white',
                border: 'none',
                borderRadius: 4,
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading || clientRef.current ? 0.5 : 1,
              }}
            >
              1. Initialize
            </button>
            <button
              onClick={loadImage}
              disabled={loading || !clientRef.current || imageLoaded}
              style={{
                padding: '8px 16px',
                background: '#28a745',
                color: 'white',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
                opacity: loading || !clientRef.current || imageLoaded ? 0.5 : 1,
              }}
            >
              2. Load Image
            </button>
            <button
              onClick={encodeImage}
              disabled={loading || !imageLoaded || imageEncoded}
              style={{
                padding: '8px 16px',
                background: '#17a2b8',
                color: 'white',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
                opacity: loading || !imageLoaded || imageEncoded ? 0.5 : 1,
              }}
            >
              3. Encode Image
            </button>
            <button
              onClick={reset}
              disabled={loading || !maskResult}
              style={{
                padding: '8px 16px',
                background: '#6c757d',
                color: 'white',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
                opacity: loading || !maskResult ? 0.5 : 1,
              }}
            >
              Reset
            </button>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            background: '#f5f5f5',
            padding: 16,
            borderRadius: 8,
          }}
        >
          <canvas
            ref={canvasRef}
            width={400}
            height={400}
            onClick={handleCanvasClick}
            onContextMenu={(e) => {
              e.preventDefault();
              handleCanvasClick(e);
            }}
            style={{
              cursor: imageEncoded ? 'crosshair' : 'default',
              background: '#ddd',
              borderRadius: 4,
            }}
          />
        </div>

        <div style={{ marginTop: 16, fontSize: 14, color: '#666' }}>
          <p>
            <strong>Instructions:</strong> Left-click for positive points, right-click for negative
            points.
          </p>
        </div>
      </div>
    );
  },
};

/**
 * Shows the available models and their configurations.
 */
export const AvailableModels: Story = {
  render: function Render() {
    const [models, setModels] = useState<Record<string, any> | null>(null);

    useEffect(() => {
      import('./index').then(({ MODEL_CONFIGS }) => {
        setModels(MODEL_CONFIGS);
      });
    }, []);

    if (!models) return <div>Loading models...</div>;

    return (
      <div style={{ fontFamily: 'system-ui, sans-serif' }}>
        <h2>Available Models</h2>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr style={{ background: '#f0f0f0' }}>
              <th style={{ padding: 12, textAlign: 'left', border: '1px solid #ddd' }}>Model ID</th>
              <th style={{ padding: 12, textAlign: 'left', border: '1px solid #ddd' }}>Name</th>
              <th style={{ padding: 12, textAlign: 'left', border: '1px solid #ddd' }}>
                Image Size
              </th>
              <th style={{ padding: 12, textAlign: 'left', border: '1px solid #ddd' }}>Format</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(models)
              .filter(([key, model]) => key === (model as any).id)
              .map(([key, model]: [string, any]) => (
                <tr key={key}>
                  <td style={{ padding: 12, border: '1px solid #ddd' }}>
                    <code>{model.id}</code>
                  </td>
                  <td style={{ padding: 12, border: '1px solid #ddd' }}>{model.name}</td>
                  <td style={{ padding: 12, border: '1px solid #ddd' }}>
                    {model.imageSize.w}x{model.imageSize.h}
                  </td>
                  <td style={{ padding: 12, border: '1px solid #ddd' }}>{model.tensorFormat}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    );
  },
};

/**
 * Shows how to check browser capabilities.
 */
export const BrowserCapabilities: Story = {
  render: function Render() {
    const [capabilities, setCapabilities] = useState<any | null>(null);

    useEffect(() => {
      import('./index').then(async ({ SAMClient }) => {
        const caps = await SAMClient.checkCapabilities();
        setCapabilities(caps);
      });
    }, []);

    if (!capabilities) return <div>Checking capabilities...</div>;

    return (
      <div style={{ fontFamily: 'system-ui, sans-serif' }}>
        <h2>Browser Capabilities</h2>
        <table style={{ borderCollapse: 'collapse', width: '100%', maxWidth: 400 }}>
          <tbody>
            <tr>
              <td style={{ padding: 12, border: '1px solid #ddd' }}>
                <strong>WebGPU</strong>
              </td>
              <td style={{ padding: 12, border: '1px solid #ddd' }}>
                {capabilities.webgpu ? '✅ Supported' : '❌ Not supported'}
              </td>
            </tr>
            <tr>
              <td style={{ padding: 12, border: '1px solid #ddd' }}>
                <strong>OPFS (Caching)</strong>
              </td>
              <td style={{ padding: 12, border: '1px solid #ddd' }}>
                {capabilities.opfs ? '✅ Supported' : '❌ Not supported'}
              </td>
            </tr>
            <tr>
              <td style={{ padding: 12, border: '1px solid #ddd' }}>
                <strong>Web Workers</strong>
              </td>
              <td style={{ padding: 12, border: '1px solid #ddd' }}>
                {capabilities.workers ? '✅ Supported' : '❌ Not supported'}
              </td>
            </tr>
            <tr style={{ background: '#f0f0f0' }}>
              <td style={{ padding: 12, border: '1px solid #ddd' }}>
                <strong>Recommended Model</strong>
              </td>
              <td style={{ padding: 12, border: '1px solid #ddd' }}>
                <code>{capabilities.recommended}</code>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  },
};

/**
 * Code example for basic usage.
 */
export const CodeExample: Story = {
  render: () => (
    <div style={{ fontFamily: 'system-ui, sans-serif' }}>
      <h2>Basic Usage</h2>
      <pre
        style={{
          background: '#1e1e1e',
          color: '#d4d4d4',
          padding: 20,
          borderRadius: 8,
          overflow: 'auto',
          fontSize: 14,
          lineHeight: 1.5,
        }}
      >
        {`import { SAMClient } from 'sam-web';

// Create client with model selection
const client = new SAMClient({
  model: 'sam2_tiny', // or 'sam2_small', 'mobilesam'
  onProgress: (stage) => {
    console.log('Progress:', stage);
    // 'downloading' | 'loading' | 'encoding' | 'decoding' | 'ready'
  },
});

// Initialize with worker URL
await client.initialize(
  new URL('sam-web/worker', import.meta.url)
);

// Load and encode image
await client.setImage(imageElement);

// Segment with click points (normalized 0-1 coordinates)
const result = await client.segment({
  points: [
    { x: 0.5, y: 0.5, label: 1 }, // Positive point
    { x: 0.2, y: 0.8, label: 0 }, // Negative point
  ],
});

// Use the result
console.log('Score:', result.score);
console.log('Bounds:', result.bounds);

// Draw mask on canvas
ctx.drawImage(result.bitmap, 0, 0);

// Cleanup when done
client.dispose();`}
      </pre>

      <h2 style={{ marginTop: 32 }}>Iterative Refinement</h2>
      <pre
        style={{
          background: '#1e1e1e',
          color: '#d4d4d4',
          padding: 20,
          borderRadius: 8,
          overflow: 'auto',
          fontSize: 14,
          lineHeight: 1.5,
        }}
      >
        {`// Pass previous mask for refinement
let previousResult = null;

canvas.addEventListener('click', async (e) => {
  const x = e.offsetX / canvas.width;
  const y = e.offsetY / canvas.height;

  const result = await client.segment({
    points: [{ x, y, label: 1 }],
    previousMask: previousResult, // Pass previous result
  });

  previousResult = result;
  drawMask(result.bitmap);
});`}
      </pre>
    </div>
  ),
};

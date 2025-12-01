# sam-web

Client-side Segment Anything Model (SAM) for the browser with WebGPU acceleration.

**Click-to-segment** in 3 lines of code. Works with any web framework (React, Vue, vanilla JS).

## Features

- 🚀 **WebGPU Acceleration** - Fast inference with automatic CPU fallback
- 📦 **Two Models** - MobileSAM (fast, 45MB) and SAM2 (accurate, 151MB)
- 🎯 **Simple API** - Encode once, segment many times
- 💾 **Model Caching** - OPFS caching for instant subsequent loads
- 🔧 **Framework Agnostic** - Works with React, Vue, Svelte, vanilla JS
- 📐 **Normalized Coordinates** - Use 0-1 coordinates, not pixels

## Installation

```bash
npm install sam-web onnxruntime-web
```

## Quick Start

```typescript
import { SAMClient } from 'sam-web';

// Create client with model choice
const sam = new SAMClient({
  model: 'mobilesam', // or 'sam2' for higher quality
  onProgress: (stage) => console.log(stage), // 'downloading' | 'loading' | 'encoding' | 'decoding' | 'ready'
});

// Initialize worker (required)
await sam.initialize(
  new URL('sam-web/worker', import.meta.url)
);

// Load and encode image (one-time per image, ~300-700ms)
await sam.setImage(imageElement);

// Click to segment (fast, ~50ms per click)
const mask = await sam.segment({
  points: [
    { x: 0.5, y: 0.5, label: 1 }, // foreground point (normalized 0-1)
  ],
});

// Use the result
console.log(mask.score);    // IoU confidence
console.log(mask.bitmap);   // ImageBitmap for canvas
console.log(mask.data);     // Float32Array raw mask
console.log(mask.bounds);   // { x, y, width, height } normalized

// Cleanup
sam.dispose();
```

## API Reference

### SAMClient

Main class for click-to-segment functionality.

#### Constructor

```typescript
new SAMClient(options?: SAMClientOptions)
```

Options:
- `model`: Model to use - `'mobilesam'` | `'sam2'` | `'sam2_tiny'` | custom `ModelConfig`
- `device`: Preferred device - `'webgpu'` | `'cpu'` | `'auto'` (default: `'auto'`)
- `onProgress`: Callback for progress updates

#### Methods

##### `initialize(workerUrl: URL | string): Promise<void>`

Initialize the worker. Required before using `setImage` or `segment`.

```typescript
await sam.initialize(
  new URL('sam-web/worker', import.meta.url)
);
```

##### `setImage(image: ImageInput): Promise<void>`

Load and encode an image. Call once per image.

```typescript
// Accepts: HTMLImageElement, HTMLCanvasElement, ImageBitmap, ImageData
await sam.setImage(document.getElementById('myImage'));
```

##### `segment(options: SegmentOptions): Promise<SegmentResult>`

Segment based on point/box prompts.

```typescript
const mask = await sam.segment({
  // Point prompts (normalized 0-1 coordinates)
  points: [
    { x: 0.5, y: 0.5, label: 1 }, // foreground
    { x: 0.2, y: 0.2, label: 0 }, // background
  ],

  // Optional: box prompt
  box: { x1: 0.1, y1: 0.1, x2: 0.9, y2: 0.9 },

  // Optional: previous mask for refinement
  previousMask: previousResult,
});
```

##### `dispose(): void`

Cleanup resources.

### SegmentResult

Result from `segment()`:

```typescript
interface SegmentResult {
  bitmap: ImageBitmap;      // For canvas rendering
  data: Float32Array;       // Raw mask (0-1 values)
  shape: [number, number];  // [height, width]
  score: number;            // IoU confidence
  bounds: {                 // Normalized bounding box
    x: number;
    y: number;
    width: number;
    height: number;
  };
}
```

### Static Methods

```typescript
// Check browser capabilities
const caps = await SAMClient.checkCapabilities();
// { webgpu: true, opfs: true, workers: true, recommended: 'sam2_tiny' }

// Get available models
const models = SAMClient.getAvailableModels();
```

## Models

| Model | Size | Encode Time | Quality | Best For |
|-------|------|-------------|---------|----------|
| `mobilesam` | 45 MB | ~345ms | Good | Interactive use, mobile |
| `sam2_tiny` | 151 MB | ~700ms | Better | Accuracy-critical tasks |

## Usage with Frameworks

### React

```tsx
import { useEffect, useRef, useState } from 'react';
import { SAMClient } from 'sam-web';

function SegmentImage({ imageSrc }) {
  const samRef = useRef<SAMClient | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const sam = new SAMClient({ model: 'mobilesam' });
    samRef.current = sam;

    sam.initialize(
      new URL('sam-web/worker', import.meta.url)
    ).then(() => setReady(true));

    return () => sam.dispose();
  }, []);

  const handleImageLoad = async (img: HTMLImageElement) => {
    if (samRef.current && ready) {
      await samRef.current.setImage(img);
    }
  };

  const handleClick = async (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!samRef.current) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    const mask = await samRef.current.segment({
      points: [{ x, y, label: 1 }],
    });

    // Draw mask.bitmap to canvas
  };

  return (
    <canvas onClick={handleClick} />
  );
}
```

### Vanilla JS

```html
<script type="module">
  import { SAMClient } from 'sam-web';

  const sam = new SAMClient({ model: 'mobilesam' });

  await sam.initialize(
    new URL('sam-web/worker', import.meta.url)
  );

  const img = document.getElementById('image');
  await sam.setImage(img);

  document.getElementById('canvas').addEventListener('click', async (e) => {
    const rect = e.target.getBoundingClientRect();
    const mask = await sam.segment({
      points: [{
        x: (e.clientX - rect.left) / rect.width,
        y: (e.clientY - rect.top) / rect.height,
        label: 1
      }]
    });

    // Render mask
    const ctx = e.target.getContext('2d');
    ctx.drawImage(mask.bitmap, 0, 0, rect.width, rect.height);
  });
</script>
```

## Browser Compatibility

| Feature | Chrome | Firefox | Safari | Edge |
|---------|--------|---------|--------|------|
| WebGPU | ✅ 113+ | ⚠️ Flag | ❌ | ✅ 113+ |
| CPU Fallback | ✅ | ✅ | ✅ | ✅ |
| OPFS Cache | ✅ | ✅ | ⚠️ Partial | ✅ |

## Advanced Usage

### Custom Model Configuration

```typescript
import { SAMClient, ModelConfig } from 'sam-web';

const customConfig: ModelConfig = {
  id: 'my-model',
  name: 'My Custom SAM',
  description: 'Custom SAM model',
  encoderUrl: 'https://my-cdn.com/encoder.onnx',
  decoderUrl: 'https://my-cdn.com/decoder.onnx',
  imageSize: { w: 1024, h: 1024 },
  maskSize: { w: 256, h: 256 },
  modelType: 'sam2',
  encoderInputName: 'image',
  useBatchDimension: true,
  tensorFormat: 'CHW',
};

const sam = new SAMClient({ model: customConfig });
```

### Low-Level API

For advanced control, use the core classes directly:

```typescript
import { SAM2, SAMWorker } from 'sam-web';

// Direct ONNX inference (no worker)
const sam2 = new SAM2('mobilesam');
await sam2.downloadModels();
await sam2.createSessions();
await sam2.encodeImage(tensor);
const result = await sam2.decode(points);
```

## Performance Tips

1. **Encode Once** - Call `setImage()` once, then `segment()` multiple times
2. **Use MobileSAM** - 2x faster encoding, sufficient for most uses
3. **Preload Models** - Models are cached after first download
4. **Iterative Refinement** - Use `previousMask` for better results

## License

MIT

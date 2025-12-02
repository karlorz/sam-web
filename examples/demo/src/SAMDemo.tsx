import { useState, useEffect, useRef, useCallback, type MouseEvent } from 'react';
import { cn } from '@/lib/utils';

// Import sam-web library
import {
  SAMClient,
  MODEL_CONFIGS,
  type SegmentResult,
  type ProgressStage,
} from 'sam-web';

// UI components
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import InputDialog from '@/components/ui/InputDialog';
import { Button } from '@/components/ui/button';
import { LoaderCircle, ImageUp, ImageDown, Github, Fan } from 'lucide-react';

// Default model to use
const DEFAULT_MODEL = 'sam2_tiny';

export default function SAMDemo() {
  // Model selection
  const [selectedModel, setSelectedModel] = useState(DEFAULT_MODEL);

  // State
  const [device, setDevice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [imageEncoded, setImageEncoded] = useState(false);
  const [status, setStatus] = useState('');

  // SAM client and canvas refs
  const samClientRef = useRef<SAMClient | null>(null);
  const [imageCanvas, setImageCanvas] = useState<HTMLCanvasElement | null>(null);
  const [maskResult, setMaskResult] = useState<SegmentResult | null>(null);
  const [imageURL, setImageURL] = useState(
    'https://upload.wikimedia.org/wikipedia/commons/3/38/Flamingos_Laguna_Colorada.jpg'
  );
  const canvasEl = useRef<HTMLCanvasElement>(null);
  const fileInputEl = useRef<HTMLInputElement>(null);
  const pointsRef = useRef<Array<{ x: number; y: number; label: 0 | 1 }>>([]);

  const [stats, setStats] = useState<object | null>(null);

  // Input dialog for custom URLs
  const [inputDialogOpen, setInputDialogOpen] = useState(false);
  const inputDialogDefaultURL =
    'https://upload.wikimedia.org/wikipedia/commons/9/96/Pro_Air_Martin_404_N255S.jpg';

  // Progress callback
  const handleProgress = useCallback((stage: ProgressStage) => {
    switch (stage) {
      case 'downloading':
      case 'loading':
        setLoading(true);
        setStatus('Loading model');
        break;
      case 'encoding':
        setLoading(true);
        setStatus('Encoding');
        break;
      case 'decoding':
        setLoading(true);
        setStatus('Decoding');
        break;
      case 'ready':
        setLoading(false);
        break;
    }
  }, []);

  // Start encoding image
  const encodeImageClick = async () => {
    if (!samClientRef.current || !imageCanvas) return;

    setLoading(true);
    setStatus('Encoding');

    try {
      await samClientRef.current.setImage(imageCanvas);
      setImageEncoded(true);
      setLoading(false);
      setStatus('Ready. Click on image');
      // Update stats after encoding
      const updatedStats = await samClientRef.current.getStats();
      setStats(updatedStats);
    } catch (error) {
      console.error('Encoding error:', error);
      setStatus('Error encoding image');
      setLoading(false);
    }
  };

  // Start decoding, prompt with mouse coords
  const imageClick = async (event: MouseEvent<HTMLCanvasElement>) => {
    if (!imageEncoded || !samClientRef.current) return;

    event.preventDefault();

    const canvas = canvasEl.current;
    if (!canvas) return;

    const rect = event.currentTarget.getBoundingClientRect();

    // Normalize coordinates to 0-1
    const point = {
      x: (event.clientX - rect.left) / canvas.width,
      y: (event.clientY - rect.top) / canvas.height,
      label: (event.button === 0 ? 1 : 0) as 0 | 1,
    };
    pointsRef.current.push(point);

    setLoading(true);
    setStatus('Decoding');

    try {
      const result = await samClientRef.current.segment({
        points: pointsRef.current,
        previousMask: maskResult ?? undefined,
      });

      setMaskResult(result);
      setLoading(false);
      setStatus('Ready. Click on image');
      // Update stats after decoding
      const updatedStats = await samClientRef.current.getStats();
      setStats(updatedStats);
    } catch (error) {
      console.error('Decoding error:', error);
      setStatus('Error decoding');
      setLoading(false);
    }
  };

  // Crop image with mask
  const cropClick = () => {
    if (!imageCanvas || !maskResult) return;

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) return;

    canvas.height = imageCanvas.height;
    canvas.width = imageCanvas.width;

    // Draw mask first (scaled to match image)
    context.drawImage(
      maskResult.bitmap,
      0,
      0,
      maskResult.bitmap.width,
      maskResult.bitmap.height,
      0,
      0,
      canvas.width,
      canvas.height
    );
    context.globalCompositeOperation = 'source-in';
    context.drawImage(
      imageCanvas,
      0,
      0,
      imageCanvas.width,
      imageCanvas.height,
      0,
      0,
      canvas.width,
      canvas.height
    );

    const link = document.createElement('a');
    link.href = canvas.toDataURL();
    link.download = 'crop.png';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Reset all the image-based state
  const resetState = () => {
    pointsRef.current = [];
    setImageCanvas(null);
    setMaskResult(null);
    setImageEncoded(false);
  };

  // New image: From File
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    resetState();

    const dataURL = window.URL.createObjectURL(file);
    setImageURL(dataURL);
    setStatus('Encode image');

    e.target.value = '';
  };

  // New image: From URL
  const handleUrl = (urlText: string) => {
    resetState();
    setStatus('Encode image');
    setImageURL(urlText);
  };

  async function handleRequestStats() {
    if (!samClientRef.current) return;
    const stats = await samClientRef.current.getStats();
    setStats(stats);
  }

  // Handle model selection change
  const handleModelChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const newModelId = event.target.value;
    setSelectedModel(newModelId);

    // Reset encoding state but keep the loaded image
    pointsRef.current = [];
    setMaskResult(null);
    setImageEncoded(false);
    setStatus('Encode image');
  };

  // Initialize SAM client - recreate when model changes
  useEffect(() => {
    // Dispose existing client if present
    if (samClientRef.current) {
      samClientRef.current.dispose();
      samClientRef.current = null;
    }

    // Create new client with selected model
    const client = new SAMClient({
      model: selectedModel,
      onProgress: handleProgress,
    });

    samClientRef.current = client;
    setLoading(true);
    setStatus('Loading model');

    // Initialize with worker
    client
      .initialize(new URL('sam-web/worker', import.meta.url))
      .then(async () => {
        // Get actual device from worker stats
        const stats = await client.getStats();
        setDevice(stats.device);
        setLoading(false);
        setStatus('Encode image');
      })
      .catch((error) => {
        console.error('Failed to initialize SAM client:', error);
        setStatus('Error loading model');
        setLoading(false);
      });

    // Cleanup on unmount or model change
    return () => {
      if (samClientRef.current) {
        samClientRef.current.dispose();
        samClientRef.current = null;
      }
    };
  }, [selectedModel, handleProgress]);

  // Load image, pad to square and store in offscreen canvas
  useEffect(() => {
    if (imageURL) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = imageURL;
      img.onload = function () {
        const largestDim = Math.max(img.naturalWidth, img.naturalHeight);

        // Calculate padding for aspect ratio preservation
        let box: { x: number; y: number; w: number; h: number };
        if (img.naturalHeight === img.naturalWidth) {
          box = { x: 0, y: 0, w: largestDim, h: largestDim };
        } else if (img.naturalHeight > img.naturalWidth) {
          const newW = (img.naturalWidth / img.naturalHeight) * largestDim;
          const padLeft = Math.floor((largestDim - newW) / 2);
          box = { x: padLeft, y: 0, w: newW, h: largestDim };
        } else {
          const newH = (img.naturalHeight / img.naturalWidth) * largestDim;
          const padTop = Math.floor((largestDim - newH) / 2);
          box = { x: 0, y: padTop, w: largestDim, h: newH };
        }

        const canvas = document.createElement('canvas');
        canvas.width = largestDim;
        canvas.height = largestDim;

        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(
            img,
            0,
            0,
            img.naturalWidth,
            img.naturalHeight,
            box.x,
            box.y,
            box.w,
            box.h
          );
        }
        setImageCanvas(canvas);
      };
    }

    // Cleanup: revoke blob URL to prevent memory leaks
    return () => {
      if (imageURL && imageURL.startsWith('blob:')) {
        URL.revokeObjectURL(imageURL);
      }
    };
  }, [imageURL]);

  // Offscreen canvas changed, draw it
  useEffect(() => {
    if (imageCanvas) {
      const canvas = canvasEl.current;
      if (!canvas) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(
        imageCanvas,
        0,
        0,
        imageCanvas.width,
        imageCanvas.height,
        0,
        0,
        canvas.width,
        canvas.height
      );
    }
  }, [imageCanvas]);

  // Mask changed, draw original image and mask on top with some alpha
  useEffect(() => {
    if (!imageCanvas) return;

    const canvas = canvasEl.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Always redraw the base image first
    ctx.drawImage(
      imageCanvas,
      0,
      0,
      imageCanvas.width,
      imageCanvas.height,
      0,
      0,
      canvas.width,
      canvas.height
    );

    // If mask exists, overlay it
    if (maskResult) {
      ctx.globalAlpha = 0.7;
      ctx.drawImage(
        maskResult.bitmap,
        0,
        0,
        maskResult.bitmap.width,
        maskResult.bitmap.height,
        0,
        0,
        canvas.width,
        canvas.height
      );
      ctx.globalAlpha = 1;
    }
  }, [maskResult, imageCanvas]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-background p-4">
      <Card className="w-full max-w-2xl">
        <div className="absolute top-4 right-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.open('https://github.com/karlorz/sam-web', '_blank')}
          >
            <Github className="w-4 h-4 mr-2" />
            View on GitHub
          </Button>
        </div>
        <CardHeader>
          <CardTitle>
            <div className="flex flex-col gap-2">
              <p>
                Client-side Image Segmentation with{' '}
                <a
                  href="https://www.npmjs.com/package/sam-web"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  sam-web
                </a>
              </p>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <label htmlFor="model-select" className="text-sm font-normal">
                    Model:
                  </label>
                  <select
                    id="model-select"
                    value={selectedModel}
                    onChange={handleModelChange}
                    disabled={loading}
                    className="px-3 py-1 text-sm border rounded-md bg-white disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {Object.entries(MODEL_CONFIGS)
                      .filter(([key, model]) => key === model.id) // Filter out aliases
                      .map(([, model]) => (
                        <option key={model.id} value={model.id}>
                          {model.name}
                        </option>
                      ))}
                  </select>
                </div>
                <p className={cn('flex gap-1 items-center', device ? 'visible' : 'invisible')}>
                  <Fan
                    color="#000"
                    className="w-6 h-6 animate-[spin_2.5s_linear_infinite] direction-reverse"
                  />
                  Running on {device}
                </p>
              </div>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            <div className="flex justify-between gap-4">
              <Button onClick={encodeImageClick} disabled={loading || imageEncoded}>
                <p className="flex items-center gap-2">
                  {loading && <LoaderCircle className="animate-spin w-6 h-6" />}
                  {status}
                </p>
              </Button>
              <div className="flex gap-1">
                <Button
                  onClick={() => fileInputEl.current?.click()}
                  variant="secondary"
                  disabled={loading}
                >
                  <ImageUp /> Upload
                </Button>
                <Button
                  onClick={() => setInputDialogOpen(true)}
                  variant="secondary"
                  disabled={loading}
                >
                  <ImageUp /> From URL
                </Button>
                <Button onClick={cropClick} disabled={maskResult == null} variant="secondary">
                  <ImageDown /> Crop
                </Button>
              </div>
            </div>
            <div className="flex justify-center">
              <canvas
                ref={canvasEl}
                width={512}
                height={512}
                onClick={imageClick}
                onContextMenu={(event) => {
                  event.preventDefault();
                  imageClick(event);
                }}
                className="cursor-crosshair"
              />
            </div>
          </div>
        </CardContent>
        <div className="flex flex-col p-4 gap-2">
          <Button onClick={handleRequestStats} variant="secondary">
            Print stats
          </Button>
          <pre className="p-4 border-neutral-600 bg-neutral-100 rounded">
            {stats != null && JSON.stringify(stats, null, 2)}
          </pre>
        </div>
      </Card>
      <InputDialog
        open={inputDialogOpen}
        setOpen={setInputDialogOpen}
        submitCallback={handleUrl}
        defaultURL={inputDialogDefaultURL}
      />
      <input
        ref={fileInputEl}
        hidden
        accept="image/*"
        type="file"
        onChange={handleFileUpload}
      />
    </div>
  );
}

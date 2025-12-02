# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

sam-web is a client-side Segment Anything Model (SAM) library for browsers with WebGPU acceleration. It provides click-to-segment functionality using ONNX models (MobileSAM and SAM2) running entirely in the browser via Web Workers.

## Config

```bash
npm run demo           # Start demo app at http://localhost:5173
```

After finishing a task, run `npm run check` in root to typecheck and lint everything. You should always cd to root and run this command; do not manually run tsc or eslint any other way.

## Architecture

### Core Components

**SAMClient** (`src/SAMClient.ts`) - High-level API for click-to-segment. Handles:
- Coordinate normalization (0-1 to pixel coords)
- Image preprocessing (square canvas with padding)
- Mask selection (best IoU score)
- Worker lifecycle management

**SAMWorker** (`src/SAMWorker.ts`) - Manages Web Worker communication with promise-based message passing for initialize/encode/decode operations.

**SAM2** (`src/core/SAM2.ts`) - Low-level ONNX inference. Handles:
- Model download with OPFS caching
- Execution provider fallback (WebGPU → CPU)
- Different encoder/decoder structures for SAM2 vs MobileSAM

**Worker** (`src/core/worker.ts`) - Web Worker entry point. Performs tensor format conversion (CHW ↔ HWC), normalization, and runs inference.

### Data Flow

1. `SAMClient.setImage()` → converts image to square canvas → `Float32Array` tensor → worker `encodeImage`
2. `SAMClient.segment()` → converts normalized points to pixel coords → worker `decodeMask` → selects best mask by IoU

### Model Configurations (`src/models/config.ts`)

Two models with different requirements:
- **MobileSAM**: HWC tensor format, 0-255 input range, single encoder output
- **SAM2**: CHW tensor format, batch dimension, three encoder outputs (high_res_feats_0, high_res_feats_1, image_embed)

### Build Outputs

Vite builds two entry points:
- `dist/index.js` - Main library exports
- `dist/worker.js` - Worker entry (imported separately by consumers)

`onnxruntime-web` is external (peer dependency) to avoid bundling conflicts.

## Key Patterns

- Coordinates use normalized 0-1 values, converted to pixels internally
- Box prompts use special labels (2 for top-left, 3 for bottom-right)
- Previous masks can be passed for iterative refinement
- OPFS caches downloaded models by filename

## Storybook

Storybook is configured at the project root for library documentation:

- `.storybook/` - Storybook configuration
- `src/*.stories.tsx` - Component stories co-located with source
- `src/*.mdx` - Documentation pages

The Storybook URL is configured in `package.json` for package composition, allowing consumers to compose sam-web stories into their own Storybook.

## Demo App

A React 18 + Vite demo is in `examples/demo/`. Run `npm run demo` from root to start it.

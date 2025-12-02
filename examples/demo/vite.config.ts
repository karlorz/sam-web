import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      // Resolve onnxruntime-web to the full bundle for WebGPU support
      'onnxruntime-web/all': resolve(
        __dirname,
        'node_modules/onnxruntime-web/dist/ort.all.bundle.min.mjs'
      ),
    },
  },
  optimizeDeps: {
    exclude: ['onnxruntime-web'],
  },
  worker: {
    format: 'es',
  },
  server: {
    fs: {
      // Allow serving files from the parent sam-web package
      allow: ['../..'],
    },
  },
});

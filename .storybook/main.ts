import type { StorybookConfig } from '@storybook/react-vite';

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(js|jsx|mjs|ts|tsx)'],
  addons: ['@storybook/addon-docs'],
  framework: '@storybook/react-vite',
  staticDirs: [{ from: '../dist', to: '/dist' }],
  viteFinal: async (config) => {
    // Merge custom Vite config for ONNX runtime support
    return {
      ...config,
      resolve: {
        ...config.resolve,
        alias: {
          ...config.resolve?.alias,
          '@': '/src',
        },
      },
      // Exclude onnxruntime-web from optimization to prevent WASM bundling issues
      optimizeDeps: {
        ...config.optimizeDeps,
        exclude: [...(config.optimizeDeps?.exclude ?? []), 'onnxruntime-web'],
      },
      // Configure worker format for ES modules
      worker: {
        format: 'es',
      },
    };
  },
};

export default config;

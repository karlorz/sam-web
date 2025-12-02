import type { StorybookConfig } from '@storybook/react-vite';

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(js|jsx|mjs|ts|tsx)'],
  addons: ['@storybook/addon-docs'],
  framework: '@storybook/react-vite',
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
      // Configure worker to bundle dependencies (including onnxruntime-web)
      worker: {
        format: 'es',
        rollupOptions: {
          output: {
            // Inline all dependencies into worker bundle
            inlineDynamicImports: true,
          },
        },
      },
    };
  },
};

export default config;

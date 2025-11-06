import { defineConfig } from 'vitest/config';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    globals: true,
    environment: 'node', // Changed from 'jsdom' since we're only testing parser functions
    setupFiles: './tests/setup.js',
    include: ['tests/unit/**/*.test.js'], // Only include unit tests
    exclude: ['tests/e2e/**', 'node_modules/**', '**/dist/**'], // Exclude E2E tests
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'tests/',
        '**/*.config.js',
        '**/dist/',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './frontend/src'),
    },
  },
});


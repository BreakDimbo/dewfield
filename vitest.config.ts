import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

const alias = { '@': fileURLToPath(new URL('./src', import.meta.url)) };

export default defineConfig({
  resolve: { alias },
  define: { __BUILD__: JSON.stringify('test') },
  test: {
    projects: [
      {
        resolve: { alias },
        define: { __BUILD__: JSON.stringify('test') },
        test: {
          name: 'node',
          environment: 'node',
          include: [
            'src/core/**/*.test.ts',
            'src/state/**/*.test.ts',
            'src/audio/**/*.test.ts',
            'src/render/**/*.pure.test.ts',
            'tools/**/*.test.ts',
            'tests/lint/**/*.test.ts',
          ],
          testTimeout: 30_000,
        },
      },
      {
        resolve: { alias },
        define: { __BUILD__: JSON.stringify('test') },
        test: {
          name: 'ui',
          environment: 'jsdom',
          include: ['src/ui/**/*.test.tsx', 'src/ui/**/*.test.ts'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/core/**/*.ts'],
      exclude: ['src/core/**/*.test.ts', 'src/core/**/index.ts', 'src/core/**/types.ts'],
      thresholds: { lines: 90, branches: 85 },
      reporter: ['text-summary', 'html'],
    },
  },
});

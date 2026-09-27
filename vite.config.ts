import { execSync } from 'node:child_process';
import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

function buildId(): string {
  let sha = 'nogit';
  try {
    sha = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    /* building outside a git checkout */
  }
  return `${sha}-${new Date().toISOString().slice(0, 10)}`;
}

export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  define: {
    __BUILD__: JSON.stringify(buildId()),
  },
  server: { port: 5391, strictPort: true, host: true },
  preview: { port: 5392, strictPort: true, host: true },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1000,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            // three's glTF loader + meshopt decoder stay in their own lazy chunk (03 §14: only fetched for `ART = 'glb'`).
            {
              name: 'vendor-three',
              test: /node_modules[\\/](three(?![\\/]examples[\\/]jsm[\\/](loaders|libs)[\\/])|@react-three|maath)[\\/]/,
            },
            { name: 'vendor-react', test: /node_modules[\\/](react|react-dom|scheduler|zustand)[\\/]/ },
          ],
        },
      },
    },
  },
});

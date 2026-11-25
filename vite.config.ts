import { defineConfig } from 'vite';

export default defineConfig({
  server: { port: 5196, strictPort: true },
  preview: { port: 4173 },
  build: { target: 'es2022', chunkSizeWarningLimit: 1200 },
  worker: { format: 'es' },
  test: { include: ['tests/**/*.test.ts'] },
} as never);

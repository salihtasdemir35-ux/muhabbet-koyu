import { defineConfig } from 'vite';
import path from 'node:path';

export default defineConfig({
  root: path.resolve(import.meta.dirname),
  publicDir: path.resolve(import.meta.dirname, 'public'),
  build: {
    outDir: path.resolve(import.meta.dirname, '../dist'),
    emptyOutDir: true,
    chunkSizeWarningLimit: 2000,
    target: 'es2020',
  },
  server: { host: true, port: 5173, fs: { allow: [path.resolve(import.meta.dirname, '..')] } },
});

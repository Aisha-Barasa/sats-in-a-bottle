import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export default defineConfig({
  root: here,
  plugins: [react()],
  server: { fs: { allow: ['..'] }, port: 5173, strictPort: true, proxy: { '/api': { target: process.env.API_URL || 'http://localhost:4000' } } },
  build: { outDir: path.join(here, 'dist'), emptyOutDir: true, sourcemap: false, assetsInlineLimit: 0, chunkSizeWarningLimit: 900 },
});

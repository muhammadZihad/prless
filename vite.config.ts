import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The web app lives in src/web. Built assets land in dist/web and are served by Fastify.
export default defineConfig({
  root: 'src/web',
  plugins: [react()],
  build: {
    outDir: '../../dist/web',
    emptyOutDir: true,
  },
  server: {
    port: 5174,
    proxy: {
      '/api': 'http://localhost:4100',
    },
  },
});

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Builds the same src/web React app for the VS Code webview: a single IIFE
// bundle with stable names, emitted into the extension's media folder.
export default defineConfig({
  root: 'src/web',
  base: './',
  plugins: [react()],
  build: {
    outDir: '../../extension/media',
    emptyOutDir: true,
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        format: 'iife',
        inlineDynamicImports: true,
        entryFileNames: 'webview.js',
        assetFileNames: (info) =>
          info.name && info.name.endsWith('.css') ? 'webview.css' : 'assets/[name]-[hash][extname]',
      },
    },
  },
});

import { defineConfig } from 'vite';
import { accessoryListPlugin } from './scripts/accessory-list-plugin.js';

export default defineConfig({
  root: '.',
  publicDir: 'assets',
  plugins: [accessoryListPlugin()],
  server: {
    port: 3000,
    open: true
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
});

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

/**
 * Four entries, one build (spec §2, §9). `console` and `board` ship now; the
 * projector and player entries join at milestones 5 and 4.
 */
export default defineConfig({
  plugins: [react()],
  root: __dirname,
  build: {
    outDir: resolve(__dirname, 'dist/client'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        console: resolve(__dirname, 'master.html'),
        board: resolve(__dirname, 'board.html'),
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/master/auth': 'http://localhost:3000',
      '/master/session': 'http://localhost:3000',
      '/master/signout': 'http://localhost:3000',
      '/socket.io': { target: 'http://localhost:3000', ws: true },
    },
  },
});

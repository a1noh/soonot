import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      // Workspace packages point `main` at TypeScript source; alias them so
      // Vite resolves them without a build step.
      '@soonot/master': fileURLToPath(new URL('./master/src/index.ts', import.meta.url)),
    },
  },
  test: {
    include: ['**/src/**/*.spec.ts'],
    environment: 'node',
  },
});

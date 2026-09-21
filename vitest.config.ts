import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  resolve: {
    // Workspace packages point `main` at TypeScript source, so Vite needs to be
    // told how to reach them without a build step. Deep paths first — the bare
    // package name would otherwise swallow them.
    alias: [
      { find: /^@soonot\/master\/(.*)$/, replacement: `${root}master/$1` },
      { find: /^@soonot\/bingo\/(.*)$/, replacement: `${root}bingo/$1` },
      { find: /^@soonot\/yutnori\/(.*)$/, replacement: `${root}yutnori/$1` },
      { find: '@soonot/master', replacement: `${root}master/src/index.ts` },
    ],
  },
  test: {
    include: ['**/src/**/*.spec.{ts,tsx}'],
    // Node by default; UI specs opt into jsdom with a `// @vitest-environment
    // jsdom` docblock. CSS imports in components are stubbed rather than parsed.
    environment: 'node',
    css: false,
    testTimeout: 20000,
  },
});

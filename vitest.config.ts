import { defineConfig } from 'vitest/config';

// Separate from vite.config.ts (which roots the web app at src/web) so tests
// run from the project root and pick up the server suites.
export default defineConfig({
  test: {
    root: '.',
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});

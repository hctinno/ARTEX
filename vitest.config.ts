import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      { test: { name: 'ui', root: 'packages/ui', include: ['test/**/*.test.ts'] } },
      { test: { name: 'core', root: 'packages/core', include: ['test/**/*.test.ts'] } },
      {
        test: {
          name: 'desktop-main',
          root: 'apps/desktop',
          include: ['test/unit/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'desktop-renderer',
          root: 'apps/desktop',
          include: ['test/unit/**/*.test.tsx'],
          environment: 'jsdom',
          setupFiles: ['test/unit/setup-dom.ts'],
        },
      },
    ],
  },
});

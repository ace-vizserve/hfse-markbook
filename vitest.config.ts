import path from 'path';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    include: ['__tests__/**/*.test.ts'],
    globals: true,
  },
  resolve: {
    alias: {
      'server-only': path.resolve(__dirname, './__mocks__/server-only.ts'),
    },
  },
});

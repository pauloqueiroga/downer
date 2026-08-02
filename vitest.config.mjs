import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The preview tests exercise real DOM parsing/sanitizing.
    environment: 'jsdom',
    include: ['tests/**/*.test.mjs']
  }
});

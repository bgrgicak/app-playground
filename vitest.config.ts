import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Run tests serially to avoid port conflicts
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    // Longer timeout for integration tests that spawn real instances
    testTimeout: 120000,
    hookTimeout: 120000,
    // Clean up between tests
    clearMocks: true,
    // Display detailed output
    reporters: ['verbose'],
  },
});

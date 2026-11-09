import { defineConfig } from 'vitest/config';

try {
  process.loadEnvFile('.env');
} catch {
  // No .env file: rely on the real environment.
}

const hasTestDatabase = Boolean(process.env.TEST_DATABASE_URL);
if (!hasTestDatabase) console.warn('TEST_DATABASE_URL is not set, so the API tests are skipped.');

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    exclude: hasTestDatabase ? [] : ['src/routes/**'],
    globalSetup: hasTestDatabase ? ['src/routes/__tests__/global-setup.ts'] : [],
    // Tests must behave the same on every machine and never call a paid API.
    env: { DEMO_MODE: 'false', ANTHROPIC_API_KEY: '' },
    // The API suites share one test database, so files must not run at the same time.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
});

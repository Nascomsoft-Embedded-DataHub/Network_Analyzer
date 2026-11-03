import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

/**
 * The database suites share one PostgreSQL instance and clear its tables
 * between tests, so test files must not run in parallel (Day 3).
 *
 * Vitest also does not read .env files into process.env, so suites that
 * need a database would skip themselves even with one configured. The URL
 * comes from backend/.env and is only injected when actually set, so a
 * machine without PostgreSQL still runs the rest of the suite.
 */
export default defineConfig(({ mode }) => {
  const fileEnv = loadEnv(mode, process.cwd(), '');

  return {
    test: {
      fileParallelism: false,
      env: {
        TEST_DATABASE_URL: process.env.TEST_DATABASE_URL ?? fileEnv.TEST_DATABASE_URL,
      },
    },
  };
});

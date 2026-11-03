import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

/**
 * Vitest does not read .env files into process.env, so the ingestion suite
 * would skip itself even with a configured database. The URL is taken from
 * backend/.env and only injected when it is actually set, so a machine
 * without PostgreSQL still runs the rest of the suite.
 */
export default defineConfig(({ mode }) => {
  const fileEnv = loadEnv(mode, process.cwd(), '');

  return {
    test: {
      env: {
        TEST_DATABASE_URL: process.env.TEST_DATABASE_URL ?? fileEnv.TEST_DATABASE_URL,
      },
    },
  };
});

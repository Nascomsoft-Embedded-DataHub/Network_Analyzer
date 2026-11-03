import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    /**
     * The suites that need a database share one PostgreSQL instance and
     * clear its tables between tests, so they have to take turns. Two files
     * wiping the same tables at the same time would have one suite deleting
     * the rows another suite is asserting on.
     */
    fileParallelism: false,
  },
});

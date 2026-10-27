import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.js';

export type Database = ReturnType<typeof createDatabase>;

/**
 * Creates a pooled Postgres connection and returns the Drizzle client.
 *
 * The pool is created lazily so that importing this module does not open a
 * socket — that keeps the test suite from requiring a live database.
 */
export function createDatabase(connectionString: string) {
  const pool = new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });

  const db = drizzle(pool, { schema });

  return Object.assign(db, { pool });
}

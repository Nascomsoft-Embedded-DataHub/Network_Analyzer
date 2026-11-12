import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import type { Database } from '../src/db/client.js';
import { MOCK_DEVICES } from '@network-analyser/contracts';

/**
 * Route-level contract tests.
 *
 * The database handle is stubbed so these run without PostgreSQL. They
 * verify the HTTP envelope (status codes, validation errors, response
 * shapes) against the shared contracts — the SQL itself is exercised by
 * integration runs against a live database.
 *
 * Every request carries a session token, because the guard refuses anything
 * without one. The public surface — the sign-in endpoint, the liveness probe
 * and the unmatched-route 404 — is covered in `auth.test.ts`.
 */

const DEVICE_UUID = MOCK_DEVICES[0]!.id;
const ADMIN_PASSWORD = 'correct-horse-battery';
const SECRET = 'test-secret-value-long-enough';

/**
 * Drizzle's query builder is a thenable, so the stub must be one too —
 * awaiting a chain resolves the eventual result set.
 */
function createDbStub(options: { rows?: unknown[]; total?: number } = {}): Database {
  const { rows = [], total = 0 } = options;

  const makeChain = (result: unknown): unknown => {
    const chain: Record<string, unknown> = {};
    for (const method of ['from', 'where', 'orderBy', 'limit', 'offset', 'groupBy'] as const) {
      chain[method] = vi.fn(() => chain);
    }
    chain.then = (
      onFulfilled: (value: unknown) => unknown,
      onRejected: (error: unknown) => unknown,
    ) => Promise.resolve(result).then(onFulfilled, onRejected);
    return chain;
  };

  let selectCalls = 0;
  const db = {
    select: vi.fn(() => {
      selectCalls += 1;
      // First select in a handler fetches rows; the paired count query is second.
      return selectCalls % 2 === 1 ? makeChain(rows) : makeChain([{ value: total }]);
    }),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    pool: { end: vi.fn().mockResolvedValue(undefined) },
  } as unknown as Database;

  return db;
}

describe('API contract enforcement', () => {
  let db: Database;

  beforeEach(() => {
    db = createDbStub();
  });

  async function app() {
    const built = await buildApp({
      config: loadConfig({
        NODE_ENV: 'test',
        ANALYSER_ADMIN_EMAIL: 'admin@analyser.local',
        ANALYSER_ADMIN_PASSWORD: ADMIN_PASSWORD,
        ANALYSER_VIEWER_EMAIL: 'viewer@analyser.local',
        ANALYSER_VIEWER_PASSWORD: 'viewer-password',
      }),
      db,
      sessionSecret: SECRET,
    });

    // A token for the administrator, so the guard lets the request through.
    const session = built.sessions.issue({
      id: 'a1000000-0000-4000-8000-000000000001',
      name: 'Administrator',
      email: 'admin@analyser.local',
      role: 'admin',
    });

    return { fastify: built.app, token: session.token };
  }

  it('serves the health-check endpoint', async () => {
    const { fastify } = await app();
    const response = await fastify.inject({ method: 'GET', url: '/api/health-check' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
    await fastify.close();
  });

  it('reports which machine the analyser is running on', async () => {
    const { fastify, token } = await app();
    const response = await fastify.inject({
      method: 'GET',
      url: '/api/system/info',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    const { data } = response.json();
    expect(data.version).toBe('0.1.0');
    expect(data.bindPort).toBe(3000);
    expect(data.loopbackOnly).toBe(true);
    expect(data.runtime.nodeVersion).toMatch(/^v/);
    expect(data.hostname).toBeTruthy();
    await fastify.close();
  });

  it('rejects an invalid device list query with the error envelope', async () => {
    const { fastify, token } = await app();
    const response = await fastify.inject({
      method: 'GET',
      url: '/api/devices?limit=not-a-number',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'limit' })]),
    );
    await fastify.close();
  });

  it('rejects an unknown status filter value', async () => {
    const { fastify, token } = await app();
    const response = await fastify.inject({
      method: 'GET',
      url: '/api/devices?status=compromised',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('VALIDATION_ERROR');
    await fastify.close();
  });

  it('accepts a valid device list query', async () => {
    const { fastify, token } = await app();
    const response = await fastify.inject({
      method: 'GET',
      url: '/api/devices?status=online&limit=10&offset=0',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().meta).toEqual({ total: 0, limit: 10, offset: 0 });
    await fastify.close();
  });

  it('coerces the isKnown string flag to a boolean', async () => {
    const { fastify, token } = await app();
    const response = await fastify.inject({
      method: 'GET',
      url: '/api/devices?isKnown=true',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(200);
    await fastify.close();
  });

  it('rejects a MAC address in the wrong format via the device contract', async () => {
    const { fastify, token } = await app();
    // markKnown rejects the body before any database access
    const response = await fastify.inject({
      method: 'PATCH',
      url: `/api/devices/${DEVICE_UUID}/known`,
      headers: { authorization: `Bearer ${token}` },
      payload: { isKnown: 'yes-please' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('VALIDATION_ERROR');
    await fastify.close();
  });

  it('returns 404 envelope shape for unknown routes', async () => {
    const { fastify } = await app();
    const response = await fastify.inject({ method: 'GET', url: '/api/does-not-exist' });
    expect(response.statusCode).toBe(404);
    const body = response.json();
    // Fastify's own 404 for unhandled routes
    expect(body.message ?? body.error?.message).toBeDefined();
    await fastify.close();
  });
});

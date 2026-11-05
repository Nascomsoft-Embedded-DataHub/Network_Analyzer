import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import type { Database } from '../src/db/client.js';
import { SessionService } from '../src/auth/session.js';

/**
 * Authentication and role-based access tests.
 *
 * These cover the boundary the dashboard depends on: what an anonymous
 * caller can reach, what a viewer can reach, and what only an administrator
 * can change.
 */

const ADMIN_EMAIL = 'admin@analyser.local';
const ADMIN_PASSWORD = 'correct-horse-battery';
const VIEWER_EMAIL = 'viewer@analyser.local';
const VIEWER_PASSWORD = 'viewer-password';
const SECRET = 'test-secret-value-long-enough';

/**
 * A database stub. The auth routes never touch it, and the guarded routes
 * that do are only reached with a valid token, so the queries never resolve
 * to anything meaningful.
 */
function createDbStub(): Database {
  const chain: Record<string, unknown> = {};
  for (const method of [
    'from',
    'where',
    'orderBy',
    'limit',
    'offset',
    'groupBy',
    'values',
    'onConflictDoUpdate',
  ] as const) {
    chain[method] = vi.fn(() => chain);
  }
  chain.then = (
    onFulfilled: (value: unknown) => unknown,
    onRejected: (error: unknown) => unknown,
  ) => Promise.resolve([]).then(onFulfilled, onRejected);

  return {
    select: vi.fn(() => chain),
    insert: vi.fn(() => chain),
    update: vi.fn(() => chain),
    delete: vi.fn(() => chain),
    pool: { end: vi.fn().mockResolvedValue(undefined) },
  } as unknown as Database;
}

interface Built {
  fastify: Awaited<ReturnType<typeof buildApp>>['app'];
  sessions: SessionService;
}

async function build(
  overrides: Record<string, string> = {},
): Promise<Built> {
  const built = await buildApp({
    config: loadConfig({
      NODE_ENV: 'test',
      ANALYSER_ADMIN_EMAIL: ADMIN_EMAIL,
      ANALYSER_ADMIN_PASSWORD: ADMIN_PASSWORD,
      ANALYSER_VIEWER_EMAIL: VIEWER_EMAIL,
      ANALYSER_VIEWER_PASSWORD: VIEWER_PASSWORD,
      ...overrides,
    }),
    db: createDbStub(),
    sessionSecret: SECRET,
  });

  return { fastify: built.app, sessions: built.sessions };
}

function adminToken(sessions: SessionService): string {
  return sessions.issue({
    id: 'a1000000-0000-4000-8000-000000000001',
    name: 'Administrator',
    email: ADMIN_EMAIL,
    role: 'admin',
  }).token;
}

function viewerToken(sessions: SessionService): string {
  return sessions.issue({
    id: 'a1000000-0000-4000-8000-000000000002',
    name: 'Viewer',
    email: VIEWER_EMAIL,
    role: 'viewer',
  }).token;
}

describe('sign-in', () => {
  let built: Built;

  beforeEach(async () => {
    built = await build();
  });

  it('issues a session for correct administrator credentials', async () => {
    const response = await built.fastify.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    });

    expect(response.statusCode).toBe(200);
    const { data } = response.json();
    expect(data.user.email).toBe(ADMIN_EMAIL);
    expect(data.user.role).toBe('admin');
    expect(data.token).toEqual(expect.any(String));
    expect(data.expiresAt).toEqual(expect.any(String));
    await built.fastify.close();
  });

  it('issues a session for the viewer account', async () => {
    const response = await built.fastify.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: VIEWER_EMAIL, password: VIEWER_PASSWORD },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.user.role).toBe('viewer');
    await built.fastify.close();
  });

  it('refuses a wrong password without saying which part was wrong', async () => {
    const response = await built.fastify.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: ADMIN_EMAIL, password: 'not-the-password' },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('INVALID_CREDENTIALS');
    await built.fastify.close();
  });

  it('answers an unknown address the same way as a wrong password', async () => {
    const response = await built.fastify.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'nobody@analyser.local', password: ADMIN_PASSWORD },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('INVALID_CREDENTIALS');
    await built.fastify.close();
  });

  it('rejects a body that does not match the login contract', async () => {
    const response = await built.fastify.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: ADMIN_EMAIL, password: 'short' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('VALIDATION_ERROR');
    await built.fastify.close();
  });

  it('says the analyser is not configured when there is no administrator password', async () => {
    const unconfigured = await build({ ANALYSER_ADMIN_PASSWORD: '' });

    const response = await unconfigured.fastify.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    });

    expect(response.statusCode).toBe(503);
    expect(response.json().error.code).toBe('AUTH_NOT_CONFIGURED');
    await unconfigured.fastify.close();
  });
});

describe('the guard', () => {
  let built: Built;

  beforeEach(async () => {
    built = await build();
  });

  it('refuses a request with no token', async () => {
    const response = await built.fastify.inject({ method: 'GET', url: '/api/devices' });

    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('UNAUTHORIZED');
    await built.fastify.close();
  });

  it('refuses a request with a token it did not sign', async () => {
    const response = await built.fastify.inject({
      method: 'GET',
      url: '/api/devices',
      headers: { authorization: 'Bearer v1.not-a-real-token.signature' },
    });

    expect(response.statusCode).toBe(401);
    await built.fastify.close();
  });

  it('refuses a request with a malformed authorization header', async () => {
    const response = await built.fastify.inject({
      method: 'GET',
      url: '/api/devices',
      headers: { authorization: 'Basic dXNlcjpwYXNz' },
    });

    expect(response.statusCode).toBe(401);
    await built.fastify.close();
  });

  it('lets the liveness probe through without a token', async () => {
    const response = await built.fastify.inject({ method: 'GET', url: '/api/health-check' });

    expect(response.statusCode).toBe(200);
    await built.fastify.close();
  });

  it('lets a request for an unknown path reach the 404 handler', async () => {
    const response = await built.fastify.inject({ method: 'GET', url: '/api/nope' });

    expect(response.statusCode).toBe(404);
    await built.fastify.close();
  });

  it('renews a session on request', async () => {
    const token = adminToken(built.sessions);

    const response = await built.fastify.inject({
      method: 'GET',
      url: '/api/auth/session',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    const { data } = response.json();
    expect(data.user.email).toBe(ADMIN_EMAIL);
    expect(data.token).toEqual(expect.any(String));
    await built.fastify.close();
  });

  it('refuses to renew a session without a token', async () => {
    const response = await built.fastify.inject({ method: 'GET', url: '/api/auth/session' });

    expect(response.statusCode).toBe(401);
    await built.fastify.close();
  });
});

describe('role-based access', () => {
  let built: Built;

  beforeEach(async () => {
    built = await build();
  });

  it('lets a viewer read the device inventory', async () => {
    const response = await built.fastify.inject({
      method: 'GET',
      url: '/api/devices',
      headers: { authorization: `Bearer ${viewerToken(built.sessions)}` },
    });

    expect(response.statusCode).toBe(200);
    await built.fastify.close();
  });

  it('stops a viewer from marking a device as known', async () => {
    const response = await built.fastify.inject({
      method: 'PATCH',
      url: '/api/devices/6f6c1f0e-2e5a-4a4a-9c3f-0b6a1d2e3f40/known',
      headers: { authorization: `Bearer ${viewerToken(built.sessions)}` },
      payload: { isKnown: true },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('FORBIDDEN');
    await built.fastify.close();
  });

  it('stops a viewer from acknowledging an alert', async () => {
    const response = await built.fastify.inject({
      method: 'PATCH',
      url: '/api/alerts/6f6c1f0e-2e5a-4a4a-9c3f-0b6a1d2e3f41/acknowledge',
      headers: { authorization: `Bearer ${viewerToken(built.sessions)}` },
      payload: { acknowledged: true },
    });

    expect(response.statusCode).toBe(403);
    await built.fastify.close();
  });

  it('stops a viewer from changing an alert rule', async () => {
    const response = await built.fastify.inject({
      method: 'PUT',
      url: '/api/alerts/rules',
      headers: { authorization: `Bearer ${viewerToken(built.sessions)}` },
      payload: { type: 'high_usage', enabled: false, severity: 'info' },
    });

    expect(response.statusCode).toBe(403);
    await built.fastify.close();
  });

  it('lets a viewer read the alert rules', async () => {
    const response = await built.fastify.inject({
      method: 'GET',
      url: '/api/alerts/rules',
      headers: { authorization: `Bearer ${viewerToken(built.sessions)}` },
    });

    expect(response.statusCode).toBe(200);
    await built.fastify.close();
  });

  it('lets an administrator change an alert rule', async () => {
    const response = await built.fastify.inject({
      method: 'PUT',
      url: '/api/alerts/rules',
      headers: { authorization: `Bearer ${adminToken(built.sessions)}` },
      payload: { type: 'high_usage', enabled: false, severity: 'info' },
    });

    expect(response.statusCode).toBe(200);
    await built.fastify.close();
  });
});

describe('token signing', () => {
  it('rejects a token signed with a different secret', async () => {
    const other = new SessionService({
      adminEmail: ADMIN_EMAIL,
      adminPassword: ADMIN_PASSWORD,
      secret: 'a-completely-different-secret',
      ttlHours: 12,
    });

    const forged = other.issue({
      id: 'a1000000-0000-4000-8000-000000000001',
      name: 'Administrator',
      email: ADMIN_EMAIL,
      role: 'admin',
    }).token;

    const built = await build();
    const response = await built.fastify.inject({
      method: 'GET',
      url: '/api/devices',
      headers: { authorization: `Bearer ${forged}` },
    });

    expect(response.statusCode).toBe(401);
    await built.fastify.close();
  });

  it('rejects an expired token', async () => {
    const clock = { now: 1_000_000 };
    const service = new SessionService({
      adminEmail: ADMIN_EMAIL,
      adminPassword: ADMIN_PASSWORD,
      secret: SECRET,
      ttlHours: 1,
      now: () => clock.now,
    });

    const token = service.issue({
      id: 'a1000000-0000-4000-8000-000000000001',
      name: 'Administrator',
      email: ADMIN_EMAIL,
      role: 'admin',
    }).token;

    // Two hours later the one-hour session is over.
    clock.now += 2 * 60 * 60 * 1000;

    const built = await build();
    const response = await built.fastify.inject({
      method: 'GET',
      url: '/api/devices',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(401);
    await built.fastify.close();
  });
});

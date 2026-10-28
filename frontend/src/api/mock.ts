import type { ApiRoute } from './client';
import {
  MOCK_HEALTH_SNAPSHOT,
  MOCK_SESSION,
  MOCK_SYSTEM_INFO,
  MOCK_USAGE_TIMELINE,
  mockFixtures,
  mockUsageSummary,
} from './fixtures';

/**
 * Mock router.
 *
 * Every entry in the `ApiRoutes` registry has a handler here, keyed by
 * `"<METHOD> <path template>"`. The route table and the mock table are
 * checked against each other by a test, so a new endpoint cannot be added
 * without deciding what the frontend does before the backend is live.
 */

export interface MockContext {
  params: Record<string, string>;
  query: Record<string, unknown>;
  body: unknown;
}

export type MockHandler = (context: MockContext) => unknown;

interface Page<T> {
  data: T[];
  meta: { total: number; limit: number; offset: number };
}

function paginate<T>(items: T[], query: Record<string, unknown>): Page<T> {
  const limit = typeof query.limit === 'number' ? query.limit : 50;
  const offset = typeof query.offset === 'number' ? query.offset : 0;
  return {
    data: items.slice(offset, offset + limit),
    meta: { total: items.length, limit, offset },
  };
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

function filterDevices(query: Record<string, unknown>) {
  const status = asString(query.status);
  const isKnown = asString(query.isKnown);
  const search = asString(query.search)?.toLowerCase();

  return mockFixtures.devices().filter((device) => {
    if (status && device.status !== status) return false;
    if (isKnown === 'true' && !device.isKnown) return false;
    if (isKnown === 'false' && device.isKnown) return false;
    if (search) {
      const haystack = [device.hostname, device.ipAddress, device.macAddress]
        .filter((value): value is string => typeof value === 'string')
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });
}

function filterUsage(query: Record<string, unknown>) {
  const deviceId = asString(query.deviceId);
  return mockFixtures.usage().filter((record) => {
    if (deviceId && record.deviceId !== deviceId) return false;
    return true;
  });
}

function filterAlerts(query: Record<string, unknown>) {
  const type = asString(query.type);
  const severity = asString(query.severity);
  const unacknowledged = asString(query.unacknowledged);

  return mockFixtures.alerts().filter((alert) => {
    if (type && alert.type !== type) return false;
    if (severity && alert.severity !== severity) return false;
    if (unacknowledged === 'true' && alert.acknowledgedAt !== null) return false;
    if (unacknowledged === 'false' && alert.acknowledgedAt === null) return false;
    return true;
  });
}

const handlers: Record<string, MockHandler> = {
  'GET /api/system/info': () => MOCK_SYSTEM_INFO,

  'POST /api/auth/login': () => MOCK_SESSION,
  'GET /api/auth/session': () => MOCK_SESSION,

  'GET /api/devices': ({ query }) => paginate(filterDevices(query), query),
  'GET /api/devices/:id': ({ params }) => {
    const device = mockFixtures.devices().find((candidate) => candidate.id === params.id);
    if (!device) throw new Error(`No mock device with id ${params.id}`);
    return { data: device };
  },
  'PATCH /api/devices/:id/known': ({ params, body }) => {
    const devices = mockFixtures.devices();
    const device = devices.find((candidate) => candidate.id === params.id);
    if (!device) throw new Error(`No mock device with id ${params.id}`);
    const isKnown =
      typeof body === 'object' && body !== null && 'isKnown' in body
        ? Boolean((body as { isKnown: unknown }).isKnown)
        : device.isKnown;
    return { data: { ...device, isKnown } };
  },

  'GET /api/usage': ({ query }) => paginate(filterUsage(query), query),
  'GET /api/usage/timeline': ({ query }) => {
    if (query.granularity !== 'day') return MOCK_USAGE_TIMELINE;

    const byDay = new Map<string, { totalBytes: number; uploadBytes: number; downloadBytes: number }>();
    for (const point of MOCK_USAGE_TIMELINE.data) {
      const day = point.bucketStart.slice(0, 10);
      const existing = byDay.get(day) ?? { totalBytes: 0, uploadBytes: 0, downloadBytes: 0 };
      existing.totalBytes += point.totalBytes;
      existing.uploadBytes += point.uploadBytes;
      existing.downloadBytes += point.downloadBytes;
      byDay.set(day, existing);
    }

    const points = [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, totals]) => ({ bucketStart: `${day}T00:00:00.000Z`, ...totals }));

    return {
      data: points,
      meta: {
        granularity: 'day' as const,
        from: MOCK_USAGE_TIMELINE.meta.from,
        to: MOCK_USAGE_TIMELINE.meta.to,
      },
    };
  },
  'GET /api/usage/summary': ({ query }) => {
    const deviceId = asString(query.deviceId);
    if (!deviceId) throw new Error('GET /api/usage/summary requires a deviceId');
    return mockUsageSummary(deviceId);
  },

  'GET /api/health': ({ query }) => {
    const deviceId = asString(query.deviceId);
    const filtered = mockFixtures
      .health()
      .filter((metric) => (deviceId ? metric.deviceId === deviceId : true));
    return paginate(filtered, {
      limit: asNumber(query.limit) ?? 50,
      offset: asNumber(query.offset) ?? 0,
    });
  },
  'GET /api/health/snapshot': () => MOCK_HEALTH_SNAPSHOT,

  'GET /api/alerts': ({ query }) => paginate(filterAlerts(query), query),
  'PATCH /api/alerts/:id/acknowledge': ({ params }) => {
    const alert = mockFixtures.alerts().find((candidate) => candidate.id === params.id);
    if (!alert) throw new Error(`No mock alert with id ${params.id}`);
    return { data: { ...alert, acknowledgedAt: new Date().toISOString() } };
  },
  'GET /api/alerts/rules': () => ({ data: mockFixtures.alertRules() }),
  'PUT /api/alerts/rules': ({ body }) => {
    const rules = mockFixtures.alertRules();
    const type =
      typeof body === 'object' && body !== null && 'type' in body
        ? String((body as { type: unknown }).type)
        : '';
    const existing = rules.find((rule) => rule.type === type);
    if (!existing) throw new Error(`No mock alert rule of type ${type}`);

    const severity =
      typeof body === 'object' && body !== null && 'severity' in body
        ? (body as { severity: unknown }).severity
        : existing.severity;
    const enabled =
      typeof body === 'object' && body !== null && 'enabled' in body
        ? Boolean((body as { enabled: unknown }).enabled)
        : existing.enabled;
    const thresholdBytes =
      typeof body === 'object' && body !== null && 'thresholdBytes' in body
        ? ((body as { thresholdBytes: unknown }).thresholdBytes as number | null)
        : existing.thresholdBytes;

    return {
      data: rules.map((rule) =>
        rule.type === type
          ? { ...rule, severity, enabled, thresholdBytes, updatedAt: new Date().toISOString() }
          : rule,
      ),
    };
  },
};

/** Looks up the mock handler for a route from the `ApiRoutes` registry. */
export function resolveMock(route: ApiRoute, context: MockContext): unknown {
  const key = `${route.method} ${route.path}`;
  const handler = handlers[key];
  if (!handler) {
    throw new Error(`No mock handler registered for "${key}".`);
  }
  return handler(context);
}

/** Every route key the mock router covers — used to test registry coverage. */
export function mockRouteKeys(): string[] {
  return Object.keys(handlers);
}

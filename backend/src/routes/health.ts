import { and, count, desc, eq, gte, lte } from 'drizzle-orm';
import {
  HealthListQuerySchema,
  HealthSnapshotResponseSchema,
  type HealthMetric,
  type HealthSnapshot,
} from '@network-analyser/contracts';
import type { FastifyInstance } from 'fastify';
import type { Database } from '../db/client.js';
import { health } from '../db/schema.js';
import { parseOrThrow } from '../http/validate.js';

export async function registerHealthRoutes(
  app: FastifyInstance,
  db: Database,
): Promise<void> {
  app.get('/api/health', async (request) => {
    const query = parseOrThrow(HealthListQuerySchema, request.query);

    const filters = [];
    if (query.deviceId) filters.push(eq(health.deviceId, query.deviceId));
    if (query.from) filters.push(gte(health.measuredAt, new Date(query.from)));
    if (query.to) filters.push(lte(health.measuredAt, new Date(query.to)));
    const where = filters.length > 0 ? and(...filters) : undefined;

    const [rows, [totals]] = await Promise.all([
      db
        .select()
        .from(health)
        .where(where)
        .orderBy(desc(health.measuredAt))
        .limit(query.limit)
        .offset(query.offset),
      db.select({ value: count() }).from(health).where(where),
    ]);

    return {
      data: rows.map(
        (row): HealthMetric => ({
          id: row.id,
          deviceId: row.deviceId,
          timestamp: row.measuredAt.toISOString(),
          latencyMs: Number(row.latencyMs),
          downloadMbps: Number(row.downloadMbps),
          uploadMbps: Number(row.uploadMbps),
          uptimeSeconds: row.uptimeSeconds,
        }),
      ),
      meta: { total: totals?.value ?? 0, limit: query.limit, offset: query.offset },
    };
  });

  /**
   * Most recent health sample, rolled up into a status band for the
   * dashboard widget.
   */
  app.get('/api/health/snapshot', async () => {
    const rows = await db
      .select()
      .from(health)
      .orderBy(desc(health.measuredAt))
      .limit(1);

    const row = rows[0];
    if (!row) {
      const error = new Error('No health measurements recorded yet');
      Object.assign(error, { statusCode: 404 });
      throw error;
    }

    const latencyMs = Number(row.latencyMs);
    const downloadMbps = Number(row.downloadMbps);

    const status: HealthSnapshot['status'] =
      latencyMs > 150 || downloadMbps < 10 ? 'down' : latencyMs > 50 ? 'degraded' : 'healthy';

    return parseOrThrow(HealthSnapshotResponseSchema, {
      data: {
        timestamp: row.measuredAt.toISOString(),
        latencyMs,
        downloadMbps,
        uploadMbps: Number(row.uploadMbps),
        uptimeSeconds: row.uptimeSeconds,
        status,
      },
    });
  });
}

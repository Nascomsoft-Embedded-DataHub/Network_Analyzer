import { and, count, eq, gte, lte, sql } from 'drizzle-orm';
import {
  UsageListQuerySchema,
  UsageSummaryResponseSchema,
  UsageTimelineQuerySchema,
  type UsageRecord,
  type UsageTimelinePoint,
} from '@network-analyser/contracts';
import type { FastifyInstance } from 'fastify';
import type { Database } from '../db/client.js';
import { usage } from '../db/schema.js';
import { parseOrThrow } from '../http/validate.js';

export async function registerUsageRoutes(
  app: FastifyInstance,
  db: Database,
): Promise<void> {
  app.get('/api/usage', async (request) => {
    const query = parseOrThrow(UsageListQuerySchema, request.query);

    const filters = [];
    if (query.deviceId) filters.push(eq(usage.deviceId, query.deviceId));
    if (query.from) filters.push(gte(usage.bucketStart, new Date(query.from)));
    if (query.to) filters.push(lte(usage.bucketStart, new Date(query.to)));
    const where = filters.length > 0 ? and(...filters) : undefined;

    const [rows, [totals]] = await Promise.all([
      db
        .select()
        .from(usage)
        .where(where)
        .orderBy(usage.bucketStart)
        .limit(query.limit)
        .offset(query.offset),
      db.select({ value: count() }).from(usage).where(where),
    ]);

    return {
      data: rows.map((row): UsageRecord => ({
        id: row.id,
        deviceId: row.deviceId,
        bucketStart: row.bucketStart.toISOString(),
        uploadBytes: row.uploadBytes,
        downloadBytes: row.downloadBytes,
        totalBytes: row.totalBytes,
      })),
      meta: { total: totals?.value ?? 0, limit: query.limit, offset: query.offset },
    };
  });

  /**
   * Network-wide peak-usage timeline. Buckets are summed across devices so
   * the chart shows total link consumption over the requested window.
   */
  app.get('/api/usage/timeline', async (request) => {
    const query = parseOrThrow(UsageTimelineQuerySchema, request.query);

    const filters = [];
    if (query.from) filters.push(gte(usage.bucketStart, new Date(query.from)));
    if (query.to) filters.push(lte(usage.bucketStart, new Date(query.to)));
    const where = filters.length > 0 ? and(...filters) : undefined;

    const rows = await db
      .select({
        bucketStart: sql<string>`to_char(date_trunc(${query.granularity}, ${usage.bucketStart}) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`,
        totalBytes: sql<number>`coalesce(sum(${usage.totalBytes}), 0)::bigint`,
        uploadBytes: sql<number>`coalesce(sum(${usage.uploadBytes}), 0)::bigint`,
        downloadBytes: sql<number>`coalesce(sum(${usage.downloadBytes}), 0)::bigint`,
      })
      .from(usage)
      .where(where)
      .groupBy(sql`1`)
      .orderBy(sql`1`);

    const from = query.from ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const to = query.to ?? new Date().toISOString();

    return {
      data: rows.map(
        (row): UsageTimelinePoint => ({
          bucketStart: row.bucketStart,
          totalBytes: Number(row.totalBytes),
          uploadBytes: Number(row.uploadBytes),
          downloadBytes: Number(row.downloadBytes),
        }),
      ),
      meta: { granularity: query.granularity, from, to },
    };
  });

  app.get('/api/usage/summary', async (request) => {
    const query = request.query as { deviceId?: string; from?: string; to?: string };
    if (!query.deviceId) {
      const error = new Error('deviceId is required');
      Object.assign(error, { statusCode: 400 });
      throw error;
    }

    const filters = [eq(usage.deviceId, query.deviceId)];
    if (query.from) filters.push(gte(usage.bucketStart, new Date(query.from)));
    if (query.to) filters.push(lte(usage.bucketStart, new Date(query.to)));

    const [row] = await db
      .select({
        uploadBytes: sql<number>`coalesce(sum(${usage.uploadBytes}), 0)::bigint`,
        downloadBytes: sql<number>`coalesce(sum(${usage.downloadBytes}), 0)::bigint`,
        totalBytes: sql<number>`coalesce(sum(${usage.totalBytes}), 0)::bigint`,
      })
      .from(usage)
      .where(and(...filters));

    return parseOrThrow(UsageSummaryResponseSchema, {
      data: {
        deviceId: query.deviceId,
        from: query.from ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        to: query.to ?? new Date().toISOString(),
        uploadBytes: Number(row?.uploadBytes ?? 0),
        downloadBytes: Number(row?.downloadBytes ?? 0),
        totalBytes: Number(row?.totalBytes ?? 0),
      },
    });
  });
}

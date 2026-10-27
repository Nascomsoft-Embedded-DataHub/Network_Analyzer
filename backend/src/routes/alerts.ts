import { and, count, desc, eq, isNull } from 'drizzle-orm';
import {
  AcknowledgeAlertSchema,
  AlertListQuerySchema,
  AlertResponseSchema,
  type Alert,
} from '@network-analyser/contracts';
import type { FastifyInstance } from 'fastify';
import type { Database } from '../db/client.js';
import { alerts } from '../db/schema.js';
import { parseOrThrow } from '../http/validate.js';

export async function registerAlertRoutes(
  app: FastifyInstance,
  db: Database,
): Promise<void> {
  app.get('/api/alerts', async (request) => {
    const query = parseOrThrow(AlertListQuerySchema, request.query);

    const filters = [];
    if (query.type) filters.push(eq(alerts.type, query.type));
    if (query.severity) filters.push(eq(alerts.severity, query.severity));
    if (query.unacknowledged === true) filters.push(isNull(alerts.acknowledgedAt));
    const where = filters.length > 0 ? and(...filters) : undefined;

    const [rows, [totals]] = await Promise.all([
      db
        .select()
        .from(alerts)
        .where(where)
        .orderBy(desc(alerts.triggeredAt))
        .limit(query.limit)
        .offset(query.offset),
      db.select({ value: count() }).from(alerts).where(where),
    ]);

    return {
      data: rows.map(
        (row): Alert => ({
          id: row.id,
          type: row.type,
          severity: row.severity,
          message: row.message,
          deviceId: row.deviceId,
          thresholdBytes: row.thresholdBytes,
          observedBytes: row.observedBytes,
          triggeredAt: row.triggeredAt.toISOString(),
          acknowledgedAt: row.acknowledgedAt?.toISOString() ?? null,
        }),
      ),
      meta: { total: totals?.value ?? 0, limit: query.limit, offset: query.offset },
    };
  });

  app.patch('/api/alerts/:id/acknowledge', async (request) => {
    const { id } = request.params as { id: string };
    parseOrThrow(AcknowledgeAlertSchema, request.body);

    const [updated] = await db
      .update(alerts)
      .set({ acknowledgedAt: new Date() })
      .where(eq(alerts.id, id))
      .returning();

    if (!updated) {
      const error = new Error('Alert not found');
      Object.assign(error, { statusCode: 404 });
      throw error;
    }

    return parseOrThrow(AlertResponseSchema, {
      data: {
        id: updated.id,
        type: updated.type,
        severity: updated.severity,
        message: updated.message,
        deviceId: updated.deviceId,
        thresholdBytes: updated.thresholdBytes,
        observedBytes: updated.observedBytes,
        triggeredAt: updated.triggeredAt.toISOString(),
        acknowledgedAt: updated.acknowledgedAt?.toISOString() ?? null,
      },
    });
  });
}

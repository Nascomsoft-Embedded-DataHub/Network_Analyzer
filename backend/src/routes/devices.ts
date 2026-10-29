import { and, asc, count, eq, ilike, or, type SQL } from 'drizzle-orm';
import {
  DeviceListQuerySchema,
  DeviceResponseSchema,
  MarkDeviceKnownSchema,
  type Device,
} from '@network-analyser/contracts';
import type { FastifyInstance } from 'fastify';
import type { Database } from '../db/client.js';
import { devices } from '../db/schema.js';
import { parseOrThrow } from '../http/validate.js';

/** Maps a database row to the shared `Device` contract shape. */
export function toDeviceContract(row: typeof devices.$inferSelect): Device {
  return {
    id: row.id,
    identityKey: row.identityKey,
    ipAddress: row.ipAddress,
    macAddress: row.macAddress,
    hostname: row.hostname,
    vendor: row.vendor,
    isKnown: row.isKnown,
    status: row.status,
    firstSeenAt: row.firstSeenAt.toISOString(),
    lastSeenAt: row.lastSeenAt.toISOString(),
  };
}

export async function registerDeviceRoutes(
  app: FastifyInstance,
  db: Database,
): Promise<void> {
  app.get('/api/devices', async (request) => {
    const query = parseOrThrow(DeviceListQuerySchema, request.query);

    const filters: SQL[] = [];
    if (query.status) {
      filters.push(eq(devices.status, query.status));
    }
    if (query.isKnown !== undefined) {
      filters.push(eq(devices.isKnown, query.isKnown));
    }
    if (query.search) {
      const term = `%${query.search}%`;
      const searchClause = or(
        ilike(devices.hostname, term),
        ilike(devices.ipAddress, term),
        ilike(devices.macAddress, term),
      );
      if (searchClause) filters.push(searchClause);
    }

    const where = filters.length > 0 ? and(...filters) : undefined;

    const [rows, [totals]] = await Promise.all([
      db
        .select()
        .from(devices)
        .where(where)
        .orderBy(asc(devices.lastSeenAt))
        .limit(query.limit)
        .offset(query.offset),
      db.select({ value: count() }).from(devices).where(where),
    ]);

    return {
      data: rows.map(toDeviceContract),
      meta: { total: totals?.value ?? 0, limit: query.limit, offset: query.offset },
    };
  });

  app.get('/api/devices/:id', async (request) => {
    const { id } = request.params as { id: string };
    const rows = await db.select().from(devices).where(eq(devices.id, id)).limit(1);
    const row = rows[0];
    if (!row) {
      const error = new Error('Device not found');
      Object.assign(error, { statusCode: 404 });
      throw error;
    }
    return { data: toDeviceContract(row) };
  });

  app.patch('/api/devices/:id/known', async (request) => {
    const { id } = request.params as { id: string };
    const body = parseOrThrow(MarkDeviceKnownSchema, request.body);

    const existing = await db.select().from(devices).where(eq(devices.id, id)).limit(1);
    if (!existing[0]) {
      const error = new Error('Device not found');
      Object.assign(error, { statusCode: 404 });
      throw error;
    }

    const [updated] = await db
      .update(devices)
      .set({ isKnown: body.isKnown })
      .where(eq(devices.id, id))
      .returning();

    return parseOrThrow(DeviceResponseSchema, { data: toDeviceContract(updated!) });
  });
}

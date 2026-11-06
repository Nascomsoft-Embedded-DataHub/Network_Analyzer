import { and, eq, gte, lte, sql } from 'drizzle-orm';

import type { ReportPeriod } from '@network-analyser/contracts';
import type { Database } from '../db/client.js';
import { devices, usage } from '../db/schema.js';

/**
 * Consumption reports.
 *
 * The dashboard reads the network live, which is the right thing for a chart
 * and the wrong thing for a manager who wants to know what last Tuesday
 * cost. A report is the same measurement as the dashboard — hourly byte
 * counters, summed — read over a window and written down.
 *
 * Two rules shape it:
 *
 * - **The buckets are UTC.** `date_trunc` is given the timestamp in UTC
 *   explicitly rather than in the database's session time zone, so the days in
 *   a report are the same days on every server that produces one. A report
 *   that changed meaning with the server's time zone setting could not be
 *   compared with the dashboard beside it.
 * - **Nothing finer than the hour is read.** The report reads the same
 *   hourly rollups the dashboard reads, so a report can never reveal more
 *   than the dashboard already shows.
 */
const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

/** The window and granularity a report covers. */
export interface UsageReportQuery {
  period: ReportPeriod;
  /** Start of the window, inclusive. */
  from: Date;
  /** End of the window, inclusive. */
  to: Date;
  /** Restrict the report to one device. */
  deviceId?: string;
}

/**
 * One line of a report.
 *
 * `scope` distinguishes the network's own total from the devices that make
 * it up, so a spreadsheet can pivot on it instead of having to guess which
 * rows are which.
 */
export interface UsageReportRow {
  scope: 'network' | 'device';
  /** Start of the period the row covers, in UTC. */
  periodStart: string;
  /** End of the period, in UTC, exclusive. */
  periodEnd: string;
  /** Hostname of the device, when the row is about a device. */
  device: string | null;
  /** Address of the device, when the row is about a device. */
  ipAddress: string | null;
  uploadBytes: number;
  downloadBytes: number;
  totalBytes: number;
}

/** A whole report, ready to be written out. */
export interface UsageReport {
  period: ReportPeriod;
  /** Start of the window the report covers. */
  from: string;
  /** End of the window the report covers. */
  to: string;
  /** When the report was produced. */
  generatedAt: string;
  rows: UsageReportRow[];
}

/**
 * Builds a consumption report from the hourly usage rollups.
 */
export async function buildUsageReport(
  db: Database,
  query: UsageReportQuery,
  options: { now?: () => Date } = {},
): Promise<UsageReport> {
  const now = options.now ?? (() => new Date());
  const granularity = query.period === 'weekly' ? 'week' : 'day';
  const periodMs = query.period === 'weekly' ? WEEK_MS : DAY_MS;

  const bucket = sql<string>`to_char(date_trunc(${granularity}::text, ${usage.bucketStart} AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

  const filters = [gte(usage.bucketStart, query.from), lte(usage.bucketStart, query.to)];
  if (query.deviceId) filters.push(eq(usage.deviceId, query.deviceId));

  const rows = await db
    .select({
      periodStart: bucket,
      deviceId: usage.deviceId,
      hostname: devices.hostname,
      ipAddress: devices.ipAddress,
      uploadBytes: sql<string>`coalesce(sum(${usage.uploadBytes}), 0)::bigint`,
      downloadBytes: sql<string>`coalesce(sum(${usage.downloadBytes}), 0)::bigint`,
      totalBytes: sql<string>`coalesce(sum(${usage.totalBytes}), 0)::bigint`,
    })
    .from(usage)
    .leftJoin(devices, eq(usage.deviceId, devices.id))
    .where(and(...filters))
    // Grouped by the position of each column in the list above rather than
    // by repeating the expressions: the bucket is a parameterised expression,
    // and repeating it would ask PostgreSQL to group by two spellings of the
    // same thing.
    .groupBy(sql`1`, sql`2`, sql`3`, sql`4`);

  const deviceRows: UsageReportRow[] = [];
  const totals = new Map<string, { uploadBytes: number; downloadBytes: number; totalBytes: number }>();

  for (const row of rows) {
    const uploadBytes = Number(row.uploadBytes);
    const downloadBytes = Number(row.downloadBytes);
    const totalBytes = Number(row.totalBytes);

    deviceRows.push({
      scope: 'device',
      periodStart: row.periodStart,
      periodEnd: periodEnd(row.periodStart, periodMs),
      device: row.hostname,
      ipAddress: row.ipAddress,
      uploadBytes,
      downloadBytes,
      totalBytes,
    });

    const running = totals.get(row.periodStart) ?? {
      uploadBytes: 0,
      downloadBytes: 0,
      totalBytes: 0,
    };
    running.uploadBytes += uploadBytes;
    running.downloadBytes += downloadBytes;
    running.totalBytes += totalBytes;
    totals.set(row.periodStart, running);
  }

  // Each period opens with the network's own line, then the devices in order
  // of what they used. A reader who wants the biggest offender finds it
  // without sorting anything.
  const ordered: UsageReportRow[] = [];
  const periods = [...new Set([...deviceRows.map((row) => row.periodStart)])].sort();

  for (const periodStart of periods) {
    const total = totals.get(periodStart);
    if (total) {
      ordered.push({
        scope: 'network',
        periodStart,
        periodEnd: periodEnd(periodStart, periodMs),
        device: null,
        ipAddress: null,
        ...total,
      });
    }

    const devicesInPeriod = deviceRows
      .filter((row) => row.periodStart === periodStart)
      .sort(
        (a, b) =>
          b.totalBytes - a.totalBytes ||
          (a.device ?? '').localeCompare(b.device ?? '') ||
          (a.ipAddress ?? '').localeCompare(b.ipAddress ?? ''),
      );
    ordered.push(...devicesInPeriod);
  }

  return {
    period: query.period,
    from: query.from.toISOString(),
    to: query.to.toISOString(),
    generatedAt: now().toISOString(),
    rows: ordered,
  };
}

/** The end of a period, given its start and how long it lasts. */
function periodEnd(periodStart: string, periodMs: number): string {
  return new Date(new Date(periodStart).getTime() + periodMs).toISOString();
}

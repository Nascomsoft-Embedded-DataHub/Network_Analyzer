import { z } from 'zod';
import { IdSchema, TimestampSchema } from './common.js';

/**
 * Granularity of a consumption report.
 *
 * `daily` buckets by UTC calendar day; `weekly` buckets by ISO week, which
 * starts on Monday. Both are UTC so that a report says the same thing on
 * every machine that asks for it.
 */
export const ReportPeriodSchema = z.enum(['daily', 'weekly']);

/**
 * Query parameters accepted by `GET /api/reports/consumption`.
 *
 * The endpoint answers with a CSV file rather than a JSON envelope, so it has
 * no response schema and no entry in the `ApiRoutes` registry — a registry
 * entry would oblige the dashboard to mock a file download. The query shape
 * is shared all the same, so both sides agree on the window and the
 * granularity.
 */
export const ReportQuerySchema = z.object({
  /** `daily` or `weekly`. Defaults to `daily`. */
  period: ReportPeriodSchema.default('daily'),
  /** Start of the window, inclusive. Defaults to the start of the retention window. */
  from: TimestampSchema.optional(),
  /** End of the window, inclusive. Defaults to now. */
  to: TimestampSchema.optional(),
  /** Restrict the report to a single device. */
  deviceId: IdSchema.optional(),
});

export type ReportPeriod = z.infer<typeof ReportPeriodSchema>;
export type ReportQuery = z.infer<typeof ReportQuerySchema>;
export type ReportQueryInput = z.input<typeof ReportQuerySchema>;

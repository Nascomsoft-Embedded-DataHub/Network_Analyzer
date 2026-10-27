import { z } from 'zod';
import { IdSchema, TimestampSchema } from './common.js';

/**
 * Per-device bandwidth consumption over a time bucket.
 *
 * PRIVACY: Byte counts only. No traffic content, no protocol payload, no
 * destination URLs. Granular flow data is dropped after 24 hours per the
 * privacy directives; only the hourly rollups below are retained for 7 days.
 */
export const UsageRecordSchema = z.object({
  id: IdSchema,
  deviceId: IdSchema,
  /** Start of the aggregation bucket. */
  bucketStart: TimestampSchema,
  /** Bytes uploaded during the bucket. */
  uploadBytes: z.number().int().nonnegative(),
  /** Bytes downloaded during the bucket. */
  downloadBytes: z.number().int().nonnegative(),
  /** Total bytes = uploadBytes + downloadBytes. */
  totalBytes: z.number().int().nonnegative(),
});

/** A single point on the network-wide peak-usage timeline. */
export const UsageTimelinePointSchema = z.object({
  bucketStart: TimestampSchema,
  totalBytes: z.number().int().nonnegative(),
  uploadBytes: z.number().int().nonnegative(),
  downloadBytes: z.number().int().nonnegative(),
});

/** Aggregate totals for a device over the requested window. */
export const UsageSummarySchema = z.object({
  deviceId: IdSchema,
  from: TimestampSchema,
  to: TimestampSchema,
  uploadBytes: z.number().int().nonnegative(),
  downloadBytes: z.number().int().nonnegative(),
  totalBytes: z.number().int().nonnegative(),
});

export const UsageListResponseSchema = z.object({
  data: z.array(UsageRecordSchema),
  meta: z.object({
    total: z.number().int().nonnegative(),
    limit: z.number().int().positive(),
    offset: z.number().int().nonnegative(),
  }),
});

export const UsageTimelineResponseSchema = z.object({
  data: z.array(UsageTimelinePointSchema),
  meta: z.object({
    /** Aggregation granularity of each point. */
    granularity: z.enum(['hour', 'day']),
    from: TimestampSchema,
    to: TimestampSchema,
  }),
});

export const UsageSummaryResponseSchema = z.object({
  data: UsageSummarySchema,
});

/** Query parameters accepted by `GET /api/usage`. */
export const UsageListQuerySchema = z.object({
  deviceId: IdSchema.optional(),
  from: TimestampSchema.optional(),
  to: TimestampSchema.optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(500),
  offset: z.coerce.number().int().min(0).default(0),
});

/** Query parameters accepted by `GET /api/usage/timeline`. */
export const UsageTimelineQuerySchema = z.object({
  from: TimestampSchema.optional(),
  to: TimestampSchema.optional(),
  granularity: z.enum(['hour', 'day']).default('hour'),
});

export type UsageRecord = z.infer<typeof UsageRecordSchema>;
export type UsageTimelinePoint = z.infer<typeof UsageTimelinePointSchema>;
export type UsageSummary = z.infer<typeof UsageSummarySchema>;
export type UsageListResponse = z.infer<typeof UsageListResponseSchema>;
export type UsageTimelineResponse = z.infer<typeof UsageTimelineResponseSchema>;
export type UsageSummaryResponse = z.infer<typeof UsageSummaryResponseSchema>;
export type UsageListQuery = z.infer<typeof UsageListQuerySchema>;
export type UsageTimelineQuery = z.infer<typeof UsageTimelineQuerySchema>;

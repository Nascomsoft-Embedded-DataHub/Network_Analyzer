import { z } from 'zod';
import { IdSchema, TimestampSchema } from './common.js';

/**
 * Alert types produced by the background trigger engine.
 *
 * `unknown_device` fires when a device appears that was not previously known.
 * `high_usage` fires when a device crosses the configured consumption threshold.
 */
export const AlertTypeSchema = z.enum(['unknown_device', 'high_usage']);

/** Severity levels an administrator can filter on. */
export const AlertSeveritySchema = z.enum(['info', 'warning', 'critical']);

/**
 * A single alert raised against the monitored network.
 *
 * PRIVACY: Alert messages reference devices by id and hostname only.
 */
export const AlertSchema = z.object({
  id: IdSchema,
  type: AlertTypeSchema,
  severity: AlertSeveritySchema,
  /** Short human-readable summary, e.g. `New device detected on the network`. */
  message: z.string().min(1),
  /** Device the alert refers to, when applicable. */
  deviceId: IdSchema.nullable(),
  /** Threshold that was breached, for `high_usage` alerts. */
  thresholdBytes: z.number().int().nonnegative().nullable(),
  /** Observed value that breached the threshold, for `high_usage` alerts. */
  observedBytes: z.number().int().nonnegative().nullable(),
  triggeredAt: TimestampSchema,
  /** Set once an administrator acknowledges the alert. */
  acknowledgedAt: TimestampSchema.nullable(),
});

/** Configurable rule that drives alert generation. */
export const AlertRuleSchema = z.object({
  id: IdSchema,
  type: AlertTypeSchema,
  enabled: z.boolean(),
  /** Byte threshold per day for `high_usage` rules. Ignored otherwise. */
  thresholdBytes: z.number().int().nonnegative().nullable(),
  /** Severity assigned when the rule fires. */
  severity: AlertSeveritySchema,
  updatedAt: TimestampSchema,
});

export const AlertListResponseSchema = z.object({
  data: z.array(AlertSchema),
  meta: z.object({
    total: z.number().int().nonnegative(),
    limit: z.number().int().positive(),
    offset: z.number().int().nonnegative(),
  }),
});

export const AlertRuleListResponseSchema = z.object({
  data: z.array(AlertRuleSchema),
});

export const AlertResponseSchema = z.object({
  data: AlertSchema,
});

/** Body for creating or updating an alert rule. */
export const AlertRuleUpsertSchema = z.object({
  type: AlertTypeSchema,
  enabled: z.boolean(),
  thresholdBytes: z.number().int().nonnegative().nullable().optional(),
  severity: AlertSeveritySchema,
});

/** Body for acknowledging an alert. */
export const AcknowledgeAlertSchema = z.object({
  acknowledged: z.literal(true),
});

export const AlertListQuerySchema = z.object({
  type: AlertTypeSchema.optional(),
  severity: AlertSeveritySchema.optional(),
  /** Filter to only unacknowledged alerts. */
  unacknowledged: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === 'true')),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type AlertType = z.infer<typeof AlertTypeSchema>;
export type AlertSeverity = z.infer<typeof AlertSeveritySchema>;
export type Alert = z.infer<typeof AlertSchema>;
export type AlertRule = z.infer<typeof AlertRuleSchema>;
export type AlertListResponse = z.infer<typeof AlertListResponseSchema>;
export type AlertRuleListResponse = z.infer<typeof AlertRuleListResponseSchema>;
export type AlertResponse = z.infer<typeof AlertResponseSchema>;
export type AlertListQuery = z.infer<typeof AlertListQuerySchema>;

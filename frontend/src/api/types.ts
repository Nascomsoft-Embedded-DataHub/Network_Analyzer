import type { z } from 'zod';
import {
  AlertListQuerySchema,
  DeviceListQuerySchema,
  HealthListQuerySchema,
  UsageListQuerySchema,
  UsageTimelineQuerySchema,
} from '@network-analyser/contracts';

/**
 * Query input types.
 *
 * `z.input` rather than `z.infer` because the contract schemas apply
 * defaults and transforms: the wire format carries `limit=50` as a query
 * string, and `isKnown` travels as the literal `'true'`/`'false'`.
 */
export type DeviceListQuery = z.input<typeof DeviceListQuerySchema>;
export type UsageListQuery = z.input<typeof UsageListQuerySchema>;
export type UsageTimelineQuery = z.input<typeof UsageTimelineQuerySchema>;
export type HealthListQuery = z.input<typeof HealthListQuerySchema>;
export type AlertListQuery = z.input<typeof AlertListQuerySchema>;

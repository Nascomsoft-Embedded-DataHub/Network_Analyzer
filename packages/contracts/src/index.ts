/**
 * Network Analyser shared API contracts.
 *
 * This package is the single source of truth for the JSON structure exchanged
 * between the backend and the dashboard frontend. Both tracks import from
 * here so a schema change lands on both sides in the same commit.
 */

export * from './common.js';
export * from './device.js';
export * from './usage.js';
export * from './health.js';
export * from './alert.js';
export * from './auth.js';
export * from './mock.js';

import { z } from 'zod';
import {
  DeviceListQuerySchema,
  DeviceListResponseSchema,
  DeviceResponseSchema,
  MarkDeviceKnownSchema,
} from './device.js';
import {
  UsageListQuerySchema,
  UsageListResponseSchema,
  UsageSummaryResponseSchema,
  UsageTimelineQuerySchema,
  UsageTimelineResponseSchema,
} from './usage.js';
import {
  HealthListQuerySchema,
  HealthListResponseSchema,
  HealthSnapshotResponseSchema,
} from './health.js';
import {
  AcknowledgeAlertSchema,
  AlertListQuerySchema,
  AlertListResponseSchema,
  AlertResponseSchema,
  AlertRuleListResponseSchema,
  AlertRuleUpsertSchema,
} from './alert.js';
import { LoginSchema, SessionResponseSchema } from './auth.js';
import { ErrorResponseSchema, IdSchema } from './common.js';

/**
 * Machine-readable map of every endpoint in the MVP.
 *
 * Consumed by the backend to validate requests and responses, and by the
 * frontend to type its API client. Adding an endpoint here makes it visible
 * to both tracks automatically.
 */
export const ApiRoutes = {
  auth: {
    login: {
      method: 'POST',
      path: '/api/auth/login',
      body: LoginSchema,
      response: SessionResponseSchema,
    },
    session: {
      method: 'GET',
      path: '/api/auth/session',
      response: SessionResponseSchema,
    },
  },
  devices: {
    list: {
      method: 'GET',
      path: '/api/devices',
      query: DeviceListQuerySchema,
      response: DeviceListResponseSchema,
    },
    get: {
      method: 'GET',
      path: '/api/devices/:id',
      response: DeviceResponseSchema,
    },
    markKnown: {
      method: 'PATCH',
      path: '/api/devices/:id/known',
      body: MarkDeviceKnownSchema,
      response: DeviceResponseSchema,
    },
  },
  usage: {
    list: {
      method: 'GET',
      path: '/api/usage',
      query: UsageListQuerySchema,
      response: UsageListResponseSchema,
    },
    timeline: {
      method: 'GET',
      path: '/api/usage/timeline',
      query: UsageTimelineQuerySchema,
      response: UsageTimelineResponseSchema,
    },
    summary: {
      method: 'GET',
      path: '/api/usage/summary',
      query: z.object({ deviceId: z.uuid(), from: z.iso.datetime({ offset: true }).optional(), to: z.iso.datetime({ offset: true }).optional() }),
      response: UsageSummaryResponseSchema,
    },
  },
  health: {
    list: {
      method: 'GET',
      path: '/api/health',
      query: HealthListQuerySchema,
      response: HealthListResponseSchema,
    },
    snapshot: {
      method: 'GET',
      path: '/api/health/snapshot',
      response: HealthSnapshotResponseSchema,
    },
  },
  alerts: {
    list: {
      method: 'GET',
      path: '/api/alerts',
      query: AlertListQuerySchema,
      response: AlertListResponseSchema,
    },
    acknowledge: {
      method: 'PATCH',
      path: '/api/alerts/:id/acknowledge',
      body: AcknowledgeAlertSchema,
      response: AlertResponseSchema,
    },
    rules: {
      method: 'GET',
      path: '/api/alerts/rules',
      response: AlertRuleListResponseSchema,
    },
    upsertRule: {
      method: 'PUT',
      path: '/api/alerts/rules',
      body: AlertRuleUpsertSchema,
      response: AlertRuleListResponseSchema,
    },
  },
} as const;

export type ApiRoutes = typeof ApiRoutes;

/** Every response body in the API is either a success shape or this error. */
export const ErrorResponse = ErrorResponseSchema;

/** Path parameter helper — keeps `:id` route definitions and their types in sync. */
export const IdParamSchema = z.object({ id: IdSchema });
export type IdParam = z.infer<typeof IdParamSchema>;

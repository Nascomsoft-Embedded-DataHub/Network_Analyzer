import { z } from 'zod';
import { TimestampSchema } from './common.js';

/**
 * Identity and reachability of the analyser instance.
 *
 * The analyser runs on the administrator's own machine, and the dashboard may
 * be open on a different device — a laptop and an Android phone both act as
 * admin clients. This endpoint lets the dashboard state plainly which machine
 * it is talking to, and confirm the connection is live.
 */
export const SystemInfoSchema = z.object({
  /** Version of the running analyser build. */
  version: z.string().min(1),
  /** When the process started. */
  startedAt: TimestampSchema,
  /** Seconds since the process started. */
  uptimeSeconds: z.number().int().nonnegative(),
  /** Interface the API is bound to. */
  bindHost: z.string().min(1),
  /** Port the API is bound to. */
  bindPort: z.number().int().min(1).max(65535),
  /** Hostname of the machine running the analyser. */
  hostname: z.string().min(1),
  /** Runtime and platform, shown in the dashboard's diagnostics panel. */
  runtime: z.object({
    nodeVersion: z.string().min(1),
    platform: z.string().min(1),
  }),
  /**
   * Whether the API is reachable only from the machine it runs on. False
   * means other devices on the network can reach it.
   */
  loopbackOnly: z.boolean(),
});

export const SystemInfoResponseSchema = z.object({
  data: SystemInfoSchema,
});

export type SystemInfo = z.infer<typeof SystemInfoSchema>;
export type SystemInfoResponse = z.infer<typeof SystemInfoResponseSchema>;

import { z } from 'zod';
import { IdSchema, Ipv4AddressSchema, MacAddressSchema, TimestampSchema } from './common.js';

/**
 * A device observed on the monitored network.
 *
 * PRIVACY: `hostname` and `vendor` are network *metadata* discovered from
 * DHCP/ARP announcements. No user, account, or browsing identity is captured.
 */
export const DeviceSchema = z.object({
  id: IdSchema,
  ipAddress: Ipv4AddressSchema,
  macAddress: MacAddressSchema,
  /** Human-friendly name from the discovery algorithm, e.g. `living-room-tv`. */
  hostname: z.string().min(1).max(255).nullable(),
  /** OUI-derived hardware vendor, e.g. `Apple, Inc.`. Null when unknown. */
  vendor: z.string().min(1).max(255).nullable(),
  /**
   * False when the device was not present in the known-device list at the
   * time of discovery. Drives the unknown-device alert trigger.
   */
  isKnown: z.boolean(),
  status: z.enum(['online', 'offline', 'unknown']),
  firstSeenAt: TimestampSchema,
  lastSeenAt: TimestampSchema,
});

/** Request body for registering a device as known (suppressing alerts for it). */
export const MarkDeviceKnownSchema = z.object({
  isKnown: z.boolean(),
});

export const DeviceListResponseSchema = z.object({
  data: z.array(DeviceSchema),
  meta: z.object({
    total: z.number().int().nonnegative(),
    limit: z.number().int().positive(),
    offset: z.number().int().nonnegative(),
  }),
});

export const DeviceResponseSchema = z.object({
  data: DeviceSchema,
});

/** Query parameters accepted by `GET /api/devices`. */
export const DeviceListQuerySchema = z.object({
  status: z.enum(['online', 'offline', 'unknown']).optional(),
  isKnown: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === 'true')),
  search: z.string().min(1).max(255).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type Device = z.infer<typeof DeviceSchema>;
export type DeviceStatus = z.infer<typeof DeviceSchema>['status'];
export type DeviceListQuery = z.infer<typeof DeviceListQuerySchema>;
export type DeviceListResponse = z.infer<typeof DeviceListResponseSchema>;
export type DeviceResponse = z.infer<typeof DeviceResponseSchema>;

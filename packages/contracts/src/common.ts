import { z } from 'zod';

/**
 * Shared primitives for every Network Analyser contract.
 *
 * PRIVACY CONTRACT: No schema in this package may contain a field that carries
 * payload contents (message bodies, URLs, file contents, DNS query names).
 * Telemetry is limited to headers and metadata. If a field is added here, it
 * must be justifiable as network *metadata*.
 */

/** ISO-8601 timestamp with timezone offset, e.g. `2026-10-27T09:15:00.000Z`. */
export const TimestampSchema = z.iso.datetime({ offset: true });

/** UUID v4 identifier. */
export const IdSchema = z.uuid();

/**
 * Normalised MAC address: uppercase hex, colon-delimited.
 * @example `AA:BB:CC:DD:EE:FF`
 */
export const MacAddressSchema = z
  .string()
  .regex(/^([0-9A-F]{2}:){5}[0-9A-F]{2}$/, 'Expected uppercase colon-delimited MAC address');

/**
 * IPv4 address in dotted-quad notation.
 * @example `192.168.1.42`
 */
export const Ipv4AddressSchema = z
  .string()
  .regex(
    /^((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/,
    'Expected a valid IPv4 address',
  );

/** Standard paginated list envelope. */
export function listSchema<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    data: z.array(item),
    meta: z.object({
      total: z.number().int().nonnegative(),
      limit: z.number().int().positive(),
      offset: z.number().int().nonnegative(),
    }),
  });
}

/** Standard error envelope returned by every endpoint on failure. */
export const ErrorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
});

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

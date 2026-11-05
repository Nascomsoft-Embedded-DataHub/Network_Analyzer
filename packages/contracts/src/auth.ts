import { z } from 'zod';
import { IdSchema, TimestampSchema } from './common.js';

/**
 * Authentication context for the pilot.
 *
 * A single administrator, and optionally a read-only viewer, are configured
 * on the analyser itself rather than stored in a user table: the analyser
 * runs on the administrator's own machine and has one user to keep track of.
 *
 * The role is what the dashboard gates on. A viewer may read everything and
 * change nothing; an administrator may also mark devices as known and
 * acknowledge alerts.
 */
export const UserRoleSchema = z.enum(['admin', 'viewer']);

export const UserSchema = z.object({
  id: IdSchema,
  name: z.string().min(1),
  email: z.email(),
  role: UserRoleSchema,
});

export const SessionResponseSchema = z.object({
  data: z.object({
    user: UserSchema,
    /**
     * The bearer token that authenticates every later call.
     *
     * It travels in the response body rather than in a cookie, because the
     * dashboard also runs on a phone that reaches the analyser across the
     * local network, where a cross-site cookie would need the insecure
     * attributes that a network credential should not have.
     */
    token: z.string().min(1),
    /** Expiry of the current session. */
    expiresAt: TimestampSchema,
  }),
});

/** Body for exchanging credentials for a session. */
export const LoginSchema = z.object({
  email: z.email(),
  password: z.string().min(8),
});

export type UserRole = z.infer<typeof UserRoleSchema>;
export type User = z.infer<typeof UserSchema>;
export type SessionResponse = z.infer<typeof SessionResponseSchema>;
export type Login = z.infer<typeof LoginSchema>;

import { z } from 'zod';
import { IdSchema, TimestampSchema } from './common.js';

/**
 * Authentication context for the pilot.
 *
 * Day 1 ships a single hard-coded admin identity so the frontend can be built
 * against a real session shape. Credential storage and token issuance land
 * with the auth work in a later sprint phase.
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

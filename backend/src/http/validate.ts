import type { z } from 'zod';

/**
 * Validates a value against a schema and returns a typed result.
 *
 * Endpoint handlers call this instead of parsing inline so that every
 * request and response body is checked against the shared contract in
 * `packages/contracts`. A contract change on the backend therefore fails
 * here rather than silently drifting from the frontend's expectations.
 */
export function parseOrThrow<T extends z.ZodTypeAny>(
  schema: T,
  value: unknown,
): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    const error = new Error('Request validation failed');
    Object.assign(error, {
      statusCode: 400,
      validation: result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
    throw error;
  }
  return result.data;
}

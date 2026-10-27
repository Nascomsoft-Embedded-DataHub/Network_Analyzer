import type { FastifyInstance } from 'fastify';

/**
 * Error payload returned to clients.
 *
 * Mirrors `ErrorResponseSchema` from the shared contracts so the frontend
 * can type the failure path alongside the success path.
 */
export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

/** Shape attached by `parseOrThrow` when a request fails contract validation. */
interface ValidationError extends Error {
  statusCode: number;
  validation: Array<{ path: string; message: string }>;
}

function isValidationError(error: unknown): error is ValidationError {
  return (
    error instanceof Error &&
    'validation' in error &&
    Array.isArray((error as ValidationError).validation)
  );
}

interface NotFoundError extends Error {
  statusCode: number;
}

function isNotFoundError(error: unknown): error is NotFoundError {
  return error instanceof Error && (error as NotFoundError).statusCode === 404;
}

/** Attaches a consistent error envelope to every response. */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: unknown, _request, reply) => {
    if (isValidationError(error)) {
      const payload: ApiError = {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: { issues: error.validation },
        },
      };
      return reply.status(400).send(payload);
    }

    if (isNotFoundError(error)) {
      const payload: ApiError = {
        error: { code: 'NOT_FOUND', message: 'Resource not found' },
      };
      return reply.status(404).send(payload);
    }

    app.log.error(error);
    const payload: ApiError = {
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
    };
    return reply.status(500).send(payload);
  });
}

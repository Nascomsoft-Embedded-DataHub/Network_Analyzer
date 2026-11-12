import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AuthenticatedUser, SessionService } from './session.js';

declare module 'fastify' {
  interface FastifyContextConfig {
    /**
     * Marks a route as reachable without a session.
     *
     * Only the sign-in endpoint, the liveness probe and the analyser's
     * identity endpoint are public. Everything else needs a token, so a new
     * endpoint is protected by default rather than by remembering to protect
     * it.
     */
    public?: boolean;
  }

  interface FastifyRequest {
    /**
     * The identity behind this request, once the guard has checked it.
     *
     * `null` on a request that has not been through the guard, and on one
     * the guard refused. The guard is the only thing that sets it.
     */
    auth: AuthenticatedUser | null;
  }
}

/**
 * The session guard.
 *
 * Every route that is not deliberately public sits behind this, so a new
 * endpoint is protected the day it is written rather than the day someone
 * remembers to protect it.
 *
 * The guard runs on `onRequest`, before any handler runs and before the
 * request body is parsed. That is deliberate: an unauthenticated caller
 * cannot make the analyser do any work at all, not even validate a body.
 */

/**
 * Builds the `onRequest` hook that authenticates a request.
 *
 * A request without a valid bearer token is refused with 401 and the
 * standard error envelope, so the dashboard's client sees the same shape it
 * sees everywhere else.
 */
export function createAuthGuard(service: SessionService) {
  return async function authGuard(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    // A request for a path no route claims has no route options worth
    // reading, and the 404 handler will answer it. Guarding it would replace
    // a helpful "no such endpoint" with a "sign in first", which sends the
    // caller looking for the wrong problem.
    if (request.routeOptions.url === undefined) return;

    // The sign-in endpoint, the liveness probe and the identity endpoint are
    // reachable without a token, because there would otherwise be no way to
    // get one, and nothing to check before signing in.
    if (request.routeOptions.config.public === true) return;

    const token = readBearerToken(request);

    const user = token === null ? null : service.verify(token);

    if (!user) {
      await reply.code(401).send({
        error: {
          code: 'UNAUTHORIZED',
          message: 'A valid session token is required for this endpoint.',
        },
      });
      return;
    }

    request.auth = user;
  };
}

/**
 * Refuses a request from anyone who is not an administrator.
 *
 * Used by the endpoints that change something — marking a device as known,
 * acknowledging an alert, editing an alert rule. A viewer may read every
 * figure on the dashboard and change nothing.
 */
export async function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  if (request.auth?.role === 'admin') return;

  await reply.code(403).send({
    error: {
      code: 'FORBIDDEN',
      message: 'This action is reserved for an administrator session.',
    },
  });
}

/**
 * Reads the bearer token from the `Authorization` header.
 *
 * The header is compared case-insensitively on the scheme name, because
 * `authorization` and `Authorization` are the same header and a client
 * should not be refused for the spelling.
 */
function readBearerToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (typeof header !== 'string') return null;

  const separator = header.indexOf(' ');
  if (separator === -1) return null;

  const scheme = header.slice(0, separator).toLowerCase();
  if (scheme !== 'bearer') return null;

  const token = header.slice(separator + 1).trim();
  return token.length > 0 ? token : null;
}

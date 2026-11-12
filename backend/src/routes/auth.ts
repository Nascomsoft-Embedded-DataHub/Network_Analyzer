import { LoginSchema, SessionResponseSchema } from '@network-analyser/contracts';
import type { FastifyInstance } from 'fastify';
import type { SessionService } from '../auth/session.js';
import { parseOrThrow } from '../http/validate.js';

/**
 * The sign-in endpoints.
 *
 * The analyser keeps its accounts in its own configuration rather than in a
 * user table, so these two routes are the whole of the credential store.
 *
 * `POST /api/auth/login` is the only way in, and `GET /api/auth/session`
 * renews the session a client already holds.
 */
export async function registerAuthRoutes(
  app: FastifyInstance,
  service: SessionService,
): Promise<void> {
  app.post(
    '/api/auth/login',
    { config: { public: true } },
    async (request, reply) => {
      // An analyser with no administrator password can still be reached and
      // still serves the sign-in screen. Saying "not configured" is the
      // difference between "your password is wrong" and "nobody has set one
      // up yet", which are very different problems for whoever is reading
      // the message.
      if (!service.isConfigured()) {
        await reply.code(503).send({
          error: {
            code: 'AUTH_NOT_CONFIGURED',
            message:
              'No administrator password is configured for this analyser. Set ANALYSER_ADMIN_PASSWORD and restart it.',
          },
        });
        return;
      }

      const credentials = parseOrThrow(LoginSchema, request.body);

      const session = service.authenticate(credentials.email, credentials.password);
      if (!session) {
        // The same reply for an unknown address and for a wrong password, so
        // the endpoint cannot be used to find out who has an account.
        await reply.code(401).send({
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'That email address and password do not match an account.',
          },
        });
        return;
      }

      return parseOrThrow(SessionResponseSchema, { data: session });
    },
  );

  app.get('/api/auth/session', async (request) => {
    // The guard has already checked the token and put the identity on the
    // request, so reaching this handler means there is a valid session.
    const user = request.auth;
    if (!user) {
      // Unreachable while the guard is registered; typed anyway, because a
      // route that returns `undefined` is a bug waiting to happen.
      const error = new Error('No session on this request');
      Object.assign(error, { statusCode: 401 });
      throw error;
    }

    // A fresh token, so a dashboard left open on a phone stays signed in
    // without the administrator signing in again. The guard has already
    // rejected an expired token, so this only ever extends a live session.
    return parseOrThrow(SessionResponseSchema, { data: service.issue(user) });
  });
}

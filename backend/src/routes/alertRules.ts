import { asc, eq } from 'drizzle-orm';
import {
  AlertRuleListResponseSchema,
  AlertRuleUpsertSchema,
  type AlertRule,
  type AlertType,
} from '@network-analyser/contracts';
import type { FastifyInstance } from 'fastify';
import { requireAdmin } from '../auth/guard.js';
import type { Database } from '../db/client.js';
import { alertRules } from '../db/schema.js';
import { parseOrThrow } from '../http/validate.js';

/**
 * The alert rules the analyser applies.
 *
 * A rule is the configuration behind one kind of alert — "a device appeared
 * that nobody has marked as known", "a device used more than this much".
 * There is one rule per type, which is why the table has a unique index on
 * `type`: the trigger engine reads the rule for the type it is about to
 * evaluate, and there is never a second opinion.
 *
 * Reading a rule is open to any signed-in session; changing one is an
 * administrator's decision, because a rule decides what the next person who
 * looks at the dashboard will be told.
 */
export async function registerAlertRuleRoutes(
  app: FastifyInstance,
  db: Database,
): Promise<void> {
  app.get('/api/alerts/rules', async () => {
    const rows = await db.select().from(alertRules).orderBy(asc(alertRules.type));
    return parseOrThrow(AlertRuleListResponseSchema, {
      data: rows.map(toAlertRuleContract),
    });
  });

  app.put(
    '/api/alerts/rules',
    { preHandler: requireAdmin },
    async (request) => {
      const body = parseOrThrow(AlertRuleUpsertSchema, request.body);

      const [existing] = await db
        .select()
        .from(alertRules)
        .where(eq(alertRules.type, body.type))
        .limit(1);

      // An omitted threshold leaves the current one alone; an explicit null
      // clears it. The distinction matters, because a rule for "high usage"
      // with no threshold cannot fire and a rule that silently lost its
      // threshold would look enabled while doing nothing.
      const thresholdBytes =
        body.thresholdBytes === undefined
          ? (existing?.thresholdBytes ?? null)
          : body.thresholdBytes;

      await db
        .insert(alertRules)
        .values({
          type: body.type as AlertType,
          enabled: body.enabled,
          thresholdBytes,
          severity: body.severity,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: alertRules.type,
          set: {
            enabled: body.enabled,
            thresholdBytes,
            severity: body.severity,
            updatedAt: new Date(),
          },
        });

      const rows = await db.select().from(alertRules).orderBy(asc(alertRules.type));
      return parseOrThrow(AlertRuleListResponseSchema, {
        data: rows.map(toAlertRuleContract),
      });
    },
  );
}

/** Maps a database row to the shared `AlertRule` contract shape. */
function toAlertRuleContract(row: typeof alertRules.$inferSelect): AlertRule {
  return {
    id: row.id,
    type: row.type,
    enabled: row.enabled,
    thresholdBytes: row.thresholdBytes,
    severity: row.severity,
    updatedAt: row.updatedAt.toISOString(),
  };
}

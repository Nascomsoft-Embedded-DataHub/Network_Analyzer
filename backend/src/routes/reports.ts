import { ReportQuerySchema } from '@network-analyser/contracts';
import type { FastifyInstance } from 'fastify';
import type { Config } from '../config.js';
import type { Database } from '../db/client.js';
import { parseOrThrow } from '../http/validate.js';
import { renderUsageReportCsv, reportFilename } from '../reports/csv.js';
import { buildUsageReport } from '../reports/usageReport.js';

/**
 * The consumption report.
 *
 * `GET /api/reports/consumption` answers with a CSV file rather than a JSON
 * envelope, because what the person asking for it wants is a spreadsheet
 * they can send to somebody else. That is also why the endpoint is not in the
 * `ApiRoutes` registry: the registry describes JSON requests and responses,
 * and a file download has neither a request body nor a response shape to
 * describe. The query it accepts is still a shared contract, so both sides
 * agree on the window and the granularity.
 *
 * Reading a report is open to any signed-in session, exactly as reading the
 * usage figures on the dashboard is. A report contains the same numbers the
 * dashboard already shows, and nothing an administrator-only rule would
 * protect.
 *
 * The default window is the retention window — everything still on record —
 * so that asking for "the report" gives the whole of what the analyser
 * knows, rather than an arbitrary week.
 */
const DAY_MS = 86_400_000;

export async function registerReportRoutes(
  app: FastifyInstance,
  db: Database,
  config: Config,
): Promise<void> {
  app.get('/api/reports/consumption', async (request, reply) => {
    const query = parseOrThrow(ReportQuerySchema, request.query);

    const to = query.to ? new Date(query.to) : new Date();
    const from = query.from
      ? new Date(query.from)
      : new Date(to.getTime() - config.TELEMETRY_USAGE_RETENTION_DAYS * DAY_MS);

    const report = await buildUsageReport(db, {
      period: query.period,
      from,
      to,
      deviceId: query.deviceId,
    });

    reply.header('Content-Type', 'text/csv; charset=utf-8');
    reply.header('Content-Disposition', `attachment; filename="${reportFilename(report)}"`);
    // The window the file actually covers, so a client can label the download
    // without parsing the filename.
    reply.header('X-Report-Period', report.period);
    reply.header('X-Report-From', report.from);
    reply.header('X-Report-To', report.to);

    return reply.send(renderUsageReportCsv(report));
  });
}

import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createDatabase, type Database } from '../src/db/client.js';
import { devices, usage } from '../src/db/schema.js';
import { renderUsageReportCsv, reportFilename } from '../src/reports/csv.js';
import { buildUsageReport, type UsageReport } from '../src/reports/usageReport.js';

/**
 * Consumption reports.
 *
 * Two kinds of test live here. The CSV rendering is pure, so it is checked
 * directly — including the two ways a network-supplied hostname can break a
 * spreadsheet. The rollup itself is SQL, so it is checked against a real
 * PostgreSQL instance: the claim being defended is a claim about which day a
 * bucket lands in, and a stubbed database cannot defend that.
 */
const connectionString = process.env.TEST_DATABASE_URL;

const describeWithDatabase = connectionString ? describe : describe.skip;

const WINDOW_START = new Date('2026-11-04T00:00:00.000Z');
const WINDOW_END = new Date('2026-11-05T23:59:59.000Z');

describe('consumption report CSV', () => {
  const report: UsageReport = {
    period: 'daily',
    from: '2026-11-04T00:00:00.000Z',
    to: '2026-11-05T23:59:59.000Z',
    generatedAt: '2026-11-06T09:00:00.000Z',
    rows: [
      {
        scope: 'network',
        periodStart: '2026-11-04T00:00:00.000Z',
        periodEnd: '2026-11-05T00:00:00.000Z',
        device: null,
        ipAddress: null,
        uploadBytes: 1000,
        downloadBytes: 3000,
        totalBytes: 4000,
      },
      {
        scope: 'device',
        periodStart: '2026-11-04T00:00:00.000Z',
        periodEnd: '2026-11-05T00:00:00.000Z',
        device: 'hall-lamp',
        ipAddress: '192.168.1.22',
        uploadBytes: 750,
        downloadBytes: 2250,
        totalBytes: 3000,
      },
    ],
  };

  it('writes the header a spreadsheet expects', () => {
    const lines = renderUsageReportCsv(report).split('\r\n');
    expect(lines[0]).toBe(
      'scope,period_start,period_end,device,ip_address,upload_bytes,upload_human,' +
        'download_bytes,download_human,total_bytes,total_human',
    );
  });

  it('writes the byte counts as well as the human figures', () => {
    const lines = renderUsageReportCsv(report).split('\r\n');
    expect(lines[1]).toBe(
      'network,2026-11-04T00:00:00.000Z,2026-11-05T00:00:00.000Z,,,1000,1000 B,3000,2.93 KiB,4000,3.91 KiB',
    );
  });

  it('quotes a hostname that contains a comma', () => {
    const csv = renderUsageReportCsv({
      ...report,
      rows: [{ ...report.rows[1]!, device: 'lamp, hall' }],
    });
    expect(csv).toContain('"lamp, hall"');
  });

  it('quotes a hostname that contains a quote of its own', () => {
    const csv = renderUsageReportCsv({
      ...report,
      rows: [{ ...report.rows[1]!, device: 'the "smart" lamp' }],
    });
    expect(csv).toContain('"the ""smart"" lamp"');
  });

  it('defuses a hostname a spreadsheet would read as a formula', () => {
    const csv = renderUsageReportCsv({
      ...report,
      rows: [{ ...report.rows[1]!, device: '=cmd|calc' }],
    });
    expect(csv).toContain('"\'=cmd|calc"');
  });

  it('ends the file with a newline', () => {
    expect(renderUsageReportCsv(report).endsWith('\r\n')).toBe(true);
  });

  it('names the file after the period and the window', () => {
    expect(reportFilename(report)).toBe(
      'network-analyser-consumption-daily-2026-11-04-to-2026-11-05.csv',
    );
  });
});

describeWithDatabase('consumption report', () => {
  let db: Database;

  beforeAll(async () => {
    db = createDatabase(connectionString!);
  });

  beforeEach(async () => {
    await db.delete(usage);
    await db.delete(devices);
  });

  async function makeDevice(
    hostname: string,
    ipAddress: string,
  ): Promise<string> {
    const [row] = await db
      .insert(devices)
      .values({
        identityKey: `ip:${ipAddress}`,
        ipAddress,
        hostname,
      })
      .returning({ id: devices.id });
    return row!.id;
  }

  async function recordUsage(
    deviceId: string,
    bucketStart: string,
    uploadBytes: number,
    downloadBytes: number,
  ): Promise<void> {
    await db.insert(usage).values({
      deviceId,
      bucketStart: new Date(bucketStart),
      uploadBytes,
      downloadBytes,
      totalBytes: uploadBytes + downloadBytes,
    });
  }

  async function seedNetwork(): Promise<{ tablet: string; lamp: string }> {
    const tablet = await makeDevice('kitchen-tablet', '192.168.1.21');
    const lamp = await makeDevice('hall-lamp', '192.168.1.22');

    await recordUsage(tablet, '2026-11-04T10:00:00.000Z', 250, 750);
    await recordUsage(lamp, '2026-11-04T11:00:00.000Z', 750, 2250);
    await recordUsage(tablet, '2026-11-05T10:00:00.000Z', 500, 1500);

    return { tablet, lamp };
  }

  it('buckets the traffic by UTC day', async () => {
    await seedNetwork();

    const report = await buildUsageReport(db, {
      period: 'daily',
      from: WINDOW_START,
      to: WINDOW_END,
    });

    expect(report.rows.map((row) => row.periodStart)).toEqual([
      '2026-11-04T00:00:00.000Z',
      '2026-11-04T00:00:00.000Z',
      '2026-11-04T00:00:00.000Z',
      '2026-11-05T00:00:00.000Z',
      '2026-11-05T00:00:00.000Z',
    ]);
  });

  it('opens each day with the network total and the devices behind it', async () => {
    await seedNetwork();

    const report = await buildUsageReport(db, {
      period: 'daily',
      from: WINDOW_START,
      to: WINDOW_END,
    });

    const [network, first, second] = report.rows;
    expect(network!.scope).toBe('network');
    expect(network!.totalBytes).toBe(4000);
    expect(network!.uploadBytes).toBe(1000);
    expect(network!.downloadBytes).toBe(3000);
    // The bigger device is listed first: the reader is looking for the
    // biggest offender, not for an alphabetical list.
    expect(first!.device).toBe('hall-lamp');
    expect(first!.totalBytes).toBe(3000);
    expect(second!.device).toBe('kitchen-tablet');
    expect(second!.totalBytes).toBe(1000);
  });

  it('ends a day at midnight UTC', async () => {
    await seedNetwork();

    const report = await buildUsageReport(db, {
      period: 'daily',
      from: WINDOW_START,
      to: WINDOW_END,
    });

    expect(report.rows[0]!.periodEnd).toBe('2026-11-05T00:00:00.000Z');
  });

  it('buckets the traffic by ISO week', async () => {
    await seedNetwork();

    const report = await buildUsageReport(db, {
      period: 'weekly',
      from: WINDOW_START,
      to: WINDOW_END,
    });

    // Wednesday the 4th and Thursday the 5th fall in the same week, which
    // starts on Monday the 2nd.
    expect(report.rows[0]!.periodStart).toBe('2026-11-02T00:00:00.000Z');
    expect(report.rows[0]!.periodEnd).toBe('2026-11-09T00:00:00.000Z');
    expect(report.rows).toHaveLength(3);
    expect(report.rows[0]!.totalBytes).toBe(6000);
  });

  it('leaves out the traffic outside the window', async () => {
    await seedNetwork();
    const outside = await makeDevice('shed-sensor', '192.168.1.30');
    await recordUsage(outside, '2026-11-02T10:00:00.000Z', 9000, 9000);

    const report = await buildUsageReport(db, {
      period: 'daily',
      from: WINDOW_START,
      to: WINDOW_END,
    });

    expect(report.rows.every((row) => row.device !== 'shed-sensor')).toBe(true);
  });

  it('can be limited to one device', async () => {
    const { tablet } = await seedNetwork();

    const report = await buildUsageReport(db, {
      period: 'daily',
      from: WINDOW_START,
      to: WINDOW_END,
      deviceId: tablet,
    });

    const deviceRows = report.rows.filter((row) => row.scope === 'device');
    expect(deviceRows).toHaveLength(2);
    expect(deviceRows.every((row) => row.device === 'kitchen-tablet')).toBe(true);
    // The network line of a single device is that device's own traffic.
    expect(report.rows[0]!.totalBytes).toBe(1000);
  });

  it('reports nothing when there is nothing to report', async () => {
    const report = await buildUsageReport(db, {
      period: 'daily',
      from: WINDOW_START,
      to: WINDOW_END,
    });

    expect(report.rows).toHaveLength(0);
  });

  it('answers the endpoint with a CSV file', async () => {
    await seedNetwork();

    const config = loadConfig({
      ...process.env,
      NODE_ENV: 'test',
      ANALYSER_ADMIN_EMAIL: 'admin@example.com',
      ANALYSER_ADMIN_PASSWORD: 'correct-horse-battery',
    });
    const built = await buildApp({ db, config, sessionSecret: 'test-secret-value-long-enough' });
    const session = built.sessions.issue({
      id: 'user-1',
      name: 'Administrator',
      email: 'admin@example.com',
      role: 'admin',
    });

    const response = await built.app.inject({
      method: 'GET',
      url: '/api/reports/consumption?period=daily',
      headers: { authorization: `Bearer ${session.token}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/csv');
    expect(response.headers['content-disposition']).toContain('attachment');
    expect(response.headers['x-report-period']).toBe('daily');
    expect(response.body.split('\r\n')[0]).toContain('scope,period_start');
    expect(response.body).toContain('kitchen-tablet');

    await built.app.close();
  });

  it('refuses a report to a caller with no session', async () => {
    const config = loadConfig({
      ...process.env,
      NODE_ENV: 'test',
      ANALYSER_ADMIN_EMAIL: 'admin@example.com',
      ANALYSER_ADMIN_PASSWORD: 'correct-horse-battery',
    });
    const built = await buildApp({ db, config, sessionSecret: 'test-secret-value-long-enough' });

    const response = await built.app.inject({
      method: 'GET',
      url: '/api/reports/consumption',
    });

    expect(response.statusCode).toBe(401);

    await built.app.close();
  });
});

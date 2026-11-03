import { lt } from 'drizzle-orm';

import type { Database } from '../db/client.js';
import { health as healthTable, usage as usageTable } from '../db/schema.js';
import { consoleTelemetryLogger, type TelemetryLogger } from './logger.js';

/**
 * Pruning the time series.
 *
 * The privacy directives are not only about what is collected but about how
 * long it is kept. Two windows, both configurable:
 *
 * - **Usage rollups are kept for seven days.** They are the finest record
 *   the analyser keeps of traffic — byte counts, bucketed by the hour — and
 *   they are what the consumption dashboards read.
 * - **Health samples are kept for as long as the dashboards need them.**
 *
 * Nothing finer than the hour is ever written in the first place: there is
 * no per-flow table, no per-minute table, and nothing that could hold a
 * destination, a payload or a timestamp precise enough to follow a device
 * around. The sweep exists so that what *is* kept does not accumulate
 * without limit.
 */

const DAY_MS = 86_400_000;

export interface RetentionOptions {
  db: Database;
  /** Days of hourly usage rollups to keep. */
  usageRetentionDays: number;
  /** Days of health samples to keep. */
  healthRetentionDays: number;
  logger?: TelemetryLogger;
  /** Overrides the clock. Used by the tests. */
  now?: () => Date;
}

/** What a sweep removed. */
export interface RetentionReport {
  /** Usage rows deleted. */
  usageRows: number;
  /** Health rows deleted. */
  healthRows: number;
}

export class RetentionSweeper {
  private readonly db: Database;
  private readonly usageRetentionDays: number;
  private readonly healthRetentionDays: number;
  private readonly logger: TelemetryLogger;
  private readonly now: () => Date;

  private timer: NodeJS.Timeout | null = null;

  constructor(options: RetentionOptions) {
    this.db = options.db;
    this.usageRetentionDays = options.usageRetentionDays;
    this.healthRetentionDays = options.healthRetentionDays;
    this.logger = options.logger ?? consoleTelemetryLogger;
    this.now = options.now ?? (() => new Date());
  }

  /** Remove everything older than the retention windows. */
  async sweep(): Promise<RetentionReport> {
    const now = this.now();
    const usageCutoff = new Date(now.getTime() - this.usageRetentionDays * DAY_MS);
    const healthCutoff = new Date(now.getTime() - this.healthRetentionDays * DAY_MS);

    const usage = await this.db
      .delete(usageTable)
      .where(lt(usageTable.bucketStart, usageCutoff));
    const health = await this.db.delete(healthTable).where(lt(healthTable.measuredAt, healthCutoff));

    return { usageRows: usage.rowCount ?? 0, healthRows: health.rowCount ?? 0 };
  }

  /** Sweep on a timer. */
  start(intervalMs: number): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.sweepSafely();
    }, intervalMs);
    this.timer.unref?.();
  }

  /** Stop sweeping. */
  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async sweepSafely(): Promise<void> {
    try {
      const report = await this.sweep();
      if (report.usageRows > 0 || report.healthRows > 0) {
        this.logger.info(
          `retention: removed ${report.usageRows} usage rows and ${report.healthRows} health rows`,
        );
      }
    } catch (error) {
      this.logger.error('retention sweep failed', error);
    }
  }
}

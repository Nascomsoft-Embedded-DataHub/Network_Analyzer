import { and, eq, gte, inArray, sql } from 'drizzle-orm';

import type { Database } from '../db/client.js';
import { alertRules, alerts, devices, usage } from '../db/schema.js';
import { humaniseBytes } from '../format.js';
import { consoleTelemetryLogger, type TelemetryLogger } from '../telemetry/logger.js';

/**
 * The alert trigger engine.
 *
 * The rules in `alert_rules` say what should raise an alert, and until this
 * job existed nothing read them: the tables, the routes and the seeded
 * defaults were all in place, but no alert was ever written. This is the job
 * that closes that loop.
 *
 * The two rules answer different questions, and they are therefore
 * deduplicated differently:
 *
 * - **`unknown_device`** asks "has a device appeared that nobody has
 *   confirmed?". A device stays `isKnown = false` until an administrator
 *   marks it, so the trigger cannot fire for every unknown device on every
 *   pass — it fires once per device, and stays quiet afterwards because the
 *   administrator has already been told about that device.
 * - **`high_usage`** asks "has a device used more than the rule allows?". The
 *   threshold is a daily allowance, so the engine compares the device's
 *   consumption *so far today* against it and fires at most once per device
 *   per UTC day.
 *
 * Both rules carry their own severity, so the rule decides how loudly the
 * dashboard says it, and both alerts name the device by hostname only — never
 * by address — because an alert is something a person reads aloud.
 */
export interface AlertTriggerOptions {
  db: Database;
  logger?: TelemetryLogger;
  /** Overrides the clock. Used by the tests. */
  now?: () => Date;
}

/** What one pass of the engine did. */
export interface TriggerEvaluation {
  /** Rules that were read and applied. */
  rulesEvaluated: number;
  /** Alerts raised for unknown devices. */
  unknownDeviceAlerts: number;
  /** Alerts raised for exceeded usage thresholds. */
  highUsageAlerts: number;
}

type AlertRuleRow = typeof alertRules.$inferSelect;

export class AlertTriggerEngine {
  private readonly db: Database;
  private readonly logger: TelemetryLogger;
  private readonly now: () => Date;

  private timer: NodeJS.Timeout | null = null;

  constructor(options: AlertTriggerOptions) {
    this.db = options.db;
    this.logger = options.logger ?? consoleTelemetryLogger;
    this.now = options.now ?? (() => new Date());
  }

  /** Evaluate every enabled rule once. */
  async evaluate(): Promise<TriggerEvaluation> {
    const rules = await this.db
      .select()
      .from(alertRules)
      .where(eq(alertRules.enabled, true));

    const evaluation: TriggerEvaluation = {
      rulesEvaluated: rules.length,
      unknownDeviceAlerts: 0,
      highUsageAlerts: 0,
    };

    for (const rule of rules) {
      if (rule.type === 'unknown_device') {
        evaluation.unknownDeviceAlerts += await this.raiseUnknownDeviceAlerts(rule);
      } else if (rule.type === 'high_usage') {
        evaluation.highUsageAlerts += await this.raiseHighUsageAlerts(rule);
      }
    }

    return evaluation;
  }

  /** Evaluate on a timer. */
  start(intervalMs: number): void {
    if (this.timer) return;
    // The first pass runs straight away: a device that appeared while the
    // analyser was down should not wait a whole interval to be reported.
    void this.evaluateSafely();
    this.timer = setInterval(() => {
      void this.evaluateSafely();
    }, intervalMs);
    this.timer.unref?.();
  }

  /** Stop evaluating. */
  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Raise one alert for every device nobody has confirmed.
   *
   * The device table is the list of devices seen; `is_known` is the
   * administrator's answer to "do you recognise this?". A device that has
   * already been reported is not reported again, however many times the
   * engine runs — otherwise the alert list would fill with one line per
   * device per minute, which is how an alert list stops being read.
   */
  private async raiseUnknownDeviceAlerts(rule: AlertRuleRow): Promise<number> {
    const unknown = await this.db
      .select({ id: devices.id, hostname: devices.hostname })
      .from(devices)
      .where(eq(devices.isKnown, false));

    if (unknown.length === 0) return 0;

    const reported = await this.db
      .select({ deviceId: alerts.deviceId })
      .from(alerts)
      .where(eq(alerts.type, 'unknown_device'));

    const alreadyReported = new Set(
      reported.map((row) => row.deviceId).filter((id): id is string => id !== null),
    );

    const fresh = unknown.filter((device) => !alreadyReported.has(device.id));
    if (fresh.length === 0) return 0;

    const triggeredAt = this.now();
    await this.db.insert(alerts).values(
      fresh.map((device) => ({
        type: 'unknown_device' as const,
        severity: rule.severity,
        message: device.hostname
          ? `New device detected on the network: ${device.hostname}`
          : 'New device detected on the network',
        deviceId: device.id,
        thresholdBytes: null,
        observedBytes: null,
        triggeredAt,
      })),
    );

    return fresh.length;
  }

  /**
   * Raise one alert for every device that has used more than its daily
   * allowance today.
   *
   * The measurement is the same one the dashboard reads: the sum of the
   * hourly usage buckets that fall on the current UTC day. The figure is
   * therefore "so far today", not a projection, and the last few minutes of
   * traffic are missing until the collector hands the next set of counters
   * over.
   */
  private async raiseHighUsageAlerts(rule: AlertRuleRow): Promise<number> {
    // A rule with no threshold cannot fire. Leaving it enabled and silent
    // would look like a rule that is working.
    if (rule.thresholdBytes === null) return 0;

    const threshold = rule.thresholdBytes;
    const now = this.now();
    const dayStart = startOfUtcDay(now);

    const totals = await this.db
      .select({
        deviceId: usage.deviceId,
        totalBytes: sql<string>`coalesce(sum(${usage.totalBytes}), 0)::bigint`,
      })
      .from(usage)
      .where(gte(usage.bucketStart, dayStart))
      .groupBy(usage.deviceId);

    const over = totals
      .map((row) => ({ deviceId: row.deviceId, totalBytes: Number(row.totalBytes) }))
      .filter((row) => row.totalBytes >= threshold);

    if (over.length === 0) return 0;

    const deviceIds = over.map((row) => row.deviceId);
    const involved = await this.db
      .select({ id: devices.id, hostname: devices.hostname })
      .from(devices)
      .where(inArray(devices.id, deviceIds));

    const hostnames = new Map(involved.map((device) => [device.id, device.hostname]));

    // At most one alert per device per day. The alert's own timestamp is the
    // record of which day it belongs to.
    const alreadyRaised = await this.db
      .select({ deviceId: alerts.deviceId })
      .from(alerts)
      .where(
        and(
          eq(alerts.type, 'high_usage'),
          gte(alerts.triggeredAt, dayStart),
          inArray(alerts.deviceId, deviceIds),
        ),
      );

    const raised = new Set(
      alreadyRaised.map((row) => row.deviceId).filter((id): id is string => id !== null),
    );

    const fresh = over.filter((row) => !raised.has(row.deviceId));
    if (fresh.length === 0) return 0;

    await this.db.insert(alerts).values(
      fresh.map((row) => {
        const hostname = hostnames.get(row.deviceId);
        const subject = hostname ? hostname : 'A device';
        return {
          type: 'high_usage' as const,
          severity: rule.severity,
          message:
            `${subject} used ${humaniseBytes(row.totalBytes)} today, ` +
            `above the ${humaniseBytes(threshold)} daily allowance`,
          deviceId: row.deviceId,
          thresholdBytes: threshold,
          observedBytes: row.totalBytes,
          triggeredAt: now,
        };
      }),
    );

    return fresh.length;
  }

  private async evaluateSafely(): Promise<void> {
    try {
      const evaluation = await this.evaluate();
      if (evaluation.unknownDeviceAlerts > 0 || evaluation.highUsageAlerts > 0) {
        this.logger.info(
          `alerts: raised ${evaluation.unknownDeviceAlerts} unknown-device ` +
            `and ${evaluation.highUsageAlerts} high-usage alerts`,
        );
      }
    } catch (error) {
      this.logger.error('alert trigger evaluation failed', error);
    }
  }
}

/** Midnight UTC on the day the given instant falls on. */
function startOfUtcDay(now: Date): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0),
  );
}

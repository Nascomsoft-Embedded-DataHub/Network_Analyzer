import type { Database } from '../db/client.js';
import { health as healthTable } from '../db/schema.js';
import type { DiscoverySource, HealthReading } from '../discovery/types.js';
import { consoleTelemetryLogger, type TelemetryLogger } from './logger.js';

/**
 * Sampling the health of the network.
 *
 * The figures come from the router itself: its own speed test is the only
 * honest measure of what the link can carry, and its ping metrics are a
 * steadier latency figure than a speed test reports in passing. Nothing is
 * sent to a third party to make a measurement, and nothing is inspected.
 *
 * Two decisions shape what lands in the database:
 *
 * - **A reading is written whole or not at all.** The health columns hold
 *   numbers, and a number that was not measured has no honest value: zero
 *   would read as "the link is down". A reading missing any of its figures
 *   is therefore dropped, and the gap it leaves is the honest record.
 * - **Uptime is the analyser's own streak.** The router knows how long it
 *   has been up, but that is not the same question as "how long has the link
 *   been reachable from here". The streak answers that: it starts at the
 *   first successful probe and resets whenever a probe fails.
 */

/**
 * How long the link has been continuously reachable.
 *
 * The streak survives successful probes and is broken by a failed one, so
 * the figure it reports is always the length of the current unbroken run.
 */
export class UptimeStreak {
  private since: Date | null = null;

  /** Records a successful probe and returns the uptime in seconds. */
  succeed(at: Date): number {
    if (this.since === null) this.since = at;
    return Math.max(0, Math.floor((at.getTime() - this.since.getTime()) / 1000));
  }

  /** Records a failed probe. The next success starts a new streak. */
  fail(): void {
    this.since = null;
  }
}

/** What one sample produced. */
export interface HealthSample {
  /** The reading, when it was complete enough to keep. */
  reading: HealthReading | null;
  /** Seconds of continuous reachability at the time of the sample. */
  uptimeSeconds: number;
  /** True when a row was written. */
  stored: boolean;
}

/**
 * The source a health sample comes from.
 *
 * The first source that can measure wins: the router measures the real link,
 * and the simulated source is a stand-in for it when there is no router to
 * ask.
 */
export function selectHealthSource(sources: DiscoverySource[]): DiscoverySource | null {
  return sources.find((source) => typeof source.probeHealth === 'function') ?? null;
}

export interface HealthSamplerOptions {
  db: Database;
  sources: DiscoverySource[];
  logger?: TelemetryLogger;
  /** Overrides the clock. Used by the tests. */
  now?: () => Date;
}

export class HealthSampler {
  private readonly db: Database;
  private readonly logger: TelemetryLogger;
  private readonly now: () => Date;
  private readonly source: DiscoverySource | null;
  private readonly streak = new UptimeStreak();

  private timer: NodeJS.Timeout | null = null;
  private inFlight: Promise<HealthSample> | null = null;

  constructor(options: HealthSamplerOptions) {
    this.db = options.db;
    this.logger = options.logger ?? consoleTelemetryLogger;
    this.now = options.now ?? (() => new Date());
    this.source = selectHealthSource(options.sources);
  }

  /** The source being measured, for the boot log. */
  get sourceName(): string | null {
    return this.source?.name ?? null;
  }

  /**
   * Take one sample.
   *
   * A source that fails does not fail the sampler: the link did not answer,
   * which is itself worth knowing, and it breaks the uptime streak.
   */
  async sample(): Promise<HealthSample> {
    // Samples are chained rather than run side by side, so the router is
    // never asked to run two speed tests at once.
    const previous = this.inFlight ?? Promise.resolve();
    const run = previous.catch(() => undefined).then(() => this.takeSample());
    this.inFlight = run;
    try {
      return await run;
    } finally {
      if (this.inFlight === run) this.inFlight = null;
    }
  }

  /** Sample on a timer. */
  start(intervalMs: number): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.sampleSafely();
    }, intervalMs);
    this.timer.unref?.();
  }

  /** Stop sampling. */
  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.inFlight) {
      await this.inFlight.catch(() => undefined);
    }
  }

  private async takeSample(): Promise<HealthSample> {
    const source = this.source;
    if (!source?.probeHealth) {
      return { reading: null, uptimeSeconds: 0, stored: false };
    }

    let reading: HealthReading;
    try {
      reading = await source.probeHealth();
    } catch (error) {
      this.streak.fail();
      this.logger.warn(
        `health probe failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return { reading: null, uptimeSeconds: 0, stored: false };
    }

    const measuredAt = this.now();

    if (reading.latencyMs === null || reading.downloadMbps === null || reading.uploadMbps === null) {
      // Something could not be measured. If nothing at all could be
      // measured, the link did not answer and the streak is broken;
      // otherwise it answered and simply could not report every figure.
      if (reading.latencyMs === null && reading.downloadMbps === null) {
        this.streak.fail();
      }
      this.logger.warn('health probe returned an incomplete reading; not recorded');
      return { reading, uptimeSeconds: 0, stored: false };
    }

    const uptimeSeconds = this.streak.succeed(measuredAt);

    await this.db.insert(healthTable).values({
      deviceId: null,
      measuredAt,
      latencyMs: String(reading.latencyMs),
      downloadMbps: String(reading.downloadMbps),
      uploadMbps: String(reading.uploadMbps),
      uptimeSeconds,
    });

    return { reading, uptimeSeconds, stored: true };
  }

  private async sampleSafely(): Promise<void> {
    try {
      await this.sample();
    } catch (error) {
      this.logger.error('health sample failed', error);
    }
  }
}

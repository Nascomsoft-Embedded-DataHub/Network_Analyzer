import { eq, sql } from 'drizzle-orm';

import type { Database } from '../db/client.js';
import { devices as devicesTable, usage as usageTable } from '../db/schema.js';
import type { ObservedTraffic } from '../ingestion/traffic.js';
import { hourBucket, trafficDelta, type Counters, type TrafficDelta } from './counters.js';
import { consoleTelemetryLogger, type TelemetryLogger } from './logger.js';

/**
 * Turning the router's cumulative counters into hourly consumption.
 *
 * The router reports, for every client, the bytes it has moved since it
 * attached. The dashboard wants the bytes moved in each hour. The gap between
 * the two is the whole job of this module, and the interesting part is not
 * the subtraction but the bookkeeping around it:
 *
 * - **A baseline is not consumption.** The first reading of a device says
 *   nothing about when the traffic happened, so it counts for nothing.
 * - **A counter that goes backwards is not an error.** The device
 *   reattached and the router started counting again; everything in the new
 *   reading moved since that reattachment.
 * - **An outage is a hole in the record, not a hole in the totals.** After a
 *   restart, the difference between the persisted baseline and the next
 *   reading covers traffic the analyser never saw happen. It is still real
 *   traffic, so it is counted — spread across the hours it could have
 *   happened in, rather than dumped on one of them.
 *
 * The baseline lives on the device row rather than in memory, so that a
 * restart does not turn the counters into a first reading and lose the
 * difference between them.
 */

const HOUR_MS = 3_600_000;

/** What the collector remembers about one device between flushes. */
interface DeviceState {
  /** Counters already written into the usage table. */
  accounted: Counters | null;
  /** When those counters were read. */
  accountedAt: Date | null;
  /** The most recent counters seen. */
  latest: Counters | null;
  /** When they were seen. */
  latestAt: Date | null;
  /** Traffic not yet written, keyed by the hour it belongs to. */
  pending: Map<number, TrafficDelta>;
}

/** One device's worth of pending work, ready to be written. */
export interface FlushItem {
  deviceId: string;
  /** Hourly buckets to add to the usage table. */
  buckets: { bucketStart: Date; delta: TrafficDelta }[];
  /** The counters the baseline should advance to. */
  latest: Counters;
  /** When those counters were read. */
  latestAt: Date;
}

/** What a flush wrote. */
export interface FlushReport {
  /** Devices whose baseline advanced. */
  devices: number;
  /** Hour buckets written. */
  buckets: number;
}

/**
 * The accounting, with no database in sight.
 *
 * Split from the collector so that the part worth thinking about — which
 * hour a byte belongs to — can be exercised on its own.
 */
export class TrafficAccumulator {
  private readonly states = new Map<string, DeviceState>();

  /** True when the device is already being tracked. */
  has(deviceId: string): boolean {
    return this.states.has(deviceId);
  }

  /**
   * Start tracking a device, optionally from a baseline read elsewhere.
   *
   * The baseline is what a previous run of the analyser last wrote, which is
   * what makes a restart a difference rather than a first reading.
   */
  register(deviceId: string, baseline: { counters: Counters; at: Date | null } | null): void {
    if (this.states.has(deviceId)) return;
    this.states.set(deviceId, {
      accounted: baseline?.counters ?? null,
      accountedAt: baseline?.at ?? null,
      latest: null,
      latestAt: null,
      pending: new Map(),
    });
  }

  /**
   * Record a reading of the counters.
   *
   * Where the traffic belongs depends on where the previous reading was, and
   * on how the counters moved:
   *
   * - A reading against the previous one covers the interval between them.
   *   That interval is short, so the hour of the earlier reading is the
   *   right bucket.
   * - A reading against a baseline inherited from the database covers
   *   everything since that baseline was taken — possibly hours. The traffic
   *   is spread evenly across the hours in between, because that is all the
   *   record can honestly say about where it happened.
   * - A counter that went backwards means a reattachment, and the whole
   *   reading is new traffic that happened just now.
   */
  observe(deviceId: string, counters: Counters, at: Date): void {
    const state = this.states.get(deviceId);
    if (!state) {
      throw new Error(`device ${deviceId} was observed before it was registered`);
    }

    const previous = state.latest ?? state.accounted;
    const previousAt = state.latestAt ?? state.accountedAt;

    if (previous === null) {
      // The first reading ever. It establishes the baseline and counts for
      // nothing itself.
      state.latest = counters;
      state.latestAt = at;
      return;
    }

    const delta = trafficDelta(counters, previous);
    const reset = counters.rxBytes < previous.rxBytes || counters.txBytes < previous.txBytes;

    if (reset) {
      // The device reattached, so the counter started again from zero and
      // everything it holds now moved since that moment.
      this.add(state, hourBucket(at).getTime(), delta);
    } else if (state.latest === null) {
      // The first reading since this process started, against a baseline
      // inherited from the database.
      this.spread(state, state.accountedAt, at, delta);
    } else {
      this.add(state, hourBucket(previousAt!).getTime(), delta);
    }

    state.latest = counters;
    state.latestAt = at;
  }

  /**
   * Take the pending work, leaving it out of the accumulator.
   *
   * The caller writes it and then calls {@link settle}; if the write fails
   * it calls {@link restore} instead, so nothing is lost.
   */
  drain(): FlushItem[] {
    const items: FlushItem[] = [];

    for (const [deviceId, state] of this.states) {
      if (state.latest === null) continue;

      const buckets = [...state.pending.entries()].map(([bucketStartMs, delta]) => ({
        bucketStart: new Date(bucketStartMs),
        delta: { ...delta },
      }));

      const unchanged =
        state.accounted !== null &&
        state.accounted.rxBytes === state.latest.rxBytes &&
        state.accounted.txBytes === state.latest.txBytes;

      // Nothing to write and no baseline to advance. Note that a device whose
      // baseline is still null is *not* skipped: the baseline is what makes
      // the next reading a difference rather than a first reading, so it
      // has to be written even when no traffic has been counted yet.
      if (buckets.length === 0 && unchanged) continue;

      state.pending.clear();
      items.push({
        deviceId,
        buckets,
        latest: { ...state.latest },
        latestAt: state.latestAt!,
      });
    }

    return items;
  }

  /** Put drained work back, after a failed write. */
  restore(items: FlushItem[]): void {
    for (const item of items) {
      const state = this.states.get(item.deviceId);
      if (!state) continue;
      for (const bucket of item.buckets) {
        this.add(state, bucket.bucketStart.getTime(), bucket.delta);
      }
    }
  }

  /** Accept the drained counters as the new baseline. */
  settle(items: FlushItem[]): void {
    for (const item of items) {
      const state = this.states.get(item.deviceId);
      if (!state) continue;
      state.accounted = { ...item.latest };
      state.accountedAt = item.latestAt;
    }
  }

  /** Stop tracking a device. */
  forget(deviceId: string): void {
    this.states.delete(deviceId);
  }

  /** Add traffic to an hour. */
  private add(state: DeviceState, bucketStartMs: number, delta: TrafficDelta): void {
    if (delta.downloadBytes === 0 && delta.uploadBytes === 0) return;

    const existing = state.pending.get(bucketStartMs);
    if (existing) {
      existing.downloadBytes += delta.downloadBytes;
      existing.uploadBytes += delta.uploadBytes;
      return;
    }
    state.pending.set(bucketStartMs, { ...delta });
  }

  /**
   * Spread traffic over the hours it could have happened in.
   *
   * Used after an outage: the record says the traffic moved between two
   * moments and nothing more. Putting it all on one hour would show a spike
   * that never happened, so it is divided across the hours in between. The
   * odd byte goes to the earlier hours, which keeps the total exact.
   */
  private spread(
    state: DeviceState,
    from: Date | null,
    to: Date,
    delta: TrafficDelta,
  ): void {
    if (!from) {
      // Nothing is known about when the baseline was read, so the traffic is
      // placed in the hour it was noticed.
      this.add(state, hourBucket(to).getTime(), delta);
      return;
    }

    const start = hourBucket(from).getTime();
    const end = hourBucket(to).getTime();
    const hours = Math.max(1, Math.round((end - start) / HOUR_MS) + 1);

    const download = divide(delta.downloadBytes, hours);
    const upload = divide(delta.uploadBytes, hours);

    for (let index = 0; index < hours; index += 1) {
      this.add(state, start + index * HOUR_MS, {
        downloadBytes: download.base + (index < download.remainder ? 1 : 0),
        uploadBytes: upload.base + (index < upload.remainder ? 1 : 0),
      });
    }
  }
}

/** Divide a total into whole parts, keeping the remainder. */
function divide(total: number, parts: number): { base: number; remainder: number } {
  const base = Math.floor(total / parts);
  return { base, remainder: total - base * parts };
}

export interface BandwidthCollectorOptions {
  db: Database;
  logger?: TelemetryLogger;
}

/**
 * The bandwidth collector.
 *
 * Fed the counters each poll produces, it keeps them in memory until there
 * is enough to write, then writes the hourly buckets and the new baseline
 * in a single transaction. Doing both at once is what makes it safe: a
 * crash either loses the pending traffic, which the next run recovers from
 * the persisted baseline, or writes both, and never one without the other.
 */
export class BandwidthCollector {
  private readonly db: Database;
  private readonly logger: TelemetryLogger;
  private readonly accumulator = new TrafficAccumulator();

  private timer: NodeJS.Timeout | null = null;
  private inFlight: Promise<FlushReport> | null = null;

  constructor(options: BandwidthCollectorOptions) {
    this.db = options.db;
    this.logger = options.logger ?? consoleTelemetryLogger;
  }

  /**
   * Record the counters from one poll.
   *
   * The first time a device is seen, its baseline is read from the database.
   * That read happens once per device per run, not once per reading.
   */
  async record(observations: ObservedTraffic[]): Promise<void> {
    for (const observation of observations) {
      if (!this.accumulator.has(observation.deviceId)) {
        const baseline = await this.loadBaseline(observation.deviceId);
        this.accumulator.register(observation.deviceId, baseline);
      }

      this.accumulator.observe(
        observation.deviceId,
        { rxBytes: observation.rxBytes, txBytes: observation.txBytes },
        observation.observedAt,
      );
    }
  }

  /**
   * Write the pending traffic and advance the baselines.
   *
   * The buckets and the baselines are written together, in one transaction,
   * so the database never holds a baseline that has not been accounted for
   * or buckets that have not been counted.
   */
  async flush(): Promise<FlushReport> {
    // Flushes are chained rather than run side by side, so that two of them
    // can never write the same bucket twice.
    const previous = this.inFlight ?? Promise.resolve();
    const run = previous.catch(() => undefined).then(() => this.writePending());
    this.inFlight = run;
    try {
      return await run;
    } finally {
      if (this.inFlight === run) this.inFlight = null;
    }
  }

  /** Write on a timer. */
  start(intervalMs: number): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.flushSafely();
    }, intervalMs);
    // The timer should not be the reason the process stays alive.
    this.timer.unref?.();
  }

  /** Stop the timer and write whatever is pending. */
  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    await this.flushSafely();
  }

  private async writePending(): Promise<FlushReport> {
    const items = this.accumulator.drain();
    if (items.length === 0) return { devices: 0, buckets: 0 };

    let buckets = 0;
    const gone: string[] = [];

    try {
      await this.db.transaction(async (tx) => {
        for (const item of items) {
          const advanced = await tx
            .update(devicesTable)
            .set({
              lastRxBytes: item.latest.rxBytes,
              lastTxBytes: item.latest.txBytes,
              lastCountersAt: item.latestAt,
            })
            .where(eq(devicesTable.id, item.deviceId));

          if ((advanced.rowCount ?? 0) === 0) {
            // The record was consolidated into another one while this
            // traffic was pending. Its history has been moved there, so
            // there is nothing to write here.
            gone.push(item.deviceId);
            continue;
          }

          for (const bucket of item.buckets) {
            await tx
              .insert(usageTable)
              .values({
                deviceId: item.deviceId,
                bucketStart: bucket.bucketStart,
                uploadBytes: bucket.delta.uploadBytes,
                downloadBytes: bucket.delta.downloadBytes,
                totalBytes: bucket.delta.uploadBytes + bucket.delta.downloadBytes,
              })
              .onConflictDoUpdate({
                target: [usageTable.deviceId, usageTable.bucketStart],
                set: {
                  uploadBytes: sql`${usageTable.uploadBytes} + ${bucket.delta.uploadBytes}`,
                  downloadBytes: sql`${usageTable.downloadBytes} + ${bucket.delta.downloadBytes}`,
                  totalBytes: sql`${usageTable.totalBytes} + ${
                    bucket.delta.uploadBytes + bucket.delta.downloadBytes
                  }`,
                },
              });
            buckets += 1;
          }
        }
      });
    } catch (error) {
      // The transaction rolled back, so nothing was written and the pending
      // traffic is still owed to the database.
      this.accumulator.restore(items);
      throw error;
    }

    this.accumulator.settle(items);
    for (const deviceId of gone) {
      this.accumulator.forget(deviceId);
    }

    return { devices: items.length - gone.length, buckets };
  }

  private async flushSafely(): Promise<void> {
    try {
      const report = await this.flush();
      if (report.buckets > 0) {
        this.logger.info(
          `usage: wrote ${report.buckets} hour buckets for ${report.devices} devices`,
        );
      }
    } catch (error) {
      this.logger.error('usage flush failed', error);
    }
  }

  /**
   * The baseline a previous run left behind.
   *
   * Null when the device has never been counted, which makes the next
   * reading a first reading rather than a difference.
   */
  private async loadBaseline(
    deviceId: string,
  ): Promise<{ counters: Counters; at: Date | null } | null> {
    const [row] = await this.db
      .select({
        rxBytes: devicesTable.lastRxBytes,
        txBytes: devicesTable.lastTxBytes,
        at: devicesTable.lastCountersAt,
      })
      .from(devicesTable)
      .where(eq(devicesTable.id, deviceId));

    if (!row || row.rxBytes === null || row.txBytes === null) return null;
    return { counters: { rxBytes: row.rxBytes, txBytes: row.txBytes }, at: row.at };
  }
}

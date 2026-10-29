import { and, lt, ne } from 'drizzle-orm';

import type { Database } from '../db/client.js';
import { devices as devicesTable } from '../db/schema.js';
import type { DiscoverySource } from '../discovery/types.js';
import { createVendorLookup, type VendorLookup } from '../naming/vendor.js';
import { mergeDiscoveredClients } from './merge.js';
import { persistDiscoveredDevices } from './upsert.js';

/**
 * The ingestion listener.
 *
 * Polls the discovery sources on a timer, merges what they see and writes it
 * to the inventory. The poll interval is the sampling resolution: the router
 * keeps no history, so a device that is attached for less than one interval
 * can be missed entirely.
 */

export interface IngestionLogger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string, error?: unknown): void;
}

const consoleLogger: IngestionLogger = {
  info: (message, ...details) => console.log(message, ...details),
  warn: (message, ...details) => console.warn(message, ...details),
  error: (message, ...details) => console.error(message, ...details),
};

export interface IngestionListenerOptions {
  db: Database;
  sources: DiscoverySource[];
  /** Milliseconds between polls. */
  pollIntervalMs: number;
  /** Milliseconds of silence after which a device is marked offline. */
  offlineAfterMs: number;
  vendorLookup?: VendorLookup;
  logger?: IngestionLogger;
  /** Overrides the clock. Used by the tests. */
  now?: () => Date;
}

export interface PollOutcome {
  /** Observations the sources reported. */
  observed: number;
  /** Devices the merge could tell apart. */
  devices: number;
  inserted: number;
  updated: number;
  skipped: number;
  /** Devices that have gone quiet. */
  markedOffline: number;
  /** Sources that failed during this poll. */
  failures: { source: string; error: string }[];
}

export class IngestionListener {
  private readonly db: Database;
  private readonly sources: DiscoverySource[];
  private readonly pollIntervalMs: number;
  private readonly offlineAfterMs: number;
  private readonly vendorLookup: VendorLookup;
  private readonly logger: IngestionLogger;
  private readonly now: () => Date;

  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private stopped = true;

  constructor(options: IngestionListenerOptions) {
    this.db = options.db;
    this.sources = options.sources;
    this.pollIntervalMs = options.pollIntervalMs;
    this.offlineAfterMs = options.offlineAfterMs;
    this.vendorLookup = options.vendorLookup ?? createVendorLookup();
    this.logger = options.logger ?? consoleLogger;
    this.now = options.now ?? (() => new Date());
  }

  /** Begin polling. The first poll runs immediately. */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.stopped = false;
    void this.runLoop();
  }

  /** Stop polling and wait for any poll in flight to finish. */
  async stop(): Promise<void> {
    this.stopped = true;
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private async runLoop(): Promise<void> {
    while (this.running && !this.stopped) {
      try {
        await this.poll();
      } catch (error) {
        this.logger.error('discovery poll failed', error);
      }
      if (this.stopped) return;
      await new Promise((resolve) => {
        this.timer = setTimeout(resolve, this.pollIntervalMs);
      });
    }
  }

  /**
   * One poll.
   *
   * A source that fails does not fail the poll. The other sources still have
   * something to say, and a router that is briefly unreachable should not
   * empty the inventory.
   */
  async poll(): Promise<PollOutcome> {
    const observedAt = this.now();
    const observations = [];
    const failures: { source: string; error: string }[] = [];

    for (const source of this.sources) {
      try {
        observations.push(...(await source.discover()));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failures.push({ source: source.name, error: message });
        this.logger.warn(`discovery source "${source.name}" failed: ${message}`);
      }
    }

    const merged = mergeDiscoveredClients(observations);
    const written = await persistDiscoveredDevices(this.db, merged, {
      vendorLookup: this.vendorLookup,
      observedAt,
    });
    const markedOffline = await this.markQuietDevicesOffline(observedAt);

    return {
      observed: observations.length,
      devices: merged.length,
      inserted: written.inserted,
      updated: written.updated,
      skipped: written.skipped,
      markedOffline,
      failures,
    };
  }

  /**
   * Mark devices that have gone quiet as offline.
   *
   * A device that misses a single poll has usually changed band or gone to
   * sleep, so the grace period keeps a flaky read from flapping the roster.
   */
  private async markQuietDevicesOffline(now: Date): Promise<number> {
    const cutoff = new Date(now.getTime() - this.offlineAfterMs);
    const result = await this.db
      .update(devicesTable)
      .set({ status: 'offline' })
      .where(and(lt(devicesTable.lastSeenAt, cutoff), ne(devicesTable.status, 'offline')));
    return result.rowCount ?? 0;
  }
}

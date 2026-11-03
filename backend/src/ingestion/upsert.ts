import { eq, or, sql } from 'drizzle-orm';

import { devices as devicesTable } from '../db/schema.js';
import type { Database } from '../db/client.js';
import { deriveHostname } from '../naming/hostname.js';
import type { VendorLookup } from '../naming/vendor.js';
import { identityBasis, isStrongerBasis, UNIDENTIFIABLE_KEY } from './identity.js';
import type { MergedDevice } from './merge.js';

/**
 * Writing what the merge found into the inventory.
 *
 * The rules that matter:
 *
 * - A device that is already in the inventory is updated, never re-inserted.
 *   That is what "without duplication" means in practice: the poll runs every
 *   few seconds and must not grow the table.
 * - `isKnown` is the administrator's decision and is never written by
 *   ingestion. Neither is `firstSeenAt`, which records when the device was
 *   first seen and therefore must not move.
 * - A record anchored to a weak identifier is re-anchored when a stronger one
 *   is learned, so the row for a device seen through a masking router ends up
 *   keyed by its hardware address.
 */

export interface UpsertOptions {
  /** Resolves the vendor from a hardware address. */
  vendorLookup: VendorLookup;
  /** The moment the observations were made. */
  observedAt: Date;
}

export interface UpsertOutcome {
  /** Records created for devices not previously known. */
  inserted: number;
  /** Records updated for devices already known. */
  updated: number;
  /** Observations that could not be recorded, because they carried no address. */
  skipped: number;
  /**
   * The records written, so a caller can map an observation onto its row.
   *
   * The observation's key and the row's key can differ: a record anchored to
   * a hardware address is never re-anchored back to a weaker basis.
   */
  written: WrittenDevice[];
}

/** A record the ingestion pipeline wrote, and the observation behind it. */
export interface WrittenDevice {
  /** The key of the observation this record was written from. */
  observationKey: string;
  /** The record's primary key. */
  deviceId: string;
  /** The key the record is now anchored to. */
  identityKey: string;
}

/** The basis of a key, used to prefer the strongest record when choosing one. */
function basisStrength(identityKey: string): number {
  switch (identityBasis(identityKey)) {
    case 'mac':
      return 3;
    case 'cid':
      return 2;
    default:
      return 1;
  }
}

export async function persistDiscoveredDevices(
  db: Database,
  found: MergedDevice[],
  options: UpsertOptions,
): Promise<UpsertOutcome> {
  const outcome: UpsertOutcome = { inserted: 0, updated: 0, skipped: 0, written: [] };

  for (const device of found) {
    const vendor = options.vendorLookup(device.macAddress);
    const hostname = deriveHostname({
      reportedName: device.reportedName,
      vendor,
      macAddress: device.macAddress,
      macIsMasked: device.macIsMasked,
      routerClientId: device.routerClientId,
    });

    const existing = await findCandidates(db, device);
    const target = chooseTarget(existing, device);

    if (!target) {
      if (device.identityKey === UNIDENTIFIABLE_KEY) {
        // No address and no id: there is nothing to record this by, so it is
        // counted and dropped rather than given a fabricated identity.
        outcome.skipped += 1;
        continue;
      }
      const inserted = await db
        .insert(devicesTable)
        .values({
          identityKey: device.identityKey,
          ipAddress: device.ipAddress ?? '0.0.0.0',
          macAddress: device.macAddress,
          hostname,
          vendor,
          status: 'online',
          lastSeenAt: options.observedAt,
        })
        .returning({ id: devicesTable.id });
      outcome.inserted += 1;
      outcome.written.push({
        observationKey: device.identityKey,
        deviceId: inserted[0]!.id,
        identityKey: device.identityKey,
      });
      continue;
    }

    await db
      .update(devicesTable)
      .set({
        // Re-anchor only upwards: a device briefly seen without its hardware
        // address must not lose the anchor it already had.
        identityKey: isStrongerBasis(identityBasis(device.identityKey), identityBasis(target.identityKey))
          ? device.identityKey
          : target.identityKey,
        ipAddress: device.ipAddress ?? target.ipAddress,
        // A masked address is kept only while nothing better is known.
        macAddress: device.macIsMasked && target.macAddress ? target.macAddress : device.macAddress ?? target.macAddress,
        hostname: device.reportedName ? hostname : target.hostname ?? hostname,
        vendor: vendor ?? target.vendor,
        status: 'online',
        lastSeenAt: options.observedAt,
      })
      .where(eq(devicesTable.id, target.id));

    await consolidateDuplicates(db, target.id, existing, device);
    outcome.updated += 1;
    outcome.written.push({
      observationKey: device.identityKey,
      deviceId: target.id,
      // The record keeps the stronger anchor it already had.
      identityKey: isStrongerBasis(
        identityBasis(device.identityKey),
        identityBasis(target.identityKey),
      )
        ? device.identityKey
        : target.identityKey,
    });
  }

  return outcome;
}

/** Records that could be the same device as the observation. */
async function findCandidates(
  db: Database,
  device: MergedDevice,
): Promise<(typeof devicesTable.$inferSelect)[]> {
  const conditions = [eq(devicesTable.identityKey, device.identityKey)];
  if (device.ipAddress) {
    conditions.push(eq(devicesTable.ipAddress, device.ipAddress));
  }
  return db.select().from(devicesTable).where(or(...conditions));
}

/**
 * The record an observation belongs to.
 *
 * An exact key match is decisive. Failing that, a record at the same address
 * is accepted — unless it is anchored to a different real hardware address,
 * in which case the address has simply been handed to another device.
 */
function chooseTarget(
  candidates: (typeof devicesTable.$inferSelect)[],
  device: MergedDevice,
): (typeof devicesTable.$inferSelect) | undefined {
  const exact = candidates.find((row) => row.identityKey === device.identityKey);
  if (exact) return exact;

  const sameAddress = candidates.filter(
    (row) => row.ipAddress === device.ipAddress && row.ipAddress !== null,
  );
  const usable = sameAddress.filter((row) => {
    // The observation has no real hardware address, so it cannot contradict
    // whatever the record holds.
    if (!device.macAddress || device.macIsMasked) return true;
    // A record anchored to a real address must be that same device.
    if (identityBasis(row.identityKey) !== 'mac') return true;
    return row.macAddress === device.macAddress;
  });

  return usable.sort((left, right) => basisStrength(right.identityKey) - basisStrength(left.identityKey))[0];
}

/**
 * Fold away records that a stronger record supersedes.
 *
 * A device can end up with two records when the router and the neighbour
 * cache were read at a moment when the device held two addresses. Once a
 * record keyed by the real hardware address exists, the weakly anchored one
 * describes the same device and is folded into it, carrying the
 * administrator's decision and the original first-seen time with it.
 */
async function consolidateDuplicates(
  db: Database,
  keepId: string,
  candidates: (typeof devicesTable.$inferSelect)[],
  device: MergedDevice,
): Promise<void> {
  const superseded = candidates.filter(
    (row) =>
      row.id !== keepId &&
      identityBasis(row.identityKey) !== 'mac' &&
      row.ipAddress !== null &&
      row.ipAddress === device.ipAddress,
  );
  if (superseded.length === 0) return;

  const keep = candidates.find((row) => row.id === keepId);
  if (!keep) return;

  const merged = superseded.reduce(
    (accumulator, row) => ({
      isKnown: accumulator.isKnown || row.isKnown,
      firstSeenAt: accumulator.firstSeenAt < row.firstSeenAt ? accumulator.firstSeenAt : row.firstSeenAt,
    }),
    { isKnown: keep.isKnown, firstSeenAt: keep.firstSeenAt },
  );

  // The counter baseline travels with the record. A record that has never
  // been counted has no baseline of its own, so it inherits the most recent
  // one available — otherwise the traffic already counted against the
  // superseded record would be counted again against this one.
  const counted = [keep, ...superseded].filter(
    (row) => row.lastRxBytes !== null && row.lastTxBytes !== null,
  );
  const baseline = counted.reduce<(typeof devicesTable.$inferSelect) | null>((latest, row) => {
    if (!latest) return row;
    const latestAt = latest.lastCountersAt?.getTime() ?? 0;
    const rowAt = row.lastCountersAt?.getTime() ?? 0;
    return rowAt > latestAt ? row : latest;
  }, null);

  const update: Partial<typeof devicesTable.$inferInsert> = {
    isKnown: merged.isKnown,
    firstSeenAt: merged.firstSeenAt,
  };
  if (keep.lastRxBytes === null && baseline) {
    update.lastRxBytes = baseline.lastRxBytes;
    update.lastTxBytes = baseline.lastTxBytes;
    update.lastCountersAt = baseline.lastCountersAt;
  }

  await db.update(devicesTable).set(update).where(eq(devicesTable.id, keepId));

  for (const row of superseded) {
    // The measured history moves with the record. Deleting the row would
    // take its usage rows with it, and those rows are the only record of
    // the traffic the device actually moved.
    await moveUsageTo(db, keepId, row.id);
    await db.delete(devicesTable).where(eq(devicesTable.id, row.id));
  }
}

/**
 * Move the usage rows of one record onto another.
 *
 * Written as plain SQL because the move has to *add* the byte counts when
 * both records already hold a bucket for the same hour, which the query
 * builder cannot express.
 */
async function moveUsageTo(db: Database, keepId: string, fromId: string): Promise<void> {
  await db.execute(sql`
    INSERT INTO usage (device_id, bucket_start, upload_bytes, download_bytes, total_bytes)
    SELECT ${keepId}, bucket_start, upload_bytes, download_bytes, total_bytes
    FROM usage
    WHERE device_id = ${fromId}
    ON CONFLICT (device_id, bucket_start) DO UPDATE SET
      upload_bytes = usage.upload_bytes + EXCLUDED.upload_bytes,
      download_bytes = usage.download_bytes + EXCLUDED.download_bytes,
      total_bytes = usage.total_bytes + EXCLUDED.total_bytes
  `);
}

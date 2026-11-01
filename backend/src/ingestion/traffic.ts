import { identityBasis } from './identity.js';
import type { MergedDevice } from './merge.js';
import type { WrittenDevice } from './upsert.js';

/**
 * Matching the traffic counters of a poll onto the rows that hold them.
 *
 * The router counts traffic per client, but the inventory keys rows by
 * whatever identifier is strongest for a device, and those two are not the
 * same thing: a device seen through a masking router is keyed by the router's
 * client id even though its counters are real. The merge has already decided
 * which observations describe the same physical device, so all that is left
 * is to ask the upsert which row each merged device ended up in.
 */

/** A device's traffic counters, attributed to the row that holds them. */
export interface ObservedTraffic {
  /** The row the counters belong to. */
  deviceId: string;
  /** Cumulative bytes received by the device. */
  rxBytes: number;
  /** Cumulative bytes sent by the device. */
  txBytes: number;
  /** When the counters were read. */
  observedAt: Date;
}

/**
 * How strongly a device is identified.
 *
 * Used only to choose between two counter streams that claim the same row;
 * the row itself is chosen by the upsert.
 */
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

/**
 * Attribute a poll's traffic counters to the rows that hold them.
 *
 * A device with no counters is skipped: a source that cannot count traffic
 * has nothing to contribute, and treating "not counted" as "counted zero"
 * would quietly flatten the usage history.
 *
 * Two merged devices can end up on one row when the router and the
 * neighbour cache disagree about a device's address. Only one counter stream
 * can be right for that row, so the one anchored to the stronger identifier
 * wins — a hardware address identifies the device itself, while the router's
 * client id only identifies it for as long as it stays attached.
 */
export function attributeTraffic(
  merged: MergedDevice[],
  written: WrittenDevice[],
): ObservedTraffic[] {
  const rowByKey = new Map<string, string>();
  for (const entry of written) {
    rowByKey.set(entry.observationKey, entry.deviceId);
  }

  const chosen = new Map<string, { strength: number; entry: ObservedTraffic }>();
  for (const device of merged) {
    if (device.rxBytes === null || device.txBytes === null) continue;
    const deviceId = rowByKey.get(device.identityKey);
    if (!deviceId) continue;

    const strength = basisStrength(device.identityKey);
    const existing = chosen.get(deviceId);
    if (existing && existing.strength >= strength) continue;

    chosen.set(deviceId, {
      strength,
      entry: {
        deviceId,
        rxBytes: device.rxBytes,
        txBytes: device.txBytes,
        observedAt: device.observedAt ?? new Date(),
      },
    });
  }

  return [...chosen.values()].map((value) => value.entry);
}

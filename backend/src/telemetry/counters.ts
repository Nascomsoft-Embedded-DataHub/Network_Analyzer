/**
 * Turning the router's cumulative counters into consumption.
 *
 * The router reports the bytes a client has moved since it attached, not the
 * bytes it moved in the last interval. Consumption is therefore the
 * difference between two readings, and the arithmetic around that difference
 * is where a time series quietly goes wrong:
 *
 * - The first reading is a **baseline**, not consumption. It counts traffic
 *   from an unknown start — possibly since the router booted — and that
 *   traffic belongs to no particular hour. Recording it would put a spike
 *   into whichever bucket happened to be open.
 * - A counter that **goes backwards** means the client reattached and the
 *   router started counting again. The new reading is then the whole
 *   consumption since that reattachment.
 */

/** A pair of cumulative traffic counters. */
export interface Counters {
  /** Bytes received by the device. */
  rxBytes: number;
  /** Bytes sent by the device. */
  txBytes: number;
}

/** Traffic moved during one interval. */
export interface TrafficDelta {
  /** Bytes that reached the device. */
  downloadBytes: number;
  /** Bytes that left the device. */
  uploadBytes: number;
}

/**
 * The traffic a device moved between two readings.
 *
 * `previous` is `null` for the first reading of a device, which yields no
 * consumption — see the note above on baselines.
 */
export function trafficDelta(current: Counters, previous: Counters | null): TrafficDelta {
  if (previous === null) {
    return { downloadBytes: 0, uploadBytes: 0 };
  }

  return {
    // A counter that went backwards was reset by a reattachment, so
    // everything it holds now was moved since that reset.
    downloadBytes: current.rxBytes < previous.rxBytes ? current.rxBytes : current.rxBytes - previous.rxBytes,
    uploadBytes: current.txBytes < previous.txBytes ? current.txBytes : current.txBytes - previous.txBytes,
  };
}

/**
 * The start of the hour a moment falls in.
 *
 * Usage is aggregated into hourly buckets, so every reading within the same
 * hour lands on the same bucket start.
 */
export function hourBucket(at: Date): Date {
  const bucket = new Date(at);
  bucket.setUTCMinutes(0, 0, 0);
  return bucket;
}

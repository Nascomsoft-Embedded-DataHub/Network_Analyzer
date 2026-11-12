/**
 * Byte counts are stored and exchanged as plain integers, because a number is
 * what a spreadsheet, a chart and a database all agree on. The one place a
 * human reads a byte count is a sentence — an alert message, a CSV cell — and
 * there `5.00 GiB` says more than `5368709120`.
 *
 * The formatter is binary (KiB, MiB, GiB, TiB) because that is the ladder the
 * operating systems that report the counters use, and a report that says GiB
 * when the device's own interface says GB is a report nobody trusts.
 */
const UNITS = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'] as const;

/**
 * Renders a byte count for a human, e.g. `5.00 GiB`.
 *
 * Zero is written as `0 B` rather than `0.00 B`, and anything below a
 * kilobyte is written in whole bytes.
 */
export function humaniseBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';

  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }

  if (unit === 0) return `${Math.round(value)} ${UNITS[unit]}`;
  return `${value.toFixed(2)} ${UNITS[unit]}`;
}

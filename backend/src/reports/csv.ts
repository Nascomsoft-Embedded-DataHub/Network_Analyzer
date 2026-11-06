import { humaniseBytes } from '../format.js';
import type { UsageReport, UsageReportRow } from './usageReport.js';

/**
 * The CSV rendering of a consumption report.
 *
 * The audience is a person opening a spreadsheet, so the file carries both
 * the exact byte counts — which is what everything else in the system speaks
 * in — and the same numbers written the way a person reads them. The raw
 * figures are not rounded and the human ones are not a substitute for them;
 * they are two readings of the same row.
 *
 * Two details are worth knowing before opening one of these in Excel:
 *
 * - **A cell that begins with `=`, `+`, `-` or `@` is prefixed with an
 *   apostrophe.** A hostname is whatever the device on the network said it
 *   was, and a spreadsheet that treats a cell as a formula will run it. The
 *   prefix makes the cell text, which is what it is.
 * - **A cell containing a comma, a quote or a line break is quoted.** A
 *   hostname is free text from the network, and an unquoted comma would move
 *   every column after it.
 */
const COLUMNS = [
  'scope',
  'period_start',
  'period_end',
  'device',
  'ip_address',
  'upload_bytes',
  'upload_human',
  'download_bytes',
  'download_human',
  'total_bytes',
  'total_human',
] as const;

/** Characters a spreadsheet would read as the start of a formula. */
const FORMULA_START = /^[=+\-@\t\r]/;

/**
 * Renders a report as CSV text.
 *
 * The line endings are CRLF, which is what RFC 4180 specifies and what
 * spreadsheets expect; the file ends with a trailing newline so that
 * concatenating two reports does not run them together.
 */
export function renderUsageReportCsv(report: UsageReport): string {
  const lines = [COLUMNS.join(',')];

  for (const row of report.rows) {
    lines.push(cellsFor(row).join(','));
  }

  return `${lines.join('\r\n')}\r\n`;
}

/**
 * The filename the report is offered under.
 *
 * It carries the period and the window, so that a file that ends up in a
 * downloads folder can still be told apart from last week's.
 */
export function reportFilename(report: UsageReport): string {
  const from = report.from.slice(0, 10);
  const to = report.to.slice(0, 10);
  return `network-analyser-consumption-${report.period}-${from}-to-${to}.csv`;
}

/** The cells of one row, in the order of the header. */
function cellsFor(row: UsageReportRow): string[] {
  return [
    row.scope,
    row.periodStart,
    row.periodEnd,
    row.device ?? '',
    row.ipAddress ?? '',
    String(row.uploadBytes),
    humaniseBytes(row.uploadBytes),
    String(row.downloadBytes),
    humaniseBytes(row.downloadBytes),
    String(row.totalBytes),
    humaniseBytes(row.totalBytes),
  ].map(csvCell);
}

/** Quotes a cell if it needs quoting, and defuses a leading formula. */
function csvCell(value: string): string {
  const guarded = FORMULA_START.test(value) ? `'${value}` : value;
  const needsQuoting = guarded !== value || /[",\r\n]/.test(guarded);
  if (!needsQuoting) return guarded;
  return `"${guarded.replace(/"/g, '""')}"`;
}

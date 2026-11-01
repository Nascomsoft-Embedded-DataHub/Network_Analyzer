/**
 * Logging for the background telemetry jobs.
 *
 * The same shape the ingestion listener uses, so one logger can serve both
 * without either module depending on the other.
 */
export interface TelemetryLogger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string, error?: unknown): void;
}

export const consoleTelemetryLogger: TelemetryLogger = {
  info: (message) => console.log(message),
  warn: (message) => console.warn(message),
  error: (message, error) => console.error(message, error),
};

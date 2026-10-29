import { ApiRoutes } from '@network-analyser/contracts';
import { callApi, type CallOptions } from './client';
import type {
  AlertListQuery,
  DeviceListQuery,
  HealthListQuery,
  UsageListQuery,
  UsageTimelineQuery,
} from './types';

/**
 * Typed endpoint functions.
 *
 * Each one passes a route from the `ApiRoutes` registry to the client, so the
 * path, the method and the response type are all taken from the shared
 * contract rather than restated here.
 */

export function getSystemInfo(options: CallOptions = {}) {
  return callApi(ApiRoutes.system.info, options);
}

export function login(email: string, password: string) {
  return callApi(ApiRoutes.auth.login, { body: { email, password } });
}

export function getSession(options: CallOptions = {}) {
  return callApi(ApiRoutes.auth.session, options);
}

export function listDevices(query: DeviceListQuery = {}, options: CallOptions = {}) {
  return callApi(ApiRoutes.devices.list, { ...options, query });
}

export function getDevice(id: string, options: CallOptions = {}) {
  return callApi(ApiRoutes.devices.get, { ...options, params: { id } });
}

export function markDeviceKnown(id: string, isKnown: boolean, options: CallOptions = {}) {
  return callApi(ApiRoutes.devices.markKnown, { ...options, params: { id }, body: { isKnown } });
}

export function listUsage(query: UsageListQuery = {}, options: CallOptions = {}) {
  return callApi(ApiRoutes.usage.list, { ...options, query });
}

export function getUsageTimeline(query: UsageTimelineQuery = {}, options: CallOptions = {}) {
  return callApi(ApiRoutes.usage.timeline, { ...options, query });
}

export function getUsageSummary(
  deviceId: string,
  query: { from?: string; to?: string } = {},
  options: CallOptions = {},
) {
  return callApi(ApiRoutes.usage.summary, { ...options, query: { ...query, deviceId } });
}

export function listHealth(query: HealthListQuery = {}, options: CallOptions = {}) {
  return callApi(ApiRoutes.health.list, { ...options, query });
}

export function getHealthSnapshot(options: CallOptions = {}) {
  return callApi(ApiRoutes.health.snapshot, options);
}

export function listAlerts(query: AlertListQuery = {}, options: CallOptions = {}) {
  return callApi(ApiRoutes.alerts.list, { ...options, query });
}

export function acknowledgeAlert(id: string, options: CallOptions = {}) {
  return callApi(ApiRoutes.alerts.acknowledge, { ...options, params: { id }, body: { acknowledged: true } });
}

export function listAlertRules(options: CallOptions = {}) {
  return callApi(ApiRoutes.alerts.rules, options);
}

export function upsertAlertRule(
  rule: { type: string; enabled: boolean; thresholdBytes?: number | null; severity: string },
  options: CallOptions = {},
) {
  return callApi(ApiRoutes.alerts.upsertRule, { ...options, body: rule });
}

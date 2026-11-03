import type { Device } from '@network-analyser/contracts';

/**
 * The name to show for a device.
 *
 * The contract has no administrator-set name — the closest it comes is the
 * hostname the discovery algorithm derives — so the fallbacks are hostname,
 * then vendor, then the hardware address.
 */
export function deviceDisplayName(device: Device): string {
  return device.hostname ?? device.vendor ?? device.macAddress ?? device.identityKey;
}

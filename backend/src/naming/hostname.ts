import { macShortId } from '../discovery/address.js';

/**
 * Turning what a source knows about a client into a name a human recognises.
 *
 * The router reports the name the device asked for over DHCP, which is
 * usually the right answer. When it does not, the fallback leans on the
 * hardware vendor and a short piece of the address, so two devices from the
 * same vendor still end up with different names.
 */

/** Longest name a DHCP client may ask for. */
const MAX_HOSTNAME_LENGTH = 63;

/**
 * Corporate suffixes that carry no meaning in a device label.
 *
 * Stripping them keeps the fallback short: "Samsung Electronics Co.,Ltd"
 * becomes "samsung-electronics", not "samsung-electronics-coltd".
 */
const VENDOR_SUFFIXES = [
  /,?\s*co\.?\s*,?\s*ltd\.?$/i,
  /,?\s*co\.?,?\s*limited$/i,
  /,?\s*incorporated$/i,
  /,?\s*corporation$/i,
  /,?\s*corp\.?$/i,
  /,?\s*company$/i,
  /,?\s*limited$/i,
  /,?\s*ltd\.?$/i,
  /,?\s*llc$/i,
  /,?\s*inc\.?$/i,
  /,?\s*plc$/i,
  /,?\s*gmbh$/i,
  /,?\s*b\.?v\.?$/i,
  /,?\s*s\.?a\.?$/i,
];

/** Remove the corporate suffix from a registry vendor name. */
export function stripVendorSuffix(vendor: string | null): string | null {
  if (!vendor) return null;
  let stripped = vendor.trim();
  for (const pattern of VENDOR_SUFFIXES) {
    const next = stripped.replace(pattern, '').trim();
    if (next !== stripped) {
      stripped = next;
    }
  }
  return stripped.length > 0 ? stripped : vendor.trim();
}

/**
 * Reduce a name to the shape a DHCP client would use.
 *
 * Lower case, hyphen separated, no leading or trailing hyphen. A name that
 * reduces to nothing is rejected, so the caller can fall back.
 */
export function slugify(value: string | null | undefined): string | null {
  if (!value) return null;
  const slug = value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return slug.length > 0 ? slug : null;
}

/** Shorten a name to what a DHCP client may ask for. */
export function truncateHostname(value: string): string {
  if (value.length <= MAX_HOSTNAME_LENGTH) return value;
  return value.slice(0, MAX_HOSTNAME_LENGTH).replace(/-+$/, '');
}

export interface NamingInput {
  /** The name the source reports, typically the DHCP hostname. */
  reportedName: string | null;
  /** Vendor resolved from the OUI, when known. */
  vendor: string | null;
  /** Hardware address, when known. */
  macAddress: string | null;
  /** True when the address has been masked to its vendor OUI. */
  macIsMasked: boolean;
  /** The router's own client id, used when the address cannot discriminate. */
  routerClientId: number | null;
}

/**
 * The short discriminator that keeps two devices apart in a fallback name.
 *
 * The last three octets of the address are used when the address is real.
 * A masked address ends in zeroes and would give every device of that vendor
 * the same suffix, so the router's client id is used instead.
 */
function shortDiscriminator(input: NamingInput): string | null {
  if (!input.macIsMasked && input.routerClientId === null) {
    const short = macShortId(input.macAddress);
    if (short) return slugify(short);
  }
  if (input.routerClientId !== null) return String(input.routerClientId);
  const short = macShortId(input.macAddress);
  return short ? slugify(short) : null;
}

/**
 * The friendly name for a device.
 *
 * The reported name wins, because it is what the owner of the device calls
 * it. The fallbacks exist for the devices that never asked for a name.
 */
export function deriveHostname(input: NamingInput): string {
  const reported = slugify(input.reportedName);
  if (reported) return truncateHostname(reported);

  const vendorSlug = slugify(stripVendorSuffix(input.vendor));
  const discriminator = shortDiscriminator(input);
  const base = vendorSlug ?? 'unknown-device';
  return truncateHostname(discriminator ? `${base}-${discriminator}` : base);
}

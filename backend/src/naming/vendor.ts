import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

import { macOui } from '../discovery/address.js';

/**
 * Hardware vendor resolution from the OUI of a MAC address.
 *
 * The IEEE registry is bundled locally rather than fetched, so the analyser
 * keeps working on a network with no route to the internet — which is the
 * normal case for a Starlink link that has just come up, and exactly the
 * moment a dashboard most wants to answer.
 */

const require = createRequire(import.meta.url);

/** OUI prefix (six hex digits) to the registry entry for that vendor. */
export type OuiTable = Record<string, string>;

let cachedTable: OuiTable | null = null;

/**
 * Read the bundled registry.
 *
 * The file is several megabytes of JSON, so it is read and parsed once, on
 * first use, rather than at import time.
 */
export function loadOuiTable(): OuiTable {
  if (cachedTable) return cachedTable;
  const path = require.resolve('oui-data');
  cachedTable = JSON.parse(readFileSync(path, 'utf8')) as OuiTable;
  return cachedTable;
}

/**
 * The vendor name for a MAC, or `null` when the prefix is not registered.
 *
 * A registry entry holds several lines — the vendor, then an address. Only
 * the first line names the vendor.
 */
export function lookupVendor(table: OuiTable, mac: string | null): string | null {
  const oui = macOui(mac);
  if (!oui) return null;
  const entry = table[oui];
  if (!entry) return null;
  const firstLine = entry.split('\n')[0]?.trim();
  return firstLine && firstLine.length > 0 ? firstLine : null;
}

/** A vendor lookup bound to a registry. */
export interface VendorLookup {
  (mac: string | null): string | null;
}

/** A lookup against the bundled IEEE registry. */
export function createVendorLookup(table: OuiTable = loadOuiTable()): VendorLookup {
  return (mac: string | null) => lookupVendor(table, mac);
}

import { describe, expect, it } from 'vitest';

import { deriveHostname, slugify, stripVendorSuffix } from '../src/naming/hostname.js';
import { lookupVendor } from '../src/naming/vendor.js';

describe('slugify', () => {
  it('reduces a name to the form a DHCP client would use', () => {
    expect(slugify('Living Room TV')).toBe('living-room-tv');
    expect(slugify('ike-work-laptop')).toBe('ike-work-laptop');
    expect(slugify('HP OfficeJet 3830')).toBe('hp-officejet-3830');
  });

  it('rejects a name that reduces to nothing', () => {
    expect(slugify('---')).toBeNull();
    expect(slugify('')).toBeNull();
    expect(slugify(null)).toBeNull();
  });
});

describe('stripVendorSuffix', () => {
  it('removes the corporate suffix from a registry name', () => {
    expect(stripVendorSuffix('Apple, Inc.')).toBe('Apple');
    expect(stripVendorSuffix('Samsung Electronics Co.,Ltd')).toBe('Samsung Electronics');
    expect(stripVendorSuffix('TP-Link Systems Inc.')).toBe('TP-Link Systems');
    expect(stripVendorSuffix('Raspberry Pi Foundation')).toBe('Raspberry Pi Foundation');
  });
});

describe('deriveHostname', () => {
  it('prefers the name the device asked for', () => {
    expect(
      deriveHostname({
        reportedName: 'living-room-tv',
        vendor: 'Samsung Electronics Co.,Ltd',
        macAddress: 'AA:BB:CC:77:88:99',
        macIsMasked: false,
        routerClientId: 13,
      }),
    ).toBe('living-room-tv');
  });

  it('falls back to the vendor and the tail of the address', () => {
    expect(
      deriveHostname({
        reportedName: null,
        vendor: 'Apple, Inc.',
        macAddress: 'AA:BB:CC:11:22:33',
        macIsMasked: false,
        routerClientId: null,
      }),
    ).toBe('apple-11-22-33');
  });

  it('uses the router client id when the address has been masked', () => {
    expect(
      deriveHostname({
        reportedName: null,
        vendor: 'Govee',
        macAddress: '7C:A6:B6:00:00:00',
        macIsMasked: true,
        routerClientId: 21,
      }),
    ).toBe('govee-21');
  });

  it('names a device with nothing known about it', () => {
    expect(
      deriveHostname({
        reportedName: null,
        vendor: null,
        macAddress: null,
        macIsMasked: false,
        routerClientId: null,
      }),
    ).toBe('unknown-device');
  });

  it('keeps the name within the length a DHCP client may ask for', () => {
    const name = deriveHostname({
      reportedName: 'a'.repeat(200),
      vendor: null,
      macAddress: null,
      macIsMasked: false,
      routerClientId: null,
    });
    expect(name.length).toBeLessThanOrEqual(63);
  });
});

describe('lookupVendor', () => {
  const table = {
    '58044F': 'TP-Link Systems Inc.',
    '001B44': 'PRIVATE',
  };

  it('reads the vendor from the OUI', () => {
    expect(lookupVendor(table, '58:04:4F:AA:0B:9D')).toBe('TP-Link Systems Inc.');
  });

  it('takes only the first line of a registry entry', () => {
    const multi = { 'AABBCC': 'Acme Corporation\n1 Acme Way\nSpringfield' };
    expect(lookupVendor(multi, 'AA:BB:CC:00:00:01')).toBe('Acme Corporation');
  });

  it('returns nothing for an unregistered prefix', () => {
    expect(lookupVendor(table, 'FF:FF:FF:00:00:01')).toBeNull();
    expect(lookupVendor(table, null)).toBeNull();
  });
});

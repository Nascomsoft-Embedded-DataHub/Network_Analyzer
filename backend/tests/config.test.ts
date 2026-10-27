import { describe, expect, it } from 'vitest';
import { corsOrigins, exposureWarning, isLoopback, loadConfig } from '../src/config.js';

describe('loadConfig', () => {
  it('applies development defaults when no environment is set', () => {
    const config = loadConfig({});
    expect(config.NODE_ENV).toBe('development');
    expect(config.PORT).toBe(3000);
    expect(config.DATABASE_URL).toContain('network_analyser');
  });

  it('binds to loopback by default so the API is not exposed to the LAN', () => {
    expect(loadConfig({}).HOST).toBe('127.0.0.1');
  });

  it('coerces PORT from a string', () => {
    const config = loadConfig({ PORT: '8080' });
    expect(config.PORT).toBe(8080);
  });

  it('rejects a non-numeric PORT', () => {
    expect(() => loadConfig({ PORT: 'not-a-port' })).toThrow();
  });

  it('rejects a DATABASE_URL that is not a URL', () => {
    expect(() => loadConfig({ DATABASE_URL: 'not-a-url' })).toThrow();
  });
});

describe('isLoopback', () => {
  it('recognises loopback addresses', () => {
    expect(isLoopback('127.0.0.1')).toBe(true);
    expect(isLoopback('127.0.0.2')).toBe(true);
    expect(isLoopback('localhost')).toBe(true);
    expect(isLoopback('::1')).toBe(true);
  });

  it('does not treat a routable address as loopback', () => {
    expect(isLoopback('0.0.0.0')).toBe(false);
    expect(isLoopback('192.168.1.24')).toBe(false);
  });
});

describe('exposureWarning', () => {
  it('stays silent when bound to loopback', () => {
    expect(exposureWarning(loadConfig({}))).toBeNull();
  });

  it('warns when the API is reachable from the network', () => {
    const warning = exposureWarning(loadConfig({ HOST: '0.0.0.0' }));
    expect(warning).toContain('0.0.0.0');
    expect(warning).toContain('authentication');
  });
});

describe('corsOrigins', () => {
  it('splits a comma-separated list and trims whitespace', () => {
    const config = loadConfig({ CORS_ORIGIN: 'http://a.test, http://b.test ,http://c.test' });
    expect(corsOrigins(config)).toEqual(['http://a.test', 'http://b.test', 'http://c.test']);
  });

  it('drops empty entries from a trailing comma', () => {
    const config = loadConfig({ CORS_ORIGIN: 'http://a.test,' });
    expect(corsOrigins(config)).toEqual(['http://a.test']);
  });
});

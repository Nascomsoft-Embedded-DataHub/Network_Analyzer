import { describe, expect, it } from 'vitest';
import { corsOrigins, loadConfig } from '../src/config.js';

describe('loadConfig', () => {
  it('applies development defaults when no environment is set', () => {
    const config = loadConfig({});
    expect(config.NODE_ENV).toBe('development');
    expect(config.PORT).toBe(3000);
    expect(config.DATABASE_URL).toContain('network_analyser');
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

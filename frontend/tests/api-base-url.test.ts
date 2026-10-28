import { beforeEach, describe, expect, it } from 'vitest';
import {
  API_BASE_URL_STORAGE_KEY,
  DEFAULT_API_BASE_URL,
  clearApiBaseUrl,
  isValidBaseUrl,
  normalizeBaseUrl,
  readApiBaseUrl,
  writeApiBaseUrl,
} from '@/state/apiConfig';

describe('API base URL persistence', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('falls back to the laptop default when nothing is stored', () => {
    expect(readApiBaseUrl()).toBe(DEFAULT_API_BASE_URL);
  });

  it('persists the address the administrator entered', () => {
    writeApiBaseUrl('http://192.168.1.24:3000');

    expect(window.localStorage.getItem(API_BASE_URL_STORAGE_KEY)).toBe('http://192.168.1.24:3000');
    expect(readApiBaseUrl()).toBe('http://192.168.1.24:3000');
  });

  it('survives a restart of the browser', () => {
    writeApiBaseUrl('http://192.168.1.24:3000');
    // A reload clears nothing but re-reads the store from scratch.
    expect(readApiBaseUrl()).toBe('http://192.168.1.24:3000');
  });

  it('strips a trailing slash so paths can be appended', () => {
    writeApiBaseUrl('http://192.168.1.24:3000/');
    expect(readApiBaseUrl()).toBe('http://192.168.1.24:3000');
  });

  it('ignores a stored value that is not a usable address', () => {
    window.localStorage.setItem(API_BASE_URL_STORAGE_KEY, 'not-an-address');
    expect(readApiBaseUrl()).toBe(DEFAULT_API_BASE_URL);
  });

  it('returns to the default when the override is cleared', () => {
    writeApiBaseUrl('http://192.168.1.24:3000');
    clearApiBaseUrl();
    expect(readApiBaseUrl()).toBe(DEFAULT_API_BASE_URL);
  });

  it('accepts http and https addresses only', () => {
    expect(isValidBaseUrl('http://localhost:3000')).toBe(true);
    expect(isValidBaseUrl('https://analyser.local:3000')).toBe(true);
    expect(isValidBaseUrl('localhost:3000')).toBe(false);
    expect(isValidBaseUrl('ftp://localhost:3000')).toBe(false);
    expect(isValidBaseUrl('')).toBe(false);
  });

  it('normalises whitespace and trailing slashes together', () => {
    expect(normalizeBaseUrl('  http://192.168.1.24:3000//  ')).toBe('http://192.168.1.24:3000');
  });
});

import { ApiRoutes } from '@network-analyser/contracts';
import { describe, expect, it } from 'vitest';
import { mockRouteKeys } from '@/api/mock';

function registryRouteKeys(): string[] {
  const keys: string[] = [];
  for (const group of Object.values(ApiRoutes)) {
    for (const route of Object.values(group as Record<string, { method: string; path: string }>)) {
      keys.push(`${route.method} ${route.path}`);
    }
  }
  return keys;
}

/**
 * The frontend builds every screen against the contract registry, so the mock
 * router has to answer for every route in it. A route added on the backend
 * without a matching fixture fails here rather than on screen.
 */
describe('mock router coverage', () => {
  it('answers for every route in the ApiRoutes registry', () => {
    expect(new Set(mockRouteKeys())).toEqual(new Set(registryRouteKeys()));
  });
});

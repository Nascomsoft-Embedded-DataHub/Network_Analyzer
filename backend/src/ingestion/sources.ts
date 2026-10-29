import type { Config } from '../config.js';
import { discoverySources } from '../config.js';
import { NeighbourCacheSource } from '../discovery/neighbourCache.js';
import { SimulatedSource } from '../discovery/simulator.js';
import { StarlinkRouterSource } from '../discovery/starlinkRouter.js';
import type { DiscoverySource } from '../discovery/types.js';

/**
 * Building the discovery sources named in the configuration.
 *
 * A source named in configuration but not implemented here is a mistake in
 * the configuration rather than a reason to refuse to start, so it is
 * reported and skipped.
 */
export function createDiscoverySources(
  config: Config,
  warn: (message: string) => void = (message) => console.warn(message),
): DiscoverySource[] {
  const sources: DiscoverySource[] = [];

  for (const name of discoverySources(config)) {
    switch (name) {
      case 'neighbour-cache':
        sources.push(new NeighbourCacheSource());
        break;
      case 'starlink-router':
        sources.push(
          new StarlinkRouterSource({
            host: config.STARLINK_ROUTER_HOST,
            port: config.STARLINK_ROUTER_PORT,
          }),
        );
        break;
      case 'simulated':
        sources.push(new SimulatedSource());
        break;
      default:
        warn(`unknown discovery source "${name}"; ignoring it`);
    }
  }

  return sources;
}

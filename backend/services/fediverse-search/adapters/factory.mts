import type {
  FediverseProviderAdapter,
  FediverseSearchBucket,
  FediverseSearchOptions,
  FediverseSearchProvider,
} from '../types.mts'
import { ValkeyCache } from '@data-stores/valkey/cache'
import { HTTP_CACHE_SHORT_MAX_AGE_SECONDS } from '@voucha/config'
import onError from '@modules/on-error'
import { stableSerialize } from '@services/entity-cache'
import { createBlueskyAdapter } from './bluesky.mts'
import { createLemmyAdapter } from './lemmy.mts'
import { createMastodonAdapter } from './mastodon.mts'
import { createPeerTubeAdapter } from './peertube.mts'

export function createFediverseAdapters(): Record<
  FediverseSearchProvider,
  FediverseProviderAdapter
> {
  return {
    peertube: cacheAdapter(createPeerTubeAdapter()),
    mastodon: cacheAdapter(createMastodonAdapter()),
    lemmy: cacheAdapter(createLemmyAdapter()),
    bluesky: cacheAdapter(createBlueskyAdapter()),
  }
}

// Only `ok` buckets are cached — caching `partial`/`error` buckets would replay a
// transient provider outage to every caller until the TTL expires.
export function cacheAdapter(adapter: FediverseProviderAdapter): FediverseProviderAdapter {
  const cache = new ValkeyCache<string>({
    prefix: `fediverse-search:${adapter.provider}`,
    ttlSeconds: HTTP_CACHE_SHORT_MAX_AGE_SECONDS,
    mode: 'json',
  })

  return {
    provider: adapter.provider,
    async search(options: FediverseSearchOptions): Promise<FediverseSearchBucket> {
      const key = stableSerialize(options)
      const cached = (await cache.get(key).catch((error: unknown) => {
        onError(error as Error)
        return null
      })) as FediverseSearchBucket | null
      if (cached) return cached

      const bucket = await adapter.search(options)
      if (bucket.status === 'ok') {
        void cache.set(key, bucket).catch(onError)
      }
      return bucket
    },
  }
}

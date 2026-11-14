import { primaryCacheValkeyClient } from '@data-stores/valkey/clients'
import { ValkeyCache } from '@data-stores/valkey/cache'
import { getAnonymousCacheGeneration } from '../services/entity-cache/anonymous-cache-generation.mts'
import { getRssSnapshotLegalGeneration } from '../services/entity-cache/rss-snapshot-generation.mts'
import { serializeSearchCacheKey } from '../services/entity-cache/search-cache.mts'
import { SEARCH_CACHE_TTL_SECONDS } from '../services/entity-cache/search-cache-ttl.mts'

/** Evict only the measured input's key so repeated EXPLAIN runs capture a real RSS fill. */
export async function clearTestRssSnapshotCacheKey(postIds: string[]): Promise<void> {
  const [generation, legalGeneration] = await Promise.all([
    getAnonymousCacheGeneration(),
    getRssSnapshotLegalGeneration(),
  ])
  const key = serializeSearchCacheKey({ generation, options: { postIds, legalGeneration } })
  const cache = new ValkeyCache<string>({
    prefix: 'rss_public_post_snapshots_anon',
    ttlSeconds: SEARCH_CACHE_TTL_SECONDS,
    client: primaryCacheValkeyClient,
  })
  await cache.delete(key)
}

import { ValkeyBloomFilter, bloomValkeyClient } from '@data-stores/valkey'
import { bloomFilterConfig } from '@services/bloom-filter-config'

// Whether the entity-cache bloom filters may be trusted for short-circuit decisions.
// Disabled in tests: bloom filters are global Redis keys and interfere with concurrent test
// files in the same shard that create entities after the backfill snapshot was taken. When
// disabled, callers must confirm against the DB instead of trusting a bloom miss.
export function entityCacheBloomFilterEnabled(): boolean {
  if (process.env.NODE_ENV === 'test') return false
  return bloomFilterConfig.getFields().entityCacheBloomFilterEnabled as boolean
}

// These bloom filter instances are used in three ways:
// 1. In backfill-bloom-filter.mts, for backfill/warmup operations (rebuild, backfill).
//    warmUpEntityCacheBloomFilters() only enqueues the backfill job; the filter key does
//    not exist until rebuildFromStream completes its atomic RENAME. During the backfill
//    window, ValkeyCache reads fall back to the DB because the live key is absent (correct
//    behavior, no 404s).
// 2. In caches.mts, passed to ValkeyCache so the Lua get scripts can check existence inline
// 3. In entity create/upsert services to populate the filter at write time via .add()
export const entityCacheBloomFilters = {
  // concurrencyLimit: cap in-flight write chunks during bulk rebuilds in the bloom-filters worker.
  // posts (1M) and rss_feed_items (5M) use half the default (8 vs 16) to limit worker Valkey pressure.
  posts: new ValkeyBloomFilter({
    name: 'posts',
    capacity: 1_000_000,
    errorRate: 0.01,
    concurrencyLimit: 8,
    client: bloomValkeyClient,
  }),
  topics: new ValkeyBloomFilter({
    name: 'topics',
    capacity: 100_000,
    errorRate: 0.01,
    client: bloomValkeyClient,
  }),
  users: new ValkeyBloomFilter({
    name: 'users',
    capacity: 100_000,
    errorRate: 0.01,
    client: bloomValkeyClient,
  }),
  communities: new ValkeyBloomFilter({
    name: 'communities',
    capacity: 100_000,
    errorRate: 0.01,
    client: bloomValkeyClient,
  }),
  rss_feed_items: new ValkeyBloomFilter({
    name: 'rss_feed_items',
    capacity: 5_000_000,
    errorRate: 0.01,
    concurrencyLimit: 8,
    client: bloomValkeyClient,
  }),
}

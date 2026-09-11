import { createHash } from 'node:crypto'
import { ValkeyCache } from '@data-stores/valkey/cache'
import { CACHE_TTLS_SECONDS } from './config.mts'
import { entityCacheBloomFilters, entityCacheBloomFilterEnabled } from './backfill-bloom-filter.mts'

const PUBLIC_USER_SHAPE_CACHE_VERSION = 'v2'

export const caches = {
  users_private: new ValkeyCache({
    prefix: 'users_private',
    ttlSeconds: CACHE_TTLS_SECONDS.users_private,
    bloomFilter: entityCacheBloomFilters.users,
    bloomFilterEnabled: entityCacheBloomFilterEnabled,
  }),
  users_public: new ValkeyCache({
    prefix: `users_public:${PUBLIC_USER_SHAPE_CACHE_VERSION}`,
    ttlSeconds: CACHE_TTLS_SECONDS.users_public,
    bloomFilter: entityCacheBloomFilters.users,
    bloomFilterEnabled: entityCacheBloomFilterEnabled,
  }),
  users_lookup: new ValkeyCache({
    prefix: 'users_lookup',
    ttlSeconds: CACHE_TTLS_SECONDS.users_lookup,
  }),
  user_metrics: new ValkeyCache({
    prefix: 'user_metrics',
    ttlSeconds: CACHE_TTLS_SECONDS.user_metrics,
  }),
  topics: new ValkeyCache({
    prefix: `topics:${PUBLIC_USER_SHAPE_CACHE_VERSION}`,
    ttlSeconds: CACHE_TTLS_SECONDS.topics,
    bloomFilter: entityCacheBloomFilters.topics,
    bloomFilterEnabled: entityCacheBloomFilterEnabled,
  }),
  topics_with_redirect: new ValkeyCache({
    prefix: `topics_with_redirect:${PUBLIC_USER_SHAPE_CACHE_VERSION}`,
    ttlSeconds: CACHE_TTLS_SECONDS.topics_with_redirect,
    bloomFilter: entityCacheBloomFilters.topics,
    bloomFilterEnabled: entityCacheBloomFilterEnabled,
  }),
  topics_lookup: new ValkeyCache({
    prefix: 'topics_lookup',
    ttlSeconds: CACHE_TTLS_SECONDS.topics_lookup,
  }),
  topic_metrics: new ValkeyCache({
    prefix: 'topic_metrics',
    ttlSeconds: CACHE_TTLS_SECONDS.topic_metrics,
  }),
  topic_elections: new ValkeyCache({
    prefix: 'topic_elections',
    ttlSeconds: CACHE_TTLS_SECONDS.topic_elections,
  }),
  agent_moderation_elections: new ValkeyCache({
    prefix: 'agent_moderation_elections',
    ttlSeconds: CACHE_TTLS_SECONDS.agent_moderation_elections,
  }),
  entity_relation_elections: new ValkeyCache({
    prefix: 'entity_relation_elections',
    ttlSeconds: CACHE_TTLS_SECONDS.entity_relation_elections,
  }),
  posts: new ValkeyCache({
    prefix: `posts:${PUBLIC_USER_SHAPE_CACHE_VERSION}`,
    ttlSeconds: CACHE_TTLS_SECONDS.posts,
    bloomFilter: entityCacheBloomFilters.posts,
    bloomFilterEnabled: entityCacheBloomFilterEnabled,
  }),
  posts_lookup: new ValkeyCache({
    prefix: 'posts_lookup',
    ttlSeconds: CACHE_TTLS_SECONDS.posts_lookup,
  }),
  post_metrics: new ValkeyCache({
    prefix: 'post_metrics',
    ttlSeconds: CACHE_TTLS_SECONDS.post_metrics,
  }),
  post_elections: new ValkeyCache({
    prefix: 'post_elections',
    ttlSeconds: CACHE_TTLS_SECONDS.post_elections,
  }),
  rss_feeds: new ValkeyCache({ prefix: 'rss_feeds', ttlSeconds: CACHE_TTLS_SECONDS.rss_feeds }),
  rss_feed_items: new ValkeyCache({
    prefix: 'rss_feed_items',
    ttlSeconds: CACHE_TTLS_SECONDS.rss_feed_items,
    bloomFilter: entityCacheBloomFilters.rss_feed_items,
    bloomFilterEnabled: entityCacheBloomFilterEnabled,
  }),
  rss_feed_item_elections: new ValkeyCache({
    prefix: 'rss_feed_item_elections',
    ttlSeconds: CACHE_TTLS_SECONDS.rss_feed_item_elections,
  }),
  urls: new ValkeyCache({
    prefix: 'urls',
    ttlSeconds: CACHE_TTLS_SECONDS.urls,
    // URL paths are case-sensitive; SHA-256 hashing prevents collisions from ValkeyCache's
    // default toLowerCase() normalization (e.g. /Path and /path must be distinct cache keys).
    keySerializer: (key: string) => createHash('sha256').update(key.trim()).digest('hex'),
  }),
  urls_lookup: new ValkeyCache({
    prefix: 'urls_lookup',
    ttlSeconds: CACHE_TTLS_SECONDS.urls_lookup,
    // URL paths are case-sensitive. normalizeUrlForCache preserves path case, and SHA-256
    // hashing the key ensures case-distinct paths (e.g. /Path vs /path) don't collide in cache.
    keySerializer: (key: string) => createHash('sha256').update(key.trim()).digest('hex'),
  }),
  url_hostnames: new ValkeyCache({
    prefix: 'url_hostnames',
    ttlSeconds: CACHE_TTLS_SECONDS.url_hostnames,
  }),
  hostname_elections: new ValkeyCache({
    prefix: 'hostname_elections',
    ttlSeconds: CACHE_TTLS_SECONDS.hostname_elections,
  }),
}

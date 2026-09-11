import {
  getUserCacheKeys,
  getTopicCacheKeys,
  getPostCacheKeys,
  getCommunityCacheKeys,
  getElectionCacheKeys,
  getRssFeedItemCacheKeys,
  getRssFeedCacheKeys,
  getListCacheKeys,
  getStoryCacheKeys,
  getUrlCacheKeys,
  getUrlLookupKeys,
  getUrlHostnameCacheKeys,
  getCacheKeys,
} from './keys.mts'
import { ValkeyCache } from '@data-stores/valkey/cache'
import { retryCacheSaturation } from '@data-stores/valkey/retry-saturation'
import { caches } from './caches.mts'
import onError from '@modules/on-error'
import { enqueueBulkPurgeCacheTags } from '@queues/cache-purge/enqueues'
import {
  postTag,
  topicTag,
  userTag,
  communityTag,
  listTag,
  storyTag,
  hostnameTag,
  rssFeedTag,
  rssFeedItemTag,
  SITEMAP_TAG,
  HTML_TAG,
} from '@ts-shared/cache'

type InvalidateFunction = (...keys: unknown[]) => Promise<void>
type CacheDeleteGroups = Parameters<typeof ValkeyCache.deleteFromCaches>[0]

const CACHE_DELETE_KEYS_PER_BATCH = 500

export const invalidate = {
  users: wrap(async (...keys: unknown[]): Promise<void> => {
    // getUserCacheKeys returns both UUIDs and usernames. We pass only the slug (username)
    // portion to users_lookup, which never keys on UUIDs. Input slugs are preserved in
    // userKeys even when the user no longer exists in the DB, so deleted usernames are
    // still invalidated.
    const userKeys = await getUserCacheKeys(...keys)
    await deleteFromCachesInChunks([
      { cache: caches.users_private, keys: userKeys },
      { cache: caches.users_public, keys: userKeys },
      { cache: caches.users_lookup, keys: [...getCacheKeys(userKeys).slugs] },
    ])
    void enqueueBulkPurgeCacheTags(userKeys.map(userTag))
  }),
  topics: wrap(async (...keys: unknown[]): Promise<void> => {
    // Topic lookup caches UUIDs, slugs, and aliases because merged source UUIDs redirect
    // through the lookup layer. Input slugs are preserved in topicKeys even when the
    // topic/alias no longer exists in the DB, so deleted aliases are still invalidated.
    const topicKeys = await getTopicCacheKeys(...keys)
    await deleteFromCachesInChunks([
      { cache: caches.topics, keys: topicKeys },
      { cache: caches.topics_with_redirect, keys: topicKeys },
      { cache: caches.topics_lookup, keys: topicKeys },
    ])
    void enqueueBulkPurgeCacheTags(topicKeys.map(topicTag))
  }),
  topic_metrics: wrap(async (...keys: unknown[]): Promise<void> => {
    const topicKeys = await getTopicCacheKeys(...keys)
    await caches.topic_metrics.invalidateCacheGetByAny(...topicKeys)
  }),
  topic_elections: wrap(async (...keys: unknown[]): Promise<void> => {
    const topicKeys = await getTopicCacheKeys(...keys)
    await caches.topic_elections.invalidateCacheGetByAny(...topicKeys)
  }),
  agent_moderation_elections: wrap(async (...keys: unknown[]): Promise<void> => {
    const electionKeys = await getElectionCacheKeys(...keys)
    await caches.agent_moderation_elections.invalidateCacheGetByAny(...electionKeys)
  }),
  entity_relation_elections: wrap(async (...keys: unknown[]): Promise<void> => {
    const electionKeys = await getElectionCacheKeys(...keys)
    await deleteFromCachesInChunks([
      { cache: caches.entity_relation_elections, keys: electionKeys },
    ])
  }),
  posts: wrap(async (...keys: unknown[]): Promise<void> => {
    // getPostCacheKeys returns both UUIDs and slugs. We pass only the slug portion to
    // posts_lookup, which never keys on UUIDs. Input slugs are preserved in postKeys
    // even when the post no longer exists in the DB, so deleted slugs are still invalidated.
    const postKeys = await getPostCacheKeys(...keys)
    await deleteFromCachesInChunks([
      { cache: caches.posts, keys: postKeys },
      { cache: caches.posts_lookup, keys: [...getCacheKeys(postKeys).slugs] },
    ])
    void enqueueBulkPurgeCacheTags(postKeys.map(postTag))
  }),
  communities: wrap(async (...keys: unknown[]): Promise<void> => {
    const communityKeys = await getCommunityCacheKeys(...keys)
    void enqueueBulkPurgeCacheTags([...communityKeys.map(communityTag), HTML_TAG])
  }),
  lists: wrap(async (...keys: unknown[]): Promise<void> => {
    const listKeys = await getListCacheKeys(...keys)
    void enqueueBulkPurgeCacheTags([...listKeys.map(listTag), HTML_TAG])
  }),
  stories: wrap(async (...keys: unknown[]): Promise<void> => {
    const storyKeys = await getStoryCacheKeys(...keys)
    void enqueueBulkPurgeCacheTags(storyKeys.map(storyTag))
  }),
  sitemaps: wrap(async (): Promise<void> => {
    void enqueueBulkPurgeCacheTags([SITEMAP_TAG])
  }),
  html: wrap(async (): Promise<void> => {
    void enqueueBulkPurgeCacheTags([HTML_TAG])
  }),
  post_metrics: wrap(async (...keys: unknown[]): Promise<void> => {
    const postKeys = await getPostCacheKeys(...keys)
    await caches.post_metrics.invalidateCacheGetByAny(...postKeys)
  }),
  post_elections: wrap(async (...keys: unknown[]): Promise<void> => {
    const postKeys = await getPostCacheKeys(...keys)
    await caches.post_elections.invalidateCacheGetByAny(...postKeys)
  }),
  user_metrics: wrap(async (...keys: unknown[]): Promise<void> => {
    const userKeys = await getUserCacheKeys(...keys)
    await caches.user_metrics.invalidateCacheGetByAny(...userKeys)
  }),
  // rss_feed_items bloom filter is populated in services/rss-feed-items/upsert.mts at write time.
  rss_feed_items: wrap(async (...keys: unknown[]): Promise<void> => {
    const rssFeedItemKeys = await getRssFeedItemCacheKeys(...keys)
    await caches.rss_feed_items.invalidateCacheGetByAny(...rssFeedItemKeys)
    void enqueueBulkPurgeCacheTags(rssFeedItemKeys.map(rssFeedItemTag))
  }),
  rss_feed_item_elections: wrap(async (...keys: unknown[]): Promise<void> => {
    const rssFeedItemKeys = await getRssFeedItemCacheKeys(...keys)
    await caches.rss_feed_item_elections.invalidateCacheGetByAny(...rssFeedItemKeys)
  }),
  rss_feeds: wrap(async (...keys: unknown[]): Promise<void> => {
    const rssFeedKeys = await getRssFeedCacheKeys(...keys)
    await caches.rss_feeds.invalidateCacheGetByAny(...rssFeedKeys)
    void enqueueBulkPurgeCacheTags(rssFeedKeys.map(rssFeedTag))
  }),
  // Current callers (e.g. upsert.mts) pass URL strings, so urls_lookup is correctly invalidated.
  // For new inserts, the urls entity cache (keyed by UUID) has no prior entry to evict, so
  // getUrlCacheKeys returning [] for URL strings is correct and intentional.
  // If called with UUID-only keys, urls_lookup entries won't be cleared — pass URL strings.
  urls: wrap(async (...keys: unknown[]): Promise<void> => {
    const [urlKeys, urlLookupKeys] = await Promise.all([
      getUrlCacheKeys(...keys),
      getUrlLookupKeys(...keys),
    ])
    await deleteFromCachesInChunks([
      { cache: caches.urls, keys: urlKeys },
      { cache: caches.urls_lookup, keys: urlLookupKeys },
    ])
  }),
  url_hostnames: wrap(async (...keys: unknown[]): Promise<void> => {
    const urlHostnameKeys = await getUrlHostnameCacheKeys(...keys)
    await caches.url_hostnames.invalidateCacheGetByAny(...urlHostnameKeys)
    void enqueueBulkPurgeCacheTags(urlHostnameKeys.map(hostnameTag))
  }),
  hostname_elections: wrap(async (...keys: unknown[]): Promise<void> => {
    const urlHostnameKeys = await getUrlHostnameCacheKeys(...keys)
    await caches.hostname_elections.invalidateCacheGetByAny(...urlHostnameKeys)
  }),
}

/** Publication reconciliation cannot acknowledge best-effort cache work. */
export async function deleteFromCachesInChunks(groups: CacheDeleteGroups): Promise<void> {
  const maxKeys = Math.max(0, ...groups.map(group => group.keys.length))
  async function deleteNextChunk(start: number): Promise<void> {
    if (start >= maxKeys) return
    await retryCacheSaturation(() =>
      ValkeyCache.deleteFromCaches(
        groups.map(({ cache, keys }) => ({
          cache,
          keys: keys.slice(start, start + CACHE_DELETE_KEYS_PER_BATCH),
        })),
      ),
    )
    await deleteNextChunk(start + CACHE_DELETE_KEYS_PER_BATCH)
  }
  await deleteNextChunk(0)
}

function wrap(fn: InvalidateFunction): InvalidateFunction {
  return async (...keys: unknown[]): Promise<void> => {
    try {
      return await fn(...keys)
    } catch (error) {
      onError(error as Error)
    }
  }
}

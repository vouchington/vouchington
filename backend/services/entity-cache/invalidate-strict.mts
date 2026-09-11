import {
  getCommunityCacheKeys,
  getPostCacheKeysWithOptions,
  getRssFeedCacheKeys,
  getStoryCacheKeys,
  getTopicCacheKeys,
  getUserCacheKeys,
  getCacheKeys,
} from './keys.mts'
import { caches } from './caches.mts'
import { deleteFromCachesInChunks } from './invalidate.mts'
import { enqueueBulkPurgeCacheTags } from '@queues/cache-purge/enqueues'
import {
  HTML_TAG,
  communityTag,
  postTag,
  rssFeedTag,
  storyTag,
  topicTag,
  userTag,
} from '@ts-shared/cache'

/** Strict publication-worker cache effects: errors and tag enqueue failures propagate. */
export async function invalidatePostStrict(...keys: unknown[]): Promise<void> {
  const postKeys = await getPostCacheKeysWithOptions({ readOnly: false }, ...keys)
  await Promise.all([
    deleteFromCachesInChunks([
      { cache: caches.posts, keys: postKeys },
      { cache: caches.posts_lookup, keys: [...getCacheKeys(postKeys).slugs] },
      { cache: caches.post_metrics, keys: postKeys },
    ]),
    enqueueBulkPurgeCacheTags(postKeys.map(postTag)),
  ])
}

export async function invalidateUserStrict(...keys: unknown[]): Promise<void> {
  const userKeys = await getUserCacheKeys(...keys)
  await Promise.all([
    deleteFromCachesInChunks([
      { cache: caches.users_private, keys: userKeys },
      { cache: caches.users_public, keys: userKeys },
      { cache: caches.users_lookup, keys: [...getCacheKeys(userKeys).slugs] },
      { cache: caches.user_metrics, keys: userKeys },
    ]),
    enqueueBulkPurgeCacheTags(userKeys.map(userTag)),
  ])
}

export async function invalidateTopicStrict(...keys: unknown[]): Promise<void> {
  const topicKeys = await getTopicCacheKeys(...keys)
  await Promise.all([
    deleteFromCachesInChunks([
      { cache: caches.topics, keys: topicKeys },
      { cache: caches.topics_with_redirect, keys: topicKeys },
      { cache: caches.topics_lookup, keys: topicKeys },
    ]),
    enqueueBulkPurgeCacheTags(topicKeys.map(topicTag)),
  ])
}

export async function invalidateCommunityStrict(...keys: unknown[]): Promise<void> {
  const communityKeys = await getCommunityCacheKeys(...keys)
  await enqueueBulkPurgeCacheTags([...communityKeys.map(communityTag), HTML_TAG])
}

export async function invalidateHtmlStrict(): Promise<void> {
  await enqueueBulkPurgeCacheTags([HTML_TAG])
}

export async function invalidateRssFeedStrict(...keys: unknown[]): Promise<void> {
  const rssKeys = await getRssFeedCacheKeys(...keys)
  await Promise.all([
    caches.rss_feeds.invalidateCacheGetByAny(...rssKeys),
    enqueueBulkPurgeCacheTags(rssKeys.map(rssFeedTag)),
  ])
}

/** Strict story-tag purge for reconciliation work that must remain retryable on enqueue failure. */
export async function invalidateStoryStrict(...keys: unknown[]): Promise<void> {
  const storyKeys = await getStoryCacheKeys(...keys)
  await enqueueBulkPurgeCacheTags(storyKeys.map(storyTag))
}

import { caches } from './caches.mts'
import { getCacheKeys } from './keys.mts'
import { deleteFromCachesInChunks } from './invalidate.mts'
export type ExactPublicationCacheKeys = {
  postIds: readonly string[]
  postSlugs: readonly string[]
  userKeys: readonly string[]
  communityKeys: readonly string[]
  rssFeedIds: readonly string[]
  rssFeedItemIds: readonly string[]
  topicKeys: readonly string[]
}

/** Deletes precisely captured and paged-live keys; no cache resolver performs a broad SQL scan. */
export async function invalidateExactPublicationCacheKeys(
  keys: ExactPublicationCacheKeys,
): Promise<void> {
  const posts = new Set<string>([...keys.postIds, ...keys.postSlugs])
  const users = new Set<string>(keys.userKeys)
  const rssFeeds = new Set<string>(keys.rssFeedIds)
  const topics = new Set<string>(keys.topicKeys)
  const postKeys = [...posts]
  const userKeys = [...users]
  const topicKeys = [...topics]
  const feedKeys = [...rssFeeds]
  const itemKeys = [...new Set(keys.rssFeedItemIds)]
  const postSlugs = [...getCacheKeys(postKeys).slugs]
  const userSlugs = [...getCacheKeys(userKeys).slugs]
  const topicSlugs = [...getCacheKeys(topicKeys).slugs]
  await deleteFromCachesInChunks([
    { cache: caches.posts, keys: postKeys },
    { cache: caches.posts_lookup, keys: postSlugs },
    { cache: caches.post_metrics, keys: postKeys },
    { cache: caches.users_private, keys: userKeys },
    { cache: caches.users_public, keys: userKeys },
    { cache: caches.users_lookup, keys: userSlugs },
    { cache: caches.user_metrics, keys: userKeys },
    { cache: caches.topics, keys: topicKeys },
    { cache: caches.topics_with_redirect, keys: topicKeys },
    { cache: caches.topics_lookup, keys: topicSlugs },
    { cache: caches.topic_metrics, keys: topicKeys },
    { cache: caches.rss_feeds, keys: feedKeys },
    { cache: caches.rss_feed_items, keys: itemKeys },
  ])
}

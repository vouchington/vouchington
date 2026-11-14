import {
  getPostCacheKeysWithOptions,
  getTopicCacheKeys,
  getUserCacheKeys,
  getCacheKeys,
} from './keys.mts'
import { caches } from './caches.mts'
import type { EntityRelationElectionCacheKey } from './entity-relation-election-key.mts'
import { deleteFromCachesInChunks } from './invalidate.mts'

/** Strict local cache effects: failures propagate to the owning retry work. */
export async function invalidatePostStrict(...keys: unknown[]): Promise<void> {
  const postKeys = await getPostCacheKeysWithOptions({ readOnly: false }, ...keys)
  await invalidateResolvedPostKeysStrict(postKeys)
}

/** Known post identity/slug keys from a bounded canonical enumeration. */
export async function invalidateResolvedPostKeysStrict(postKeys: string[]): Promise<void> {
  await deleteFromCachesInChunks([
    { cache: caches.posts, keys: postKeys },
    { cache: caches.posts_lookup, keys: [...getCacheKeys(postKeys).slugs] },
    { cache: caches.post_metrics, keys: postKeys },
  ])
}

export async function invalidateUserStrict(...keys: unknown[]): Promise<void> {
  const userKeys = await getUserCacheKeys(...keys)
  await deleteFromCachesInChunks([
    { cache: caches.users_private, keys: userKeys },
    { cache: caches.users_public, keys: userKeys },
    { cache: caches.users_lookup, keys: [...getCacheKeys(userKeys).slugs] },
    { cache: caches.user_metrics, keys: userKeys },
  ])
}

export async function invalidateTopicStrict(...keys: unknown[]): Promise<void> {
  const topicKeys = await getTopicCacheKeys(...keys)
  await deleteFromCachesInChunks([
    { cache: caches.topics, keys: topicKeys },
    { cache: caches.topics_with_redirect, keys: topicKeys },
    { cache: caches.topics_lookup, keys: topicKeys },
  ])
}

/** The caller has already enumerated a bounded page of canonical IDs/slugs/aliases. */
export async function invalidateResolvedTopicKeysStrict(topicKeys: string[]): Promise<void> {
  await deleteFromCachesInChunks([
    { cache: caches.topics, keys: topicKeys },
    { cache: caches.topics_with_redirect, keys: topicKeys },
    { cache: caches.topics_lookup, keys: topicKeys },
    { cache: caches.topic_metrics, keys: topicKeys },
    { cache: caches.topic_elections, keys: topicKeys },
  ])
}

/** No key discovery and no best-effort wrapper: the owning merge cursor retries failures. */
export async function invalidateResolvedEntityRelationElectionKeysStrict(
  keys: EntityRelationElectionCacheKey[],
): Promise<void> {
  await deleteFromCachesInChunks([{ cache: caches.entity_relation_elections, keys }])
}

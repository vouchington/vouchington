import {
  invalidateCommunityStrict,
  invalidateHtmlStrict,
  invalidateTopicStrict,
  invalidateUserStrict,
} from '@services/entity-cache/invalidate-strict'
import { caches } from '@services/entity-cache/caches'
import { getTopicCacheKeys } from '@services/entity-cache/keys'
import type { Post } from './types.mts'

/**
 * Reconciliation supplies primary-derived topic IDs, avoiding replica discovery; it awaits the
 * strict post tag purge while keeping legacy public-surface listeners best-effort.
 */
export async function invalidatePostPublicSurfacesStrict(
  post: Pick<Post, 'id' | 'created_by_id' | 'community_id'>,
  _primaryTopicIds: string[],
): Promise<void> {
  await Promise.all([
    post.created_by_id
      ? caches.user_metrics.invalidateCacheGetByAny(post.created_by_id)
      : Promise.resolve(),
  ])
  await Promise.all([
    post.created_by_id ? invalidateUserStrict(post.created_by_id) : Promise.resolve(),
    post.community_id ? invalidateCommunityStrict(post.community_id) : Promise.resolve(),
    invalidateHtmlStrict(),
  ])
}

/** One strict topic projection per bounded reconciliation page, including topic-only pages. */
export async function invalidatePostPublicationTopicsStrict(...topicIds: string[]): Promise<void> {
  if (topicIds.length === 0) return
  const topicKeys = await getTopicCacheKeys(...topicIds)
  await Promise.all([
    caches.topic_metrics.invalidateCacheGetByAny(...topicKeys),
    invalidateTopicStrict(...topicIds),
  ])
}

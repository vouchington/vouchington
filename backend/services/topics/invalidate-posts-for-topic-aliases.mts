import { read } from '@data-stores/psql'
import { enqueueBulkReconcilePostNotifications } from '@queues/notifications/enqueues'
import { enqueueContinueInvalidatingPostsForTopicAliases } from '@queues/topic-aliases/enqueues'
import { invalidate } from '@services/entity-cache/invalidate'

export const TOPIC_ALIAS_POST_INVALIDATION_BATCH_SIZE = 100

/**
 * Preserves immediate cache invalidation for an alias mutation while bounding
 * the work and durably chaining each subsequent page through the queue.
 */
export async function invalidatePostsForTopicAliases(topicAliasIds: string[]): Promise<void> {
  const result = await invalidatePostsForTopicAliasesPage(topicAliasIds)
  if (result.hasMore && result.lastPostId) {
    await enqueueContinueInvalidatingPostsForTopicAliases(topicAliasIds, result.lastPostId)
  }
}

export async function invalidatePostsForTopicAliasesPage(
  topicAliasIds: string[],
  afterPostId?: string,
): Promise<{ hasMore: boolean; lastPostId: string | null }> {
  if (topicAliasIds.length === 0) return { hasMore: false, lastPostId: null }
  const { rows } = await read<{ post_id: string }>(
    `/* invalidatePostsForTopicAliases */
      SELECT DISTINCT post_id FROM (
        SELECT post_id
        FROM post_topic_alias_sources
        WHERE topic_alias_id = ANY($1::uuid[])
          AND ($2::uuid IS NULL OR post_id > $2::uuid)
        UNION ALL
        SELECT relation.subject_id AS post_id
        FROM relation__post__category__topic_alias relation
        WHERE relation.object_id = ANY($1::uuid[])
          AND relation.deleted_at IS NULL
          AND relation.votes_score_net > 0
          AND ($2::uuid IS NULL OR relation.subject_id > $2::uuid)
      ) ownership
      ORDER BY post_id
      LIMIT $3`,
    [topicAliasIds, afterPostId ?? null, TOPIC_ALIAS_POST_INVALIDATION_BATCH_SIZE + 1],
  )
  const postIds = rows.slice(0, TOPIC_ALIAS_POST_INVALIDATION_BATCH_SIZE).map(row => row.post_id)
  if (postIds.length === 0) return { hasMore: false, lastPostId: null }
  await Promise.all([invalidate.posts(postIds), enqueueBulkReconcilePostNotifications(postIds)])
  return {
    hasMore: rows.length > TOPIC_ALIAS_POST_INVALIDATION_BATCH_SIZE,
    lastPostId: postIds.at(-1) ?? null,
  }
}

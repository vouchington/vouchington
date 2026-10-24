import { getTopicsWorkLimit } from './work-limits.mts'
import onError from '@modules/on-error'
import { read } from '@data-stores/psql'
import { awaitReportedEnqueueAdmission } from '@queues/background/enqueues'
import { enqueueBulkReconcilePostNotifications } from '@queues/notifications/enqueues'
import { enqueueContinueInvalidatingPostsForTopicAliases } from '@queues/rss-feed-maintenance/enqueues/topic-aliases'
import { invalidate } from '@services/entity-cache/invalidate'

/**
 * Preserves immediate cache invalidation for an alias mutation while bounding
 * the work and durably chaining each subsequent page through the queue.
 */
export async function invalidatePostsForTopicAliases(topicAliasIds: string[]): Promise<void> {
  try {
    const { postIds, hasMore, lastPostId } = await readAliasPostPage(topicAliasIds)
    if (postIds.length === 0) return
    await Promise.all([
      invalidate.posts(postIds),
      awaitReportedEnqueueAdmission(() => enqueueBulkReconcilePostNotifications(postIds)),
    ])
    if (hasMore && lastPostId) {
      await awaitReportedEnqueueAdmission(() =>
        enqueueContinueInvalidatingPostsForTopicAliases(topicAliasIds, lastPostId),
      )
    }
  } catch (err) {
    onError(err instanceof Error ? err : new Error(String(err)))
  }
}

export async function invalidatePostsForTopicAliasesPage(
  topicAliasIds: string[],
  afterPostId?: string,
): Promise<{ hasMore: boolean; lastPostId: string | null }> {
  const { postIds, hasMore, lastPostId } = await readAliasPostPage(topicAliasIds, afterPostId)
  if (postIds.length === 0) return { hasMore, lastPostId }
  await Promise.all([invalidate.posts(postIds), enqueueBulkReconcilePostNotifications(postIds)])
  return { hasMore, lastPostId }
}

async function readAliasPostPage(topicAliasIds: string[], afterPostId?: string) {
  const TOPIC_ALIAS_POST_INVALIDATION_BATCH_SIZE = getTopicsWorkLimit(
    'alias_post_invalidation_batch_size',
  )
  if (topicAliasIds.length === 0) return { postIds: [], hasMore: false, lastPostId: null }
  const { rows } = await read<{ post_id: string }>(
    `/* invalidatePostsForTopicAliases */
      SELECT DISTINCT post_id FROM (
        SELECT post_id
        FROM post_topic_alias_sources
        WHERE topic_alias_id = ANY($1::uuid[])
          AND ($2::uuid IS NULL OR post_id > $2::uuid)
        UNION ALL
        SELECT relation.subject_id AS post_id
        -- no-mistakes-disable-next-line postgres-required-predicates: reverse alias-object lookup spans subject_id partitions
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
  return {
    postIds,
    hasMore: rows.length > TOPIC_ALIAS_POST_INVALIDATION_BATCH_SIZE,
    lastPostId: postIds.at(-1) ?? null,
  }
}

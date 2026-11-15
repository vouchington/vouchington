import { getTopicsWorkLimit } from './work-limits.mts'
import { randomUUID } from 'node:crypto'
import onError from '@modules/on-error'
import { read } from '@data-stores/psql'
import { awaitReportedEnqueueAdmission } from '@queues/background/enqueues'
import { enqueueBulkReconcilePostNotifications } from '@queues/notifications/enqueues'
import { enqueueContinueInvalidatingPostsForTopicAliases } from '@queues/rss-feed-maintenance/enqueues/topic-aliases'
import type { TopicAliasPostInvalidationCursor } from '@queues/rss-feed-maintenance/types'
import { invalidate } from '@services/entity-cache/invalidate'

/** Immediately invalidates one bounded page and admits the remaining alias walks. */
export async function invalidatePostsForTopicAliases(topicAliasIds: string[]): Promise<void> {
  try {
    const { postIds, cursor } = await readAliasPostPage(topicAliasIds)
    const notificationChangeId = randomUUID()
    if (postIds.length > 0)
      await Promise.all([
        invalidate.posts(postIds),
        awaitReportedEnqueueAdmission(() =>
          enqueueBulkReconcilePostNotifications(postIds, notificationChangeId),
        ),
      ])
    if (cursor)
      await awaitReportedEnqueueAdmission(() =>
        enqueueContinueInvalidatingPostsForTopicAliases(
          topicAliasIds,
          notificationChangeId,
          cursor,
        ),
      )
  } catch (err) {
    onError(err instanceof Error ? err : new Error(String(err)))
  }
}

export async function invalidatePostsForTopicAliasesPage(
  topicAliasIds: string[],
  changeId: string,
  cursor: TopicAliasPostInvalidationCursor,
): Promise<{ hasMore: boolean; cursor: TopicAliasPostInvalidationCursor | null }> {
  const page = await readAliasPostPage(topicAliasIds, cursor)
  if (page.postIds.length > 0)
    await Promise.all([
      invalidate.posts(page.postIds),
      enqueueBulkReconcilePostNotifications(page.postIds, changeId),
    ])
  return { hasMore: page.cursor !== null, cursor: page.cursor }
}

async function readAliasPostPage(
  topicAliasIds: string[],
  cursor?: TopicAliasPostInvalidationCursor,
): Promise<{ postIds: string[]; cursor: TopicAliasPostInvalidationCursor | null }> {
  const aliases = [...new Set(topicAliasIds)].toSorted()
  const topicAliasId = cursor?.topicAliasId ?? aliases[0]
  if (!topicAliasId) return { postIds: [], cursor: null }
  const aliasPosition = aliases.indexOf(topicAliasId)
  if (aliasPosition === -1) throw new RangeError('Invalid topic alias invalidation cursor')
  const batchSize = getTopicsWorkLimit('alias_post_invalidation_batch_size')
  const afterPostId = cursor?.afterPostId ?? null
  const parameters = [topicAliasId, batchSize + 1, ...(afterPostId ? [afterPostId] : [])]
  const [sources, relations] = await Promise.all([
    read<{ post_id: string }>(
      `/* invalidatePostsForTopicAliases sources */
      SELECT post_id FROM post_topic_alias_sources
      WHERE topic_alias_id = $1::uuid
        ${afterPostId ? 'AND post_id > $3::uuid' : ''}
      ORDER BY post_id, id LIMIT $2`,
      parameters,
    ),
    read<{ post_id: string }>(
      `/* invalidatePostsForTopicAliases relations */
      SELECT relation.subject_id AS post_id
      -- no-mistakes-disable-next-line postgres-required-predicates: reverse alias-object lookup spans subject_id partitions
      FROM relation__post__category__topic_alias relation
      WHERE (CASE WHEN relation.deleted_at IS NULL AND relation.votes_score_net > 0 THEN relation.object_id END) = $1::uuid
        AND relation.deleted_at IS NULL AND relation.votes_score_net > 0
        ${afterPostId ? 'AND relation.subject_id > $3::uuid' : ''}
      ORDER BY relation.subject_id LIMIT $2`,
      parameters,
    ),
  ])
  const rawPages = [sources.rows, relations.rows]
  // An unseen post cannot precede the last post of either full raw prefix. Source
  // duplicates may make this a short page; advancing by post skips only already invalidated rows.
  const fullPageEnds = rawPages
    .filter(rows => rows.length > batchSize)
    .map(rows => rows.at(-1)!.post_id)
    .toSorted()
  const safeThroughPostId = fullPageEnds[0]
  const matched = [...new Set(rawPages.flatMap(rows => rows.map(row => row.post_id)))]
    .filter(postId => !safeThroughPostId || postId <= safeThroughPostId)
    .toSorted()
  const postIds = matched.slice(0, batchSize)
  if (fullPageEnds.length > 0 || matched.length > batchSize)
    return { postIds, cursor: { topicAliasId, afterPostId: postIds.at(-1)! } }
  const nextAliasId = aliases[aliasPosition + 1]
  return {
    postIds,
    cursor: nextAliasId ? { topicAliasId: nextAliasId, afterPostId: null } : null,
  }
}

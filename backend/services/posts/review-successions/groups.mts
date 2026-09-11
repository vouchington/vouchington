import type { TransactionQuery } from '@data-stores/psql/types'
import type { ReviewSuccessionGroup } from './types.mts'

/** Finds both present and still-active historical exact-topic groups for the changed posts. */
export async function listReviewSuccessionGroups(
  query: TransactionQuery,
  postIds: readonly string[],
): Promise<ReviewSuccessionGroup[]> {
  const { rows } = await query<{
    author_user_id: string
    topic_ids: string[]
  }>(
    `/* listReviewSuccessionGroups */
    WITH current_groups AS (
      SELECT review.created_by_id AS author_user_id,
        ARRAY_AGG(rating.topic_id ORDER BY rating.topic_id) AS topic_ids
      FROM posts review
      JOIN post_review_topic_ratings rating ON rating.post_id = review.id
      WHERE review.id = ANY($1::uuid[])
        AND review.post_type = 'review'
        AND review.root_id IS NULL
        AND review.created_by_id IS NOT NULL
      GROUP BY review.id, review.created_by_id
    ), active_history_groups AS (
      SELECT succession.author_user_id, succession.topic_ids
      FROM review_successions succession
      WHERE (succession.predecessor_post_id = ANY($1::uuid[])
          OR succession.successor_post_id = ANY($1::uuid[]))
        AND succession.automatically_restored_at IS NULL
        AND succession.manual_override_at IS NULL
    )
    SELECT DISTINCT author_user_id, topic_ids
    FROM (
      SELECT author_user_id, topic_ids FROM current_groups
      UNION ALL
      SELECT author_user_id, topic_ids FROM active_history_groups
    ) groups
    ORDER BY author_user_id, topic_ids`,
    [postIds],
  )
  return rows.map(row => ({ authorUserId: row.author_user_id, topicIds: row.topic_ids }))
}

/** Acquires exact-topic group locks lexically before the global post-scope lock phase. */
export async function lockReviewSuccessionGroups(
  query: TransactionQuery,
  groups: readonly ReviewSuccessionGroup[],
): Promise<void> {
  const lockKeys = groups
    .map(group => `review-succession:${group.authorUserId}:${group.topicIds.join(',')}`)
    .toSorted()
  await query(
    `/* lockReviewSuccessionGroups */
    SELECT pg_advisory_xact_lock(hashtextextended(lock_key, 0))
    FROM unnest($1::text[]) AS input(lock_key)
    ORDER BY lock_key`,
    [lockKeys],
  )
}

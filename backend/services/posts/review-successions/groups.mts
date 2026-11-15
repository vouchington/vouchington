import type { TransactionQuery } from '@data-stores/psql/types'
import type { ReviewSuccessionGroup } from './types.mts'

type GroupRow = { author_user_id: string; topic_ids: string[] }

/** One post's ordered history walk; topic projections execute only for the selected rows. */
export async function listReviewSuccessionGroupPage(
  query: TransactionQuery,
  postId: string,
  afterId: string | null,
  limit: number,
): Promise<{ groups: ReviewSuccessionGroup[]; nextCursor: string | null }> {
  const { rows: history } = await query<GroupRow & { id: string }>(
    `/* listReviewSuccessionHistoryPage */
    SELECT succession.id, succession.author_user_id,
      ARRAY(SELECT topic.topic_id FROM review_succession_topics topic
        WHERE topic.review_succession_id = succession.id ORDER BY topic.topic_id) AS topic_ids
    FROM review_successions succession
    WHERE (succession.successor_post_id, succession.id) > ($1::uuid, $2::uuid)
      AND (succession.successor_post_id, succession.id) <= ($1::uuid, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)
      AND succession.automatically_restored_at IS NULL AND succession.manual_override_at IS NULL
    ORDER BY succession.successor_post_id, succession.id LIMIT $3`,
    [postId, afterId ?? '00000000-0000-0000-0000-000000000000', limit],
  )
  // Rating writers apply the content limit to every author (best effort under concurrency).
  // Preserve their complete sets; unlimited general authored categories are independent.
  const direct = afterId
    ? []
    : (
        await query<GroupRow>(
          `/* listReviewSuccessionGroups */
    SELECT review.created_by_id AS author_user_id,
      ARRAY_AGG(rating.topic_id ORDER BY rating.topic_id) AS topic_ids
    FROM posts review
    JOIN post_review_topic_ratings rating ON rating.post_id = review.id
    WHERE review.id = $1::uuid
      AND review.post_type = 'review' AND review.root_post_id IS NULL
      AND review.created_by_id IS NOT NULL
    GROUP BY review.id, review.created_by_id
    UNION ALL
    SELECT succession.author_user_id,
      ARRAY(SELECT topic.topic_id FROM review_succession_topics topic
        WHERE topic.review_succession_id = succession.id ORDER BY topic.topic_id) AS topic_ids
    FROM review_successions succession
    WHERE succession.predecessor_post_id = $1::uuid
      AND succession.automatically_restored_at IS NULL AND succession.manual_override_at IS NULL`,
          [postId],
        )
      ).rows
  const groups = new Map<string, ReviewSuccessionGroup>()
  for (const row of [...direct, ...history]) {
    if (row.topic_ids.length === 0) continue
    groups.set(`${row.author_user_id}:${row.topic_ids.join(',')}`, {
      authorUserId: row.author_user_id,
      topicIds: row.topic_ids,
    })
  }
  return {
    groups: [...groups.entries()]
      .toSorted(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([, group]) => group),
    nextCursor: history.length === limit ? history.at(-1)!.id : null,
  }
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

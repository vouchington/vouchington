import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'

type ReviewSuccession = {
  id: string
  predecessor_post_id: string
  successor_post_id: string
  author_user_id: string
  topic_ids: string[]
  predecessor_archived_at: Date
  automatically_restored_at: Date | null
  manual_override_at: Date | null
}

/** Lists persisted automatic archive epochs involving only the supplied owned review posts. */
export async function listReviewSuccessionsForPostIds(
  postIds: readonly string[],
): Promise<ReviewSuccession[]> {
  const { rows } = await read<ReviewSuccession>(sql`/* listReviewSuccessionsForPostIds */
    SELECT id, predecessor_post_id, successor_post_id, author_user_id,
      (
        SELECT ARRAY_AGG(topic.topic_id ORDER BY topic.topic_id)
        FROM review_succession_topics topic
        WHERE topic.review_succession_id = review_successions.id
      ) AS topic_ids,
      predecessor_archived_at, automatically_restored_at, manual_override_at
    FROM review_successions
    WHERE predecessor_post_id = ANY(${postIds}::uuid[])
       OR successor_post_id = ANY(${postIds}::uuid[])
    ORDER BY predecessor_post_id, predecessor_archived_at
  `)
  return rows
}

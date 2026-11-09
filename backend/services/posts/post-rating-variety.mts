import assert from 'http-assert'
import sql from 'sql-template-strings'
import type { TransactionQuery } from '@data-stores/psql'

export async function assertRatingsNotAllSame(query: TransactionQuery, postId: string) {
  const { rows } = await query<{ is_valid: boolean }>(sql`/* assertRatingsNotAllSame */
    SELECT EXISTS (
      SELECT 1 FROM post_review_topic_ratings candidate
      WHERE candidate.post_id = ${postId}
        AND candidate.rating <> (
          SELECT first.rating FROM post_review_topic_ratings first
          WHERE first.post_id = ${postId} ORDER BY first.topic_id LIMIT 1
        )
    ) OR NOT EXISTS (
      SELECT 1 FROM post_review_topic_ratings candidate
      WHERE candidate.post_id = ${postId}
        AND candidate.topic_id <> (
          SELECT first.topic_id FROM post_review_topic_ratings first
          WHERE first.post_id = ${postId} ORDER BY first.topic_id LIMIT 1
        )
    ) AS is_valid
  `)
  assert(rows[0]!.is_valid, 422, 'Ratings must not all be the same when comparing multiple topics')
}

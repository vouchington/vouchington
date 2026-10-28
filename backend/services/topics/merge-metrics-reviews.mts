import { write, type TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'

type ReviewPageRow = { post_id: string; rating: number }
type EligibleReview = ReviewPageRow & { user_id: string }

/** Raw keys advance the cursor; only eligible reviews contribute to the projection. */
export async function processTopicMergeReviewMetricsPage(
  query: TransactionQuery,
  operationId: string,
  destinationTopicId: string,
  cursor: string | null,
  limit: number,
): Promise<ReviewPageRow[]> {
  const { rows } = await query<ReviewPageRow>(
    `/* processTopicMergeReviewMetricsPage candidates */
    SELECT post_id, rating FROM post_review_topic_ratings
    WHERE topic_id = $1::uuid
      AND post_id > COALESCE($2::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
    ORDER BY post_id LIMIT $3::integer`,
    [destinationTopicId, cursor, limit],
  )
  if (rows.length) await applyEligibleReviews(query, operationId, rows)
  return rows
}

async function applyEligibleReviews(
  query: TransactionQuery,
  operationId: string,
  candidates: readonly ReviewPageRow[],
): Promise<void> {
  const { rows } = await write<EligibleReview>(
    sql`/* applyEligibleTopicMergeReviews */ WITH page(post_id, rating) AS (
      SELECT * FROM unnest(${candidates.map(row => row.post_id)}::uuid[], ${candidates.map(row => row.rating)}::smallint[])
    ) SELECT DISTINCT ON (posts.created_by_id)
      posts.created_by_id AS user_id, posts.id AS post_id, page.rating
    FROM page JOIN posts ON posts.id = page.post_id
    JOIN view_public_post_eligibility eligibility ON eligibility.post_id = posts.id
    ORDER BY posts.created_by_id, posts.id DESC`,
    { query },
  )
  if (!rows.length) return
  await query(
    `/* persistEligibleTopicMergeReviews */
    INSERT INTO topic_merge_metric_users (operation_id, user_id, cursor_review_post_id, review_rating)
    SELECT $1::uuid, user_id, post_id, rating
    FROM unnest($2::uuid[], $3::uuid[], $4::smallint[]) AS page(user_id, post_id, rating)
    ORDER BY user_id
    ON CONFLICT (operation_id, user_id) DO UPDATE SET
      cursor_review_post_id = EXCLUDED.cursor_review_post_id,
      review_rating = EXCLUDED.review_rating
    WHERE topic_merge_metric_users.cursor_review_post_id IS NULL
      OR topic_merge_metric_users.cursor_review_post_id < EXCLUDED.cursor_review_post_id`,
    [
      operationId,
      rows.map(row => row.user_id),
      rows.map(row => row.post_id),
      rows.map(row => row.rating),
    ],
  )
}

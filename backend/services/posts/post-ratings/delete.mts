import assert from 'http-assert'
import sql from 'sql-template-strings'
import { beginTransaction } from '@data-stores/psql'
import { createPostRevision } from '@services/post-revisions'
import { lockPostPublication, recordPostPublicationChange } from '@services/post-publication'

export async function deletePostRatingRecord(
  userId: string,
  postId: string,
  topicId: string,
): Promise<void> {
  await using query = await beginTransaction()
  await lockPostPublication(query, postId)
  const { rows } = await query(sql`/* deletePostRating */
      WITH locked_rows AS (
        SELECT post_id, topic_id
        FROM post_review_topic_ratings
        WHERE post_id = ${postId}
        FOR UPDATE
      ),
      locked AS (
        SELECT
          COUNT(*)::int AS n
        FROM locked_rows
      ),
      deleted AS (
        DELETE FROM post_review_topic_ratings
        WHERE post_id = ${postId}
          AND topic_id = ${topicId}
          AND (SELECT n FROM locked) > 1
        RETURNING 1
      )
      SELECT
        (SELECT n FROM locked) AS total_count,
        EXISTS (SELECT 1 FROM locked_rows WHERE topic_id = ${topicId}) AS has_rating,
        EXISTS (SELECT 1 FROM deleted) AS did_delete
    `)
  const { total_count, has_rating, did_delete } = rows[0]
  assert(has_rating, 404, 'Rating not found')
  assert(total_count > 1, 422, 'Cannot delete the last rating on a review')
  assert(did_delete, 404, 'Rating not found')
  await createPostRevision(
    postId,
    'update',
    { review_topic_ratings: { before: [topicId], after: [] } },
    userId,
    { query },
  )
  await recordPostPublicationChange(query, {
    scope: { type: 'post', postId },
    reason: 'post_ratings_changed',
    impactedTopicIds: [topicId],
  })
  await query.commit()
}

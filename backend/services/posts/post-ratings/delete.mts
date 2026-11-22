import assert from 'http-assert'
import sql from 'sql-template-strings'
import { beginTransaction } from '@data-stores/psql'
import { createPostRevision } from '@services/post-revisions'
import { recordPostPublicationChange } from '@services/post-publication'

export async function deletePostRatingRecord(
  userId: string,
  postId: string,
  topicId: string,
): Promise<void> {
  await using query = await beginTransaction()
  const { rows } = await query<{
    has_other_rating: boolean
    has_rating: boolean
    did_delete: boolean
  }>(sql`/* deletePostRating */
      WITH rating_state AS (
        SELECT
          EXISTS (
            SELECT 1 FROM post_review_topic_ratings
            WHERE post_id = ${postId} AND topic_id = ${topicId}
          ) AS has_rating,
          EXISTS (
            SELECT 1 FROM post_review_topic_ratings
            WHERE post_id = ${postId} AND topic_id <> ${topicId}
          ) AS has_other_rating
      ), deleted AS (
        DELETE FROM post_review_topic_ratings
        WHERE post_id = ${postId}
          AND topic_id = ${topicId}
          AND (SELECT has_other_rating FROM rating_state)
        RETURNING 1
      )
      SELECT has_rating, has_other_rating, EXISTS (SELECT 1 FROM deleted) AS did_delete
      FROM rating_state
    `)
  const { has_rating, has_other_rating, did_delete } = rows[0]
  assert(has_rating, 404, 'Rating not found')
  assert(has_other_rating, 422, 'Cannot delete the last rating on a review')
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

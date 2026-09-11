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
          COUNT(*)::int AS n,
          COUNT(*) FILTER (WHERE topic_id = ${topicId})::int AS exists_count
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
        (SELECT exists_count FROM locked) AS exists_count,
        (SELECT COUNT(*)::int FROM deleted) AS deleted_count
    `)
  const { total_count, exists_count, deleted_count } = rows[0]
  assert(exists_count > 0, 404, 'Rating not found')
  assert(total_count > 1, 422, 'Cannot delete the last rating on a review')
  assert(deleted_count > 0, 404, 'Rating not found')
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

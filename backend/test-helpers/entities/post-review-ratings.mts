import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function updateTestPostReviewRating(
  postId: string,
  topicId: string,
  rating: number,
): Promise<void> {
  await write(sql`/* updateTestPostReviewRating */
    UPDATE post_review_topic_ratings
    SET rating = ${rating}
    WHERE post_id = ${postId}
      AND topic_id = ${topicId}
  `)
}

export async function deleteTestPostReviewRating(postId: string, topicId: string): Promise<void> {
  await write(sql`/* deleteTestPostReviewRating */
    DELETE FROM post_review_topic_ratings
    WHERE post_id = ${postId}
      AND topic_id = ${topicId}
  `)
}

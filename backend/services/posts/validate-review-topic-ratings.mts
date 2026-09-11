import { read } from '@data-stores/psql'
import { isUUID } from '@modules/utils'
import { getPostContentLimitsConfig } from '@services/post-content-limits'
import assert from 'http-assert'
import createHttpError from 'http-errors'
import sql from 'sql-template-strings'

type ReviewTopicRating = { topic_id: string; rating: number }
type ReviewTopicRatingsValidationOptions = { maxItems?: number }

export function assertValidReviewTopicRatings(
  ratings: Array<ReviewTopicRating> | undefined | null,
  options: ReviewTopicRatingsValidationOptions = {},
): asserts ratings is Array<ReviewTopicRating> {
  assert(ratings && ratings.length >= 1, 422, 'At least one topic rating is required')
  const review_topic_ratings_max_items =
    options.maxItems ?? getPostContentLimitsConfig().review_topic_ratings_max_items
  assert(
    ratings.length <= review_topic_ratings_max_items,
    422,
    `Review topic ratings must not exceed ${review_topic_ratings_max_items} items`,
  )
  ratings.forEach((r, i) => {
    assert(r.topic_id, 422, `Topic ID is required for rating ${i + 1}`)
    assert(isUUID(r.topic_id), 422, 'Invalid topic rating')
    assert(r.rating !== undefined, 422, `Rating is required for rating ${i + 1}`)
    assert(
      Number.isInteger(r.rating) && r.rating >= 1 && r.rating <= 5,
      422,
      'Rating must be an integer between 1 and 5',
    )
  })
  const topicIds = ratings.map(r => r.topic_id)
  assert(new Set(topicIds).size === topicIds.length, 422, 'Duplicate topic ratings are not allowed')
  if (ratings.length >= 2) {
    const allSame = ratings.every(r => r.rating === ratings[0].rating)
    assert(!allSame, 422, 'Review topic ratings cannot all be the same')
  }
}

export async function assertReviewTopicsAllowReviews(topicIds: string[]): Promise<void> {
  if (topicIds.length === 0) return
  const { rows } = await read<{
    active_topic_exists: boolean
  }>(sql`/* assertReviewTopicsAllowReviews */
    SELECT topics.id IS NOT NULL AS active_topic_exists
    FROM unnest(${topicIds}::uuid[]) AS requested(topic_id)
    LEFT JOIN topics ON topics.id = requested.topic_id
      AND topics.deleted_at IS NULL
      AND topics.merged_into_topic_id IS NULL
    WHERE topics.id IS NULL
      OR topics.allow_reviews = FALSE
    LIMIT 1
  `)
  const invalidTopic = rows[0]
  if (!invalidTopic) return
  if (!invalidTopic.active_topic_exists) throw createHttpError(422, 'Topic not found')
  throw createHttpError(422, 'Reviews are not allowed on this topic')
}

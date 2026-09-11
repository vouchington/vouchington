import type { PrivateUser } from '@services/users/types'
import type { Post } from './types.mts'
import { beginTransaction, write, type TransactionQuery } from '@data-stores/psql'
import { isUUID } from '@modules/utils'
import { getPostContentLimitsConfig } from '@services/post-content-limits'
import { currentUserCanUpdatePost } from './authorization.mts'
import { enqueueOnPostUpdated } from '@queues/entity-listeners/enqueues'
import { enqueueBulkEvaluateRssFeedDiscoverability } from '@queues/rss-feed-discoverability/enqueues'
import { searchRssFeedIdsByTopicIds } from '@services/rss-feeds/search-by-topic-ids'
import { assertReviewTopicsAllowReviews } from './validate-review-topic-ratings.mts'
import assert from 'http-assert'
import createHttpError from 'http-errors'
import sql from 'sql-template-strings'
import { deletePostRatingRecord } from './post-ratings/delete.mts'
import { createPostRevision } from '@services/post-revisions'
import { lockPostPublication, recordPostPublicationChange } from '@services/post-publication'

async function enqueueRssFeedDiscoverabilityForTopics(topicIds: string[]): Promise<void> {
  const rssFeedIds = await searchRssFeedIdsByTopicIds(topicIds)
  void enqueueBulkEvaluateRssFeedDiscoverability(rssFeedIds)
}

async function assertRatingsNotAllSame(query: TransactionQuery, postId: string) {
  const { rows } = await query(sql`/* assertRatingsNotAllSame */
    SELECT COUNT(*) AS total, COUNT(DISTINCT rating) AS distinct_ratings
    FROM post_review_topic_ratings
    WHERE post_id = ${postId}
  `)
  const total = Number(rows[0].total)
  const distinctRatings = Number(rows[0].distinct_ratings)
  assert(
    total < 2 || distinctRatings > 1,
    422,
    'Ratings must not all be the same when comparing multiple topics',
  )
}

export async function addPostRating(
  user: PrivateUser,
  post: Post,
  input: { topic_id: string; rating: number; order_index: number },
) {
  assert(currentUserCanUpdatePost(user, post), 403, 'Forbidden')
  assert(post.post_type === 'review', 422, 'Post is not a review')
  assert(isUUID(input.topic_id), 422, 'Invalid topic_id')
  await assertReviewTopicsAllowReviews([input.topic_id])
  assert(
    Number.isInteger(input.rating) && input.rating >= 1 && input.rating <= 5,
    422,
    'Rating must be an integer between 1 and 5',
  )
  assert(
    Number.isInteger(input.order_index) && input.order_index >= 0,
    422,
    'order_index must be a non-negative integer',
  )
  const { review_topic_ratings_max_items } = getPostContentLimitsConfig()

  await using query = await beginTransaction()
  // ast-grep-ignore: no-three-sequential-awaits -- publication advisory lock must precede the post row lock and dependent rating reads.
  await lockPostPublication(query, post.id)
  await lockPostRatingMutation(query, post.id)
  await assertRatingCountBelowLimit(query, post.id, review_topic_ratings_max_items)
  try {
    await write(
      sql`/* addPostRating */
        INSERT INTO post_review_topic_ratings (post_id, topic_id, rating, order_index)
        VALUES (${post.id}, ${input.topic_id}, ${input.rating}, ${input.order_index})
      `,
      { query },
    )
  } catch (err) {
    const pgError = err as { code?: string }
    if (pgError.code === '23505') throw createHttpError(409, 'Rating for this topic already exists')
    if (pgError.code === '23503') throw createHttpError(422, 'Topic not found')
    throw err
  }
  // ast-grep-ignore: no-three-sequential-awaits -- rating validation, revision, and publication capture are ordered transaction writes
  await assertRatingsNotAllSame(query, post.id)
  await createPostRevision(
    post.id,
    'update',
    { review_topic_ratings: { before: [], after: [input.topic_id] } },
    user.id,
    { query },
  )
  await recordPostPublicationChange(query, {
    scope: { type: 'post', postId: post.id },
    reason: 'post_ratings_changed',
    impactedTopicIds: [input.topic_id],
  })
  await query.commit()

  void enqueueOnPostUpdated(post.id)
  await enqueueRssFeedDiscoverabilityForTopics([input.topic_id])
}

async function lockPostRatingMutation(query: TransactionQuery, postId: string) {
  await query(
    sql`/* lockPostRatingMutation */ SELECT id FROM posts WHERE id = ${postId} FOR UPDATE`,
  )
}

async function assertRatingCountBelowLimit(
  query: TransactionQuery,
  postId: string,
  maxItems: number,
) {
  const { rows } = await query(sql`/* assertRatingCountBelowLimit */
    SELECT COUNT(*)::int AS total
    FROM post_review_topic_ratings
    WHERE post_id = ${postId}
  `)
  assert(
    Number(rows[0].total) < maxItems,
    422,
    `Review topic ratings must not exceed ${maxItems} items`,
  )
}

export async function updatePostRating(
  user: PrivateUser,
  post: Post,
  topicId: string,
  changes: { rating?: number; order_index?: number },
) {
  assert(currentUserCanUpdatePost(user, post), 403, 'Forbidden')
  assert(post.post_type === 'review', 422, 'Post is not a review')
  assert(isUUID(topicId), 422, 'Invalid topic_id')
  assert(
    changes.rating !== undefined || changes.order_index !== undefined,
    422,
    'No changes provided',
  )
  if (changes.rating !== undefined) {
    assert(
      Number.isInteger(changes.rating) && changes.rating >= 1 && changes.rating <= 5,
      422,
      'Rating must be an integer between 1 and 5',
    )
  }
  if (changes.order_index !== undefined) {
    assert(
      Number.isInteger(changes.order_index) && changes.order_index >= 0,
      422,
      'order_index must be a non-negative integer',
    )
  }

  await using query = await beginTransaction()
  await lockPostPublication(query, post.id)
  await lockPostRatingMutation(query, post.id)
  const updateQuery = sql`/* updatePostRating */ UPDATE post_review_topic_ratings SET`
  if (changes.rating !== undefined && changes.order_index !== undefined) {
    updateQuery.append(sql` rating = ${changes.rating}, order_index = ${changes.order_index}`)
  } else if (changes.rating !== undefined) {
    updateQuery.append(sql` rating = ${changes.rating}`)
  } else {
    updateQuery.append(sql` order_index = ${changes.order_index}`)
  }
  updateQuery.append(sql` WHERE post_id = ${post.id} AND topic_id = ${topicId}`)
  const result = await write(updateQuery, { query })
  assert(result.rowCount && result.rowCount > 0, 404, 'Rating not found')

  // ast-grep-ignore: no-three-sequential-awaits -- rating validation, revision, and publication capture are ordered transaction writes
  await assertRatingsNotAllSame(query, post.id)
  await createPostRevision(
    post.id,
    'update',
    { review_topic_ratings: { before: [topicId], after: [topicId] } },
    user.id,
    { query },
  )
  await recordPostPublicationChange(query, {
    scope: { type: 'post', postId: post.id },
    reason: 'post_ratings_changed',
    impactedTopicIds: [topicId],
  })
  await query.commit()
  void enqueueOnPostUpdated(post.id)
  await enqueueRssFeedDiscoverabilityForTopics([topicId])
}
export async function deletePostRating(user: PrivateUser, post: Post, topicId: string) {
  assert(currentUserCanUpdatePost(user, post), 403, 'Forbidden')
  assert(post.post_type === 'review', 422, 'Post is not a review')
  assert(isUUID(topicId), 422, 'Invalid topic_id')
  await deletePostRatingRecord(user.id, post.id, topicId)
  void enqueueOnPostUpdated(post.id)
  await enqueueRssFeedDiscoverabilityForTopics([topicId])
}

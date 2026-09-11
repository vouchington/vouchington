import { randomUUID } from 'node:crypto'
import { it, expect, beforeAll, describe } from 'vitest'
import { createPost } from './create.mts'
import { addPostRating, updatePostRating, deletePostRating } from './post-ratings.mts'
import { getPostByAny } from './get.mts'
import {
  countPostReviewTopicRatingsForTest,
  createTestUser,
  getTestPostPublicationDirtyWorkForScope,
  insertTestTopic,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { onceEntityListenerCompleted } from '../../workers/entity-listeners/test-support.mts'

const VALID_REVIEW_MARKDOWN =
  'This review gives detailed context from repeated personal use, including the strongest benefits, the weakest tradeoffs, and how the product performed over time. It explains why the rating is justified with concrete observations that another consumer could compare against their own needs. I would use these details to make the same decision again.'

describe('post-ratings', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  it('addPostRating rejects adding to non-review post', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topicId = await insertTestTopic({
      name: `Test Topic ${random}`,
      slug: `test-topic-non-review-add-${random}`,
      createdById: user.id,
    })
    const post = await createPost(user, {
      title: 'Discussion post',
      markdown: 'Not a review',
      post_type: 'discussion',
    })
    await expect(
      addPostRating(user, post, { topic_id: topicId, rating: 3, order_index: 0 }),
    ).rejects.toMatchObject({
      status: 422,
    })
  })

  it('updatePostRating rejects non-existent topic', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topicId = await insertTestTopic({
      name: `Test Topic ${random}`,
      slug: `test-topic-update-notfound-${random}`,
      createdById: user.id,
    })
    const post = await createPost(user, {
      title: 'Review for update non-existent test',
      markdown: VALID_REVIEW_MARKDOWN,
      post_type: 'review',
      review_topic_ratings: [{ topic_id: topicId, rating: 3 }],
    })
    await expect(updatePostRating(user, post, randomUUID(), { rating: 5 })).rejects.toMatchObject({
      status: 404,
    })
  })

  it('updatePostRating can update only the rating order', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topicIds = await Promise.all(
      ['first', 'second'].map(label =>
        insertTestTopic({
          name: `Ordered rating ${label} ${random}`,
          slug: `ordered-rating-${label}-${random}`,
          createdById: user.id,
        }),
      ),
    )
    const post = await createPost(user, {
      title: 'Review with reordered ratings',
      markdown: VALID_REVIEW_MARKDOWN,
      post_type: 'review',
      review_topic_ratings: [
        { topic_id: topicIds[0]!, rating: 5 },
        { topic_id: topicIds[1]!, rating: 3 },
      ],
    })

    const before = await getTestPostPublicationDirtyWorkForScope({ type: 'post', id: post.id })
    const updateCompleted = onceEntityListenerCompleted('processPostUpdated', post.id)

    await updatePostRating(user, post, topicIds[0]!, { order_index: 2 })
    await updateCompleted

    const updated = await getPostByAny(post.id)
    expect(updated!.review_topic_ratings?.map(rating => rating.topic_id)).toEqual([
      topicIds[1],
      topicIds[0],
    ])
    expect(updated!.review_topic_ratings?.map(rating => rating.order_index)).toEqual([1, 2])
    expect(updated!.review_topic_ratings?.map(rating => rating.rating)).toEqual([3, 5])
    const after = await getTestPostPublicationDirtyWorkForScope({ type: 'post', id: post.id })
    expect(Number(after!.generation)).toBeGreaterThan(Number(before!.generation))
    expect(after!.reasons).toContain('post_ratings_changed')
  })

  it('deletePostRating rejects on non-review post', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topicId = await insertTestTopic({
      name: `Test Topic ${random}`,
      slug: `test-topic-non-review-del-${random}`,
      createdById: user.id,
    })
    const post = await createPost(user, {
      title: 'Discussion for delete test',
      markdown: 'Not a review',
      post_type: 'discussion',
    })
    await expect(deletePostRating(user, post, topicId)).rejects.toMatchObject({
      status: 422,
    })
  })

  it('addPostRating rejects duplicate topic', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topicId = await insertTestTopic({
      name: `Test Topic ${random}`,
      slug: `test-topic-dup-add-${random}`,
      createdById: user.id,
    })
    const post = await createPost(user, {
      title: 'Review for duplicate topic test',
      markdown: VALID_REVIEW_MARKDOWN,
      post_type: 'review',
      review_topic_ratings: [{ topic_id: topicId, rating: 3 }],
    })
    await expect(
      addPostRating(user, post, { topic_id: topicId, rating: 5, order_index: 1 }),
    ).rejects.toMatchObject({
      status: 409,
    })
  })

  it('addPostRating rejects adding a rating above the configured cap', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topicIds = await Promise.all(
      Array.from({ length: 6 }, (_, index) =>
        insertTestTopic({
          name: `Test Topic Cap ${index} ${random}`,
          slug: `test-topic-cap-${index}-${random}`,
          createdById: user.id,
        }),
      ),
    )
    const post = await createPost(user, {
      title: 'Review for capped topic count',
      markdown: VALID_REVIEW_MARKDOWN,
      post_type: 'review',
      review_topic_ratings: topicIds.slice(0, 5).map((topic_id, index) => ({
        topic_id,
        rating: (index % 5) + 1,
      })),
    })

    await expect(
      addPostRating(user, post, { topic_id: topicIds[5]!, rating: 2, order_index: 5 }),
    ).rejects.toMatchObject({
      message: 'Review topic ratings must not exceed 5 items',
      status: 422,
    })
  })

  it('addPostRating serializes concurrent inserts at the configured cap', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topicIds = await Promise.all(
      Array.from({ length: 6 }, (_, index) =>
        insertTestTopic({
          name: `Test Topic Concurrent Cap ${index} ${random}`,
          slug: `test-topic-concurrent-cap-${index}-${random}`,
          createdById: user.id,
        }),
      ),
    )
    const post = await createPost(user, {
      title: 'Review for concurrent capped topic count',
      markdown: VALID_REVIEW_MARKDOWN,
      post_type: 'review',
      review_topic_ratings: topicIds.slice(0, 4).map((topic_id, index) => ({
        topic_id,
        rating: (index % 5) + 1,
      })),
    })

    const results = await Promise.allSettled([
      addPostRating(user, post, { topic_id: topicIds[4]!, rating: 5, order_index: 4 }),
      addPostRating(user, post, { topic_id: topicIds[5]!, rating: 2, order_index: 5 }),
    ])

    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1)

    expect(await countPostReviewTopicRatingsForTest(post.id)).toBe(5)
  })

  it('serializes simultaneous updates that would otherwise commit an all-equal final state', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topicIds = await Promise.all(
      ['first', 'second'].map(label =>
        insertTestTopic({
          name: `Concurrent rating ${label} ${random}`,
          slug: `concurrent-rating-${label}-${random}`,
          createdById: user.id,
        }),
      ),
    )
    const post = await createPost(user, {
      title: 'Review with concurrent rating updates',
      markdown: VALID_REVIEW_MARKDOWN,
      post_type: 'review',
      review_topic_ratings: [
        { topic_id: topicIds[0]!, rating: 5 },
        { topic_id: topicIds[1]!, rating: 3 },
      ],
    })

    const results = await Promise.allSettled([
      updatePostRating(user, post, topicIds[0]!, { rating: 4 }),
      updatePostRating(user, post, topicIds[1]!, { rating: 4 }),
    ])

    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    const rejected = results.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    )
    expect(rejected?.reason).toMatchObject({
      message: 'Ratings must not all be the same when comparing multiple topics',
      status: 422,
    })

    const updated = await getPostByAny(post.id)
    const ratings = updated!.review_topic_ratings!
    expect(new Set(ratings.map(rating => rating.rating))).toHaveLength(2)
  })
})

import { randomUUID } from 'node:crypto'
import { it, expect, beforeAll, describe } from 'vitest'
import { createPost } from '../create.mts'
import { addPostRating, deletePostRating } from '../post-ratings.mts'
import { updateTopicRatingStats } from '@services/topics/ratings'
import { createTestUser, insertTestTopic, getTopicRatingStats } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

const VALID_REVIEW_MARKDOWN =
  'This review gives detailed context from repeated personal use, including the strongest benefits, the weakest tradeoffs, and how the product performed over time. It explains why the rating is justified with concrete observations that another consumer could compare against their own needs. I would use these details to make the same decision again.'

describe('create.reviews.generated', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  it('deletePostRating rejects deleting the last rating', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topicId1 = await insertTestTopic({
      name: `Test Topic A ${random}`,
      slug: `test-topic-lastdel-a-${random}`,
      createdById: user.id,
    })
    const topicId2 = await insertTestTopic({
      name: `Test Topic B ${random}`,
      slug: `test-topic-lastdel-b-${random}`,
      createdById: user.id,
    })
    const post = await createPost(user, {
      title: 'Review to test last rating delete',
      markdown: VALID_REVIEW_MARKDOWN,
      post_type: 'review',
      review_topic_ratings: [
        { topic_id: topicId1, rating: 5 },
        { topic_id: topicId2, rating: 2 },
      ],
    })
    await deletePostRating(user, post, topicId2)
    await expect(deletePostRating(user, post, topicId1)).rejects.toMatchObject({
      message: 'Cannot delete the last rating on a review',
      status: 422,
    })
  })

  it('deletePostRating rejects non-existent topic_id', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topicId1 = await insertTestTopic({
      name: `Test Topic A ${random}`,
      slug: `test-topic-notfound-a-${random}`,
      createdById: user.id,
    })
    const topicId2 = await insertTestTopic({
      name: `Test Topic B ${random}`,
      slug: `test-topic-notfound-b-${random}`,
      createdById: user.id,
    })
    const post = await createPost(user, {
      title: 'Review to test non-existent topic delete',
      markdown: VALID_REVIEW_MARKDOWN,
      post_type: 'review',
      review_topic_ratings: [
        { topic_id: topicId1, rating: 5 },
        { topic_id: topicId2, rating: 2 },
      ],
    })
    await expect(deletePostRating(user, post, randomUUID())).rejects.toMatchObject({
      message: 'Rating not found',
      status: 404,
    })
  })

  it('createPost rejects review on a not-reviewable topic with 422', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const noReviewTopicId = await insertTestTopic({
      name: `Test No-Review ${random}`,
      slug: `test-no-review-${random}`,
      createdById: user.id,
      allowReviews: false,
    })
    await expect(
      createPost(user, {
        title: 'Review on not-reviewable topic',
        markdown: VALID_REVIEW_MARKDOWN,
        post_type: 'review',
        review_topic_ratings: [{ topic_id: noReviewTopicId, rating: 4 }],
      }),
    ).rejects.toMatchObject({ status: 422, message: 'Reviews are not allowed on this topic' })
  })

  it('addPostRating rejects a not-reviewable topic with 422', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const regularTopicId = await insertTestTopic({
      name: `Test Topic ${random}`,
      slug: `test-topic-addrating-${random}`,
      createdById: user.id,
    })
    const noReviewTopicId = await insertTestTopic({
      name: `Test No-Review ${random}`,
      slug: `test-no-review-addrating-${random}`,
      createdById: user.id,
      allowReviews: false,
    })
    const post = await createPost(user, {
      title: 'Review for addRating no-review test',
      markdown: VALID_REVIEW_MARKDOWN,
      post_type: 'review',
      review_topic_ratings: [{ topic_id: regularTopicId, rating: 3 }],
    })
    await expect(
      addPostRating(user, post, { topic_id: noReviewTopicId, rating: 5, order_index: 1 }),
    ).rejects.toMatchObject({ status: 422, message: 'Reviews are not allowed on this topic' })
  })

  it('createPost allows review on a reviewable topic', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const reviewableTopicId = await insertTestTopic({
      name: `Test Reviewable ${random}`,
      slug: `test-reviewable-review-${random}`,
      createdById: user.id,
      allowReviews: true,
    })
    const post = await createPost(user, {
      title: 'Review on reviewable topic',
      markdown: VALID_REVIEW_MARKDOWN,
      post_type: 'review',
      review_topic_ratings: [{ topic_id: reviewableTopicId, rating: 4 }],
    })
    expect(post).toBeDefined()
    expect(post.post_type).toBe('review')
  })

  it('pending reviews are excluded from public topic rating stats', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topicId = await insertTestTopic({
      name: `Test Topic ${random}`,
      slug: `test-topic-stats-update-${random}`,
      createdById: user.id,
    })
    await createPost(user, {
      title: 'Review for stats test',
      markdown: VALID_REVIEW_MARKDOWN,
      post_type: 'review',
      review_topic_ratings: [{ topic_id: topicId, rating: 5 }],
    })
    await updateTopicRatingStats(topicId)

    const stats = await getTopicRatingStats(topicId)
    expect(stats?.ratings__count__5).toBe(0)
  })
})

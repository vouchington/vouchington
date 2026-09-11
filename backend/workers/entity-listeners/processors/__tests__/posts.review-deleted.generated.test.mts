import { it, expect, beforeAll, describe } from 'vitest'
import {
  createTestUser,
  insertTestReview,
  insertTestTopic,
  deleteTestPost,
  getTopicRatingStats,
} from '@voucha/test-helpers'
import { updateTopicRatingStats } from '@services/topics/ratings'
import { processPostDeleted } from '../posts.mts'
import type { PrivateUser } from '@services/users/types'

describe('posts.review-deleted.generated', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })
  it('review delete leaves topic-rating projection to post-publication reconciliation', async () => {
    const topicId = await insertTestTopic({
      name: `Test Topic ${Date.now()}`,
      slug: `test-topic-${Date.now()}`,
      createdById: user.id,
    })
    const reviewId = await insertTestReview({
      userId: user.id,
      topicRatings: [{ topicId, rating: 5 }],
      title: 'Review title',
      markdown: 'Review content',
    })
    await updateTopicRatingStats(topicId)

    const statsBefore = await getTopicRatingStats(topicId)
    expect(Number(statsBefore?.ratings__count__5)).toBe(1)

    await deleteTestPost(reviewId)
    await processPostDeleted({ id: reviewId })

    const statsAfter = await getTopicRatingStats(topicId)
    expect(Number(statsAfter?.ratings__count__5)).toBe(1)
  })
})

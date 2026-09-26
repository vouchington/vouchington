import { randomUUID } from 'node:crypto'
import { it, expect, beforeAll, describe } from 'vitest'
import { createPost } from '../create.mts'
import { updatePost } from '../update.mts'
import { createTestUser, insertTestTopic, WEB_PROVENANCE } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import type { Post } from '../types.mts'
import { OFFICIAL_ACCOUNT_TRUST_SIGNAL_FORBIDDEN } from '@modules/on-error/error-codes'

describe('update.review-content-validation', () => {
  // Valid review content: >= 150 chars, >= 30 words, >= 3 sentences.
  const VALID_REVIEW_MARKDOWN =
    'This credit card offers fantastic rewards and I have been using it for over a year now with great satisfaction. ' +
    'The annual fee is absolutely worth every penny when you factor in all the generous benefits and perks available. ' +
    'The customer service team is very helpful and responsive, making it my top recommendation for frequent travelers.'

  let admin: PrivateUser
  let user: PrivateUser
  let topicId: string
  let userReview: Post

  beforeAll(async () => {
    admin = await createTestUser({ administrator: true })
    user = await createTestUser()

    const random = randomUUID().slice(0, 8)
    topicId = await insertTestTopic({
      name: `Update Review Validation Topic ${random}`,
      slug: `update-review-validation-topic-${random}`,
      createdById: admin.id,
    })

    // Regular user creates a review with valid content.
    userReview = await createPost(WEB_PROVENANCE, user, {
      post_type: 'review',
      markdown: VALID_REVIEW_MARKDOWN,
      review_topic_ratings: [{ topic_id: topicId, rating: 4 }],
    })
  })

  it('updatePost rejects review update with too-short markdown', async () => {
    await expect(updatePost(user, userReview, { markdown: 'Too short.' })).rejects.toMatchObject({
      status: 422,
      message: expect.stringContaining('150 characters'),
    })
  })

  it('updatePost title-only update on review does not trigger content check', async () => {
    // Updating only the title must not run assertValidReviewContent (markdown not in changes).
    const updated = await updatePost(user, userReview, { title: 'Updated Title' })
    expect(updated!.title).toBe('Updated Title')
  })

  it('updatePost rejects official accounts editing community reviews', async () => {
    await expect(
      updatePost(admin, userReview, { markdown: VALID_REVIEW_MARKDOWN }),
    ).rejects.toMatchObject({
      status: 403,
      code: OFFICIAL_ACCOUNT_TRUST_SIGNAL_FORBIDDEN,
      message: 'Official accounts cannot edit community reviews or data points.',
    })
  })
})

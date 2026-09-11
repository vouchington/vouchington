import { randomUUID } from 'node:crypto'
import { it, expect, beforeAll, describe } from 'vitest'
import { createPost } from '../create.mts'
import { createTestUser, insertTestTopic } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { OFFICIAL_ACCOUNT_TRUST_SIGNAL_FORBIDDEN } from '@modules/on-error/error-codes'

describe('create.review-content-validation', () => {
  // Valid review content: >= 150 chars, >= 30 words, >= 3 sentences.
  const VALID_REVIEW_MARKDOWN =
    'This credit card offers fantastic rewards and I have been using it for over a year now with great satisfaction. ' +
    'The annual fee is absolutely worth every penny when you factor in all the generous benefits and perks available. ' +
    'The customer service team is very helpful and responsive, making it my top recommendation for frequent travelers.'

  // Passes chars and words but only has 2 sentences.
  const TWO_SENTENCE_MARKDOWN =
    'This credit card has excellent rewards and cashback programs that make everyday spending very worthwhile and ' +
    'I have been a cardholder for two years now enjoying every benefit available without any complaints whatsoever. ' +
    'The annual fee is completely worth paying given all the perks, travel credits, and customer service you receive'

  let admin: PrivateUser
  let user: PrivateUser
  let topicId: string

  beforeAll(async () => {
    admin = await createTestUser({ administrator: true })
    user = await createTestUser()
    const random = randomUUID().slice(0, 8)
    topicId = await insertTestTopic({
      name: `Review Content Validation Topic ${random}`,
      slug: `review-content-validation-topic-${random}`,
      createdById: admin.id,
    })
  })

  function makeReviewInput(markdown: string) {
    return {
      post_type: 'review' as const,
      markdown,
      review_topic_ratings: [{ topic_id: topicId, rating: 4 }],
    }
  }

  it('createPost rejects review with too few characters', async () => {
    await expect(createPost(user, makeReviewInput('Too short.'))).rejects.toMatchObject({
      status: 422,
      message: expect.stringContaining('150 characters'),
    })
  })

  it('createPost rejects review with enough chars but too few words', async () => {
    // 3 "words" of 50+ chars each — passes char check, fails word check
    const fewWords = `${'a'.repeat(50)} ${'b'.repeat(50)} ${'c'.repeat(51)}`
    await expect(createPost(user, makeReviewInput(fewWords))).rejects.toMatchObject({
      status: 422,
      message: expect.stringContaining('30 words'),
    })
  })

  it('createPost rejects review with enough chars and words but only 2 sentences', async () => {
    await expect(createPost(user, makeReviewInput(TWO_SENTENCE_MARKDOWN))).rejects.toMatchObject({
      status: 422,
      message: expect.stringContaining('3 sentences'),
    })
  })

  it('createPost accepts review that meets all minimums', async () => {
    const post = await createPost(user, makeReviewInput(VALID_REVIEW_MARKDOWN))
    expect(post.post_type).toBe('review')
    expect(post.markdown).toBe(VALID_REVIEW_MARKDOWN)
  })

  it('createPost rejects official accounts creating reviews', async () => {
    await expect(createPost(admin, makeReviewInput(VALID_REVIEW_MARKDOWN))).rejects.toMatchObject({
      status: 403,
      code: OFFICIAL_ACCOUNT_TRUST_SIGNAL_FORBIDDEN,
      message: 'Official accounts cannot create community reviews or data points.',
    })
  })
})

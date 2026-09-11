import { randomUUID } from 'node:crypto'
import { it, expect, describe, beforeAll } from 'vitest'
import {
  assertReviewTopicsAllowReviews,
  assertValidReviewTopicRatings,
} from './validate-review-topic-ratings.mts'
import { createTestUser } from '@voucha/test-helpers'
import {
  insertTestTopic,
  mergeTopicForTest,
  softDeleteTopic,
} from '@voucha/test-helpers/entities/topics'
import type { PrivateUser } from '@services/users/types'

const VALID_TOPIC_IDS = [
  '01234567-89ab-7def-0123-456789abcdef',
  '01234567-89ab-7def-0123-456789abcde0',
  '01234567-89ab-7def-0123-456789abcde1',
  '01234567-89ab-7def-0123-456789abcde2',
  '01234567-89ab-7def-0123-456789abcde3',
  '01234567-89ab-7def-0123-456789abcde4',
]

function makeRatings(count: number) {
  return VALID_TOPIC_IDS.slice(0, count).map((topic_id, index) => ({
    topic_id,
    rating: (index % 5) + 1,
  }))
}

describe('assertValidReviewTopicRatings', () => {
  it('accepts the default maximum rating count', () => {
    expect(() => assertValidReviewTopicRatings(makeRatings(5), { maxItems: 5 })).not.toThrow()
  })

  it('rejects ratings above the default maximum count', () => {
    expect(() => assertValidReviewTopicRatings(makeRatings(6), { maxItems: 5 })).toThrow(
      'Review topic ratings must not exceed 5 items',
    )
  })

  it('keeps duplicate topic rejection unchanged', () => {
    expect(() =>
      assertValidReviewTopicRatings([
        { topic_id: VALID_TOPIC_IDS[0]!, rating: 5 },
        { topic_id: VALID_TOPIC_IDS[0]!, rating: 3 },
      ]),
    ).toThrow('Duplicate topic ratings are not allowed')
  })
})

describe('assertReviewTopicsAllowReviews', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser({ administrator: true })
  })

  it('passes when every topic allows reviews', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topicId = await insertTestTopic({
      name: `Reviewable ${random}`,
      slug: `reviewable-${random}`,
      createdById: user.id,
      allowReviews: true,
    })
    await expect(assertReviewTopicsAllowReviews([topicId])).resolves.toBeUndefined()
  })

  it('rejects with 422 when a topic does not allow reviews', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const noReviewTopicId = await insertTestTopic({
      name: `No Review ${random}`,
      slug: `no-review-${random}`,
      createdById: user.id,
      allowReviews: false,
    })
    await expect(assertReviewTopicsAllowReviews([noReviewTopicId])).rejects.toMatchObject({
      status: 422,
      message: 'Reviews are not allowed on this topic',
    })
  })

  it('rejects a missing topic as not found', async () => {
    await expect(assertReviewTopicsAllowReviews([randomUUID()])).rejects.toMatchObject({
      status: 422,
      message: 'Topic not found',
    })
  })

  it('rejects when any topic in the set does not allow reviews', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const reviewableId = await insertTestTopic({
      name: `Mixed Reviewable ${random}`,
      slug: `mixed-reviewable-${random}`,
      createdById: user.id,
      allowReviews: true,
    })
    const noReviewId = await insertTestTopic({
      name: `Mixed No Review ${random}`,
      slug: `mixed-no-review-${random}`,
      createdById: user.id,
      allowReviews: false,
    })
    await expect(assertReviewTopicsAllowReviews([reviewableId, noReviewId])).rejects.toMatchObject({
      status: 422,
      message: 'Reviews are not allowed on this topic',
    })
  })

  it('rejects a soft-deleted topic', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topicId = await insertTestTopic({
      name: `Deleted Reviewable ${random}`,
      slug: `deleted-reviewable-${random}`,
      createdById: user.id,
      allowReviews: true,
    })
    await softDeleteTopic(topicId, user.id)

    await expect(assertReviewTopicsAllowReviews([topicId])).rejects.toMatchObject({
      status: 422,
      message: 'Topic not found',
    })
  })

  it('rejects a merged topic', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const sourceId = await insertTestTopic({
      name: `Merged Source Reviewable ${random}`,
      slug: `merged-source-reviewable-${random}`,
      createdById: user.id,
      allowReviews: true,
    })
    const destinationId = await insertTestTopic({
      name: `Merged Destination Reviewable ${random}`,
      slug: `merged-destination-reviewable-${random}`,
      createdById: user.id,
      allowReviews: true,
    })
    await mergeTopicForTest(sourceId, destinationId, user.id)

    await expect(assertReviewTopicsAllowReviews([sourceId])).rejects.toMatchObject({
      status: 422,
      message: 'Topic not found',
    })
  })
})

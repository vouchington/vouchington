import { randomUUID } from 'node:crypto'
import { it, expect, beforeAll, describe } from 'vitest'
import { createPost } from '../create.mts'
import { createTestUser, insertTestTopic, WEB_PROVENANCE } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

const VALID_REVIEW_MARKDOWN =
  'This review gives detailed context from repeated personal use, including the strongest benefits, the weakest tradeoffs, and how the product performed over time. It explains why the rating is justified with concrete observations that another consumer could compare against their own needs. I would use these details to make the same decision again.'

describe('create.reviews.generated (create and validate)', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  it('createPost creates review with valid single topic rating', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topicId = await insertTestTopic({
      name: `Test Topic ${random}`,
      slug: `test-topic-review-1-${random}`,
      createdById: user.id,
    })
    const post = await createPost(WEB_PROVENANCE, user, {
      title: 'Review with rating 1',
      markdown: VALID_REVIEW_MARKDOWN,
      post_type: 'review',
      review_topic_ratings: [{ topic_id: topicId, rating: 1 }],
    })
    expect(post).toBeDefined()
    expect(post.post_type).toBe('review')
    expect(post.created_at).toBeInstanceOf(Date)
  })

  it('createPost creates review with valid rating 5', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topicId = await insertTestTopic({
      name: `Test Topic ${random}`,
      slug: `test-topic-review-5-${random}`,
      createdById: user.id,
    })
    const post = await createPost(WEB_PROVENANCE, user, {
      title: 'Review with rating 5',
      markdown: VALID_REVIEW_MARKDOWN,
      post_type: 'review',
      review_topic_ratings: [{ topic_id: topicId, rating: 5 }],
    })
    expect(post).toBeDefined()
    expect(post.post_type).toBe('review')
    expect(post.created_at).toBeInstanceOf(Date)
  })

  it('createPost creates multi-topic review with different ratings', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topicId1 = await insertTestTopic({
      name: `Test Topic A ${random}`,
      slug: `test-topic-a-${random}`,
      createdById: user.id,
    })
    const topicId2 = await insertTestTopic({
      name: `Test Topic B ${random}`,
      slug: `test-topic-b-${random}`,
      createdById: user.id,
    })
    const post = await createPost(WEB_PROVENANCE, user, {
      title: 'Multi-topic review',
      markdown: VALID_REVIEW_MARKDOWN,
      post_type: 'review',
      review_topic_ratings: [
        { topic_id: topicId1, rating: 5 },
        { topic_id: topicId2, rating: 3 },
      ],
    })
    expect(post).toBeDefined()
    expect(post.post_type).toBe('review')
    const ratings = post.review_topic_ratings
    expect(ratings).toBeDefined()
    expect(ratings?.length).toBe(2)
  })

  it('createPost validates ratings not all same when >= 2 topics', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topicId1 = await insertTestTopic({
      name: `Test Topic A ${random}`,
      slug: `test-topic-allsame-a-${random}`,
      createdById: user.id,
    })
    const topicId2 = await insertTestTopic({
      name: `Test Topic B ${random}`,
      slug: `test-topic-allsame-b-${random}`,
      createdById: user.id,
    })
    await expect(
      createPost(WEB_PROVENANCE, user, {
        title: 'Same rating review',
        markdown: VALID_REVIEW_MARKDOWN,
        post_type: 'review',
        review_topic_ratings: [
          { topic_id: topicId1, rating: 4 },
          { topic_id: topicId2, rating: 4 },
        ],
      }),
    ).rejects.toThrow('Review topic ratings cannot all be the same')
  })

  it('createPost validates duplicate topic_ids rejected', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topicId = await insertTestTopic({
      name: `Test Topic ${random}`,
      slug: `test-topic-dup-${random}`,
      createdById: user.id,
    })
    await expect(
      createPost(WEB_PROVENANCE, user, {
        title: 'Duplicate topic review',
        markdown: VALID_REVIEW_MARKDOWN,
        post_type: 'review',
        review_topic_ratings: [
          { topic_id: topicId, rating: 5 },
          { topic_id: topicId, rating: 3 },
        ],
      }),
    ).rejects.toThrow('Duplicate topic ratings are not allowed')
  })

  it('createPost validates review_topic_ratings is required', async () => {
    await expect(
      createPost(WEB_PROVENANCE, user, {
        title: 'Review without ratings',
        markdown: VALID_REVIEW_MARKDOWN,
        post_type: 'review',
      }),
    ).rejects.toThrow('At least one topic rating is required')
  })

  it('createPost validates rating range rejects 0', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topicId = await insertTestTopic({
      name: `Test Topic ${random}`,
      slug: `test-topic-rating-0-${random}`,
      createdById: user.id,
    })
    await expect(
      createPost(WEB_PROVENANCE, user, {
        title: 'Review with invalid rating 0',
        markdown: VALID_REVIEW_MARKDOWN,
        post_type: 'review',
        review_topic_ratings: [{ topic_id: topicId, rating: 0 }],
      }),
    ).rejects.toThrow('Rating must be an integer between 1 and 5')
  })

  it('createPost validates rating range rejects 6', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topicId = await insertTestTopic({
      name: `Test Topic ${random}`,
      slug: `test-topic-rating-6-${random}`,
      createdById: user.id,
    })
    await expect(
      createPost(WEB_PROVENANCE, user, {
        title: 'Review with invalid rating 6',
        markdown: VALID_REVIEW_MARKDOWN,
        post_type: 'review',
        review_topic_ratings: [{ topic_id: topicId, rating: 6 }],
      }),
    ).rejects.toThrow('Rating must be an integer between 1 and 5')
  })

  it('createPost validates topic_id is valid UUID', async () => {
    await expect(
      createPost(WEB_PROVENANCE, user, {
        title: 'Review with invalid topic ID',
        markdown: VALID_REVIEW_MARKDOWN,
        post_type: 'review',
        review_topic_ratings: [{ topic_id: 'not-a-uuid', rating: 5 }],
      }),
    ).rejects.toThrow('Invalid topic rating')
  })

  it('createPost maps missing review topics to a 422 error', async () => {
    await expect(
      createPost(WEB_PROVENANCE, user, {
        title: 'Review with missing topic',
        markdown: VALID_REVIEW_MARKDOWN,
        post_type: 'review',
        review_topic_ratings: [{ topic_id: randomUUID(), rating: 5 }],
      }),
    ).rejects.toMatchObject({
      message: 'Topic not found',
      status: 422,
    })
  })
})

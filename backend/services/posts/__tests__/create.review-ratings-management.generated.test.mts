import { it, expect, beforeAll, describe } from 'vitest'
import { createPost } from '../create.mts'
import { addPostRating, updatePostRating, deletePostRating } from '../post-ratings.mts'
import { getPostByAny } from '../get.mts'
import { createTestUser, insertTestTopic, WEB_PROVENANCE } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

const VALID_REVIEW_MARKDOWN =
  'This review gives detailed context from repeated personal use, including the strongest benefits, the weakest tradeoffs, and how the product performed over time. It explains why the rating is justified with concrete observations that another consumer could compare against their own needs. I would use these details to make the same decision again.'

describe('create.reviews.generated (ratings management)', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  it('addPostRating and updatePostRating manage review ratings individually', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topicId1 = await insertTestTopic({
      name: `Test Topic A ${random}`,
      slug: `test-topic-update-a-${random}`,
      createdById: user.id,
    })
    const topicId2 = await insertTestTopic({
      name: `Test Topic B ${random}`,
      slug: `test-topic-update-b-${random}`,
      createdById: user.id,
    })
    const post = await createPost(WEB_PROVENANCE, user, {
      title: 'Review to update',
      markdown: VALID_REVIEW_MARKDOWN,
      post_type: 'review',
      review_topic_ratings: [{ topic_id: topicId1, rating: 3 }],
    })
    await updatePostRating(user, post, topicId1, { rating: 5 })
    await addPostRating(user, post, { topic_id: topicId2, rating: 2, order_index: 1 })

    const updated = await getPostByAny(post.id)
    expect(updated).toBeDefined()
    expect(updated!.post_type).toBe('review')
    expect(updated!.review_topic_ratings?.length).toBe(2)
  })

  it('addPostRating rejects when all ratings would be the same', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topicId1 = await insertTestTopic({
      name: `Test Topic A ${random}`,
      slug: `test-topic-addallsame-a-${random}`,
      createdById: user.id,
    })
    const topicId2 = await insertTestTopic({
      name: `Test Topic B ${random}`,
      slug: `test-topic-addallsame-b-${random}`,
      createdById: user.id,
    })
    const post = await createPost(WEB_PROVENANCE, user, {
      title: 'Review to test add invariant',
      markdown: VALID_REVIEW_MARKDOWN,
      post_type: 'review',
      review_topic_ratings: [{ topic_id: topicId1, rating: 3 }],
    })
    // Adding topic2 with same rating as topic1 should fail
    await expect(
      addPostRating(user, post, { topic_id: topicId2, rating: 3, order_index: 1 }),
    ).rejects.toThrow('Ratings must not all be the same when comparing multiple topics')
  })

  it('updatePostRating rejects when all ratings would be the same', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topicId1 = await insertTestTopic({
      name: `Test Topic A ${random}`,
      slug: `test-topic-updateallsame-a-${random}`,
      createdById: user.id,
    })
    const topicId2 = await insertTestTopic({
      name: `Test Topic B ${random}`,
      slug: `test-topic-updateallsame-b-${random}`,
      createdById: user.id,
    })
    const post = await createPost(WEB_PROVENANCE, user, {
      title: 'Review to test update invariant',
      markdown: VALID_REVIEW_MARKDOWN,
      post_type: 'review',
      review_topic_ratings: [
        { topic_id: topicId1, rating: 5 },
        { topic_id: topicId2, rating: 3 },
      ],
    })
    // Updating topic2 to match topic1's rating should fail
    await expect(updatePostRating(user, post, topicId2, { rating: 5 })).rejects.toThrow(
      'Ratings must not all be the same when comparing multiple topics',
    )
  })

  it('updatePostRating validates rating range', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topicId = await insertTestTopic({
      name: `Test Topic ${random}`,
      slug: `test-topic-update-invalid-${random}`,
      createdById: user.id,
    })
    const post = await createPost(WEB_PROVENANCE, user, {
      title: 'Review to update with invalid rating',
      markdown: VALID_REVIEW_MARKDOWN,
      post_type: 'review',
      review_topic_ratings: [{ topic_id: topicId, rating: 3 }],
    })
    await expect(updatePostRating(user, post, topicId, { rating: 10 })).rejects.toThrow(
      'Rating must be an integer between 1 and 5',
    )
  })

  it('getPostByAny includes review_topic_ratings data', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topicName = `Test Topic ${random}`
    const topicSlug = `test-topic-get-review-${random}`
    const topicId = await insertTestTopic({
      name: topicName,
      slug: topicSlug,
      createdById: user.id,
    })
    const post = await createPost(WEB_PROVENANCE, user, {
      title: 'Review to retrieve',
      markdown: VALID_REVIEW_MARKDOWN,
      post_type: 'review',
      review_topic_ratings: [{ topic_id: topicId, rating: 4 }],
    })
    const retrieved = await getPostByAny(post.id)

    expect(retrieved).toBeDefined()
    expect(retrieved!.post_type).toBe('review')
    expect(retrieved!.review_topic_ratings).toBeDefined()
    expect(retrieved!.review_topic_ratings?.length).toBe(1)
    const rating = retrieved!.review_topic_ratings?.[0]
    expect(rating?.rating).toBe(4)
    expect(rating?.topic_id).toBe(topicId)
    expect(rating?.topic).toBeDefined()
    expect(rating?.topic?.id).toBe(topicId)
    expect(rating?.topic?.name).toBe(topicName)
    expect(rating?.topic?.slug).toBe(topicSlug)
  })

  it('createPost creates review with 3 topics with different ratings', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topicId1 = await insertTestTopic({
      name: `Test Topic A ${random}`,
      slug: `test-topic-3a-${random}`,
      createdById: user.id,
    })
    const topicId2 = await insertTestTopic({
      name: `Test Topic B ${random}`,
      slug: `test-topic-3b-${random}`,
      createdById: user.id,
    })
    const topicId3 = await insertTestTopic({
      name: `Test Topic C ${random}`,
      slug: `test-topic-3c-${random}`,
      createdById: user.id,
    })
    const post = await createPost(WEB_PROVENANCE, user, {
      title: 'Three-topic review',
      markdown: VALID_REVIEW_MARKDOWN,
      post_type: 'review',
      review_topic_ratings: [
        { topic_id: topicId1, rating: 5 },
        { topic_id: topicId2, rating: 3 },
        { topic_id: topicId3, rating: 1 },
      ],
    })
    expect(post).toBeDefined()
    expect(post.post_type).toBe('review')
    const ratings = post.review_topic_ratings
    expect(ratings).toBeDefined()
    expect(ratings?.length).toBe(3)
  })

  it('createPost rejects 3 topics with all same rating', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topicId1 = await insertTestTopic({
      name: `Test Topic A ${random}`,
      slug: `test-topic-3same-a-${random}`,
      createdById: user.id,
    })
    const topicId2 = await insertTestTopic({
      name: `Test Topic B ${random}`,
      slug: `test-topic-3same-b-${random}`,
      createdById: user.id,
    })
    const topicId3 = await insertTestTopic({
      name: `Test Topic C ${random}`,
      slug: `test-topic-3same-c-${random}`,
      createdById: user.id,
    })
    await expect(
      createPost(WEB_PROVENANCE, user, {
        title: 'Three-topic same rating review',
        markdown: VALID_REVIEW_MARKDOWN,
        post_type: 'review',
        review_topic_ratings: [
          { topic_id: topicId1, rating: 4 },
          { topic_id: topicId2, rating: 4 },
          { topic_id: topicId3, rating: 4 },
        ],
      }),
    ).rejects.toThrow('Review topic ratings cannot all be the same')
  })

  it('deletePostRating removes a rating from a multi-topic review', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topicId1 = await insertTestTopic({
      name: `Test Topic A ${random}`,
      slug: `test-topic-del-a-${random}`,
      createdById: user.id,
    })
    const topicId2 = await insertTestTopic({
      name: `Test Topic B ${random}`,
      slug: `test-topic-del-b-${random}`,
      createdById: user.id,
    })
    const post = await createPost(WEB_PROVENANCE, user, {
      title: 'Review to delete rating from',
      markdown: VALID_REVIEW_MARKDOWN,
      post_type: 'review',
      review_topic_ratings: [
        { topic_id: topicId1, rating: 5 },
        { topic_id: topicId2, rating: 2 },
      ],
    })
    await deletePostRating(user, post, topicId2)
    const updated = await getPostByAny(post.id)
    expect(updated).toBeDefined()
    expect(updated!.review_topic_ratings?.length).toBe(1)
    expect(updated!.review_topic_ratings?.[0]?.topic_id).toBe(topicId1)
  })
})

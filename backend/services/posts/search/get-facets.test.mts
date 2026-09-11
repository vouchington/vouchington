import { it, expect, describe } from 'vitest'
import { getPostFacets } from './get-facets.mts'
import { getPostIds } from './get-ids.mts'
import {
  createTestPost,
  createTestTopic,
  createTestUser,
  insertTestReview,
} from '@voucha/test-helpers'

describe('get-facets', () => {
  it('getPostFacets returns total_count', async () => {
    const user = await createTestUser({ administrator: true })
    await createTestPost({ user })
    await createTestPost({ user })

    const facets = await getPostFacets(undefined, { user_id: user!.id })

    expect(facets).toBeDefined()
    expect(typeof facets.total_count).toBe('number')
    expect(facets.total_count).toBeGreaterThanOrEqual(2)
  })

  it('getPostFacets count matches getPostIds results (no pagination)', async () => {
    const user = await createTestUser({ administrator: true })
    await createTestPost({ user })
    await createTestPost({ user })
    await createTestPost({ user })

    const searchOptions = { user_id: user!.id, limit: 100 }

    const facets = await getPostFacets(undefined, searchOptions)
    const ids = await getPostIds(undefined, searchOptions)

    // Count should match number of results when limit is high enough
    expect(facets.total_count).toBe(ids.results.length)
  })

  it('getPostFacets ignores pagination parameters', async () => {
    const user = await createTestUser({ administrator: true })
    await createTestPost({ user })
    await createTestPost({ user })
    await createTestPost({ user })

    const facetsWithoutPagination = await getPostFacets(undefined, {
      user_id: user!.id,
    })

    const facetsWithPagination = await getPostFacets(undefined, {
      user_id: user!.id,
      limit: 1,
      after: 'base64-cursor-string',
    })

    // Total count should be the same regardless of pagination
    expect(facetsWithoutPagination.total_count).toBe(facetsWithPagination.total_count)
  })

  it('getPostFacets filters by post_type', async () => {
    const user = await createTestUser({ administrator: true })
    await createTestPost({ user, post_type: 'discussion' })
    await createTestPost({ user, post_type: 'discussion' })

    const facets = await getPostFacets(undefined, {
      user_id: user!.id,
      post_types: ['discussion'],
    })

    expect(facets.total_count).toBeGreaterThanOrEqual(2)
  })

  it('getPostFacets filters by review_topic_ids', async () => {
    const user = await createTestUser({ administrator: true })
    const topic = await createTestTopic()

    await insertTestReview({
      userId: user!.id,
      topicRatings: [{ topicId: topic.id, rating: 5 }],
      title: 'Great',
    })

    await insertTestReview({
      userId: user!.id,
      topicRatings: [{ topicId: topic.id, rating: 4 }],
      title: 'Good',
    })

    const facets = await getPostFacets(undefined, { review_topic_ids: [topic.id] })

    expect(facets.total_count).toBeGreaterThanOrEqual(2)
  })
})

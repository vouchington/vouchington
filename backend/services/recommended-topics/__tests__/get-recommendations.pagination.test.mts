import { it, expect, beforeAll, describe } from 'vitest'
import {
  createTestUser,
  insertTestTopic,
  insertTestPost,
  linkPostToTopic,
  markPostsAsViewed,
} from '@voucha/test-helpers'
import { getRecommendedTopics } from '@services/recommended-topics'
import { encodeCursor } from '@modules/pagination'
import type { PrivateUser } from '@services/users/types'

describe('get-recommendations.pagination', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser({ administrator: true })
  })
  it('pagination works correctly with cursor', async () => {
    // Create 5 topics with different scores
    const topics: string[] = []
    const postIds: string[] = []
    for (let i = 0; i < 5; i++) {
      const topicId = await insertTestTopic({
        name: `Pagination Topic ${i} ${Math.random()}`,
        slug: `pag-topic-${i}-${Date.now()}`,
        createdById: user.id,
      })
      topics.push(topicId)

      const postId = await insertTestPost({
        title: `Post for Pagination Topic ${i} ${Math.random()}`,
        slug: `pag-post-${i}-${Date.now()}`,
        markdown: `Content ${i}`,
        createdById: user.id,
      })
      postIds.push(postId)
      await linkPostToTopic(postId, topicId, user.id)
    }

    await markPostsAsViewed(user.id, postIds)

    // First page - limit 2
    const page1 = await getRecommendedTopics(user, { limit: 2 })
    expect(page1.results.length).toBe(2)
    expect(page1.page_info.has_next_page).toBe(true)
    expect(page1.page_info.end_cursor).toBeTruthy()

    // Second page - use cursor
    const page2 = await getRecommendedTopics(user, {
      limit: 2,
      after: page1.page_info.end_cursor!,
    })
    expect(page2.results.length).toBe(2)
    expect(page2.page_info.has_next_page).toBe(true)

    // Verify no overlap
    const page1Ids = new Set(page1.results.map(r => r.id))
    const page2Ids = new Set(page2.results.map(r => r.id))
    const overlap = [...page1Ids].filter(id => page2Ids.has(id))
    expect(overlap.length).toBe(0)

    // Last page
    const page3 = await getRecommendedTopics(user, {
      limit: 2,
      after: page2.page_info.end_cursor!,
    })
    expect(page3.results.length).toBe(1)
    expect(page3.page_info.has_next_page).toBe(false)
    expect(page3.page_info.end_cursor).toBeNull()
  })

  it('pagination handles topics with same scores correctly', async () => {
    // Create multiple topics that will have the SAME score (2.0 from viewed_posts)
    const topics: string[] = []
    const postIds: string[] = []
    for (let i = 0; i < 4; i++) {
      const topicId = await insertTestTopic({
        name: `Same Score Topic ${i} ${Math.random()}`,
        slug: `same-score-topic-${i}-${Date.now()}`,
        createdById: user.id,
      })
      topics.push(topicId)

      const postId = await insertTestPost({
        title: `Post for Same Score Topic ${i} ${Math.random()}`,
        slug: `same-score-post-${i}-${Date.now()}`,
        markdown: `Content ${i}`,
        createdById: user.id,
      })
      postIds.push(postId)
      await linkPostToTopic(postId, topicId, user.id)
    }

    await markPostsAsViewed(user.id, postIds)

    // Get first page with limit 2
    const page1 = await getRecommendedTopics(user, { limit: 2 })
    expect(page1.results.length).toBe(2)
    expect(page1.page_info.has_next_page).toBe(true)

    // All topics should have same score (2.0 from viewed_posts)
    const score1 = page1.results[0].score
    expect(page1.results.every(r => r.score === score1)).toBe(true)

    // Get second page - should use composite cursor (score, id) correctly
    const page2 = await getRecommendedTopics(user, {
      limit: 2,
      after: page1.page_info.end_cursor!,
    })

    // Should get 2 more different topics
    expect(page2.results.length).toBe(2)

    // Verify no overlap between pages
    const page1Ids = new Set(page1.results.map(r => r.id))
    const page2Ids = new Set(page2.results.map(r => r.id))
    const overlap = [...page1Ids].filter(id => page2Ids.has(id))
    expect(overlap.length).toBe(0)

    // Verify ordering is consistent (by id when score is same)
    const allResults = [...page1.results, ...page2.results]
    const sortedByIdManually = allResults.toSorted((a, b) => a.id.localeCompare(b.id))
    expect(allResults.map(r => r.id)).toEqual(sortedByIdManually.map(r => r.id))
  })

  it('rejects invalid cursor format with 400 error', async () => {
    // Invalid cursor with extra keys
    const invalidCursor1 = encodeCursor({ score: 5.0, id: 'test-id', extra: 'field' } as any)
    await expect(getRecommendedTopics(user, { after: invalidCursor1 })).rejects.toThrow(
      'Invalid cursor for score sorting',
    )

    // Invalid cursor with only id (missing score) for default score sorting
    const invalidCursor2 = encodeCursor({ id: 'test-id' })
    await expect(getRecommendedTopics(user, { after: invalidCursor2 })).rejects.toThrow(
      'Invalid cursor for score sorting',
    )
  })
})

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

describe('get-recommendations.sorting', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser({ administrator: true })
  })
  it('sorts by best (alphabetical)', async () => {
    // Use a shared random suffix so names stay unique between runs while preserving
    // alphabetical order: Apple... < Mango... < Zebra...
    const suffix = crypto.randomUUID().slice(0, 8)
    const topics = [
      { name: `Zebra Topic ${suffix}`, slug: `zebra-${Date.now()}-${Math.random()}` },
      { name: `Apple Topic ${suffix}`, slug: `apple-${Date.now()}-${Math.random()}` },
      { name: `Mango Topic ${suffix}`, slug: `mango-${Date.now()}-${Math.random()}` },
    ]

    const topicIds: string[] = []
    const posts: string[] = []
    for (const { name, slug } of topics) {
      const topicId = await insertTestTopic({
        name,
        slug,
        createdById: user.id,
      })
      topicIds.push(topicId)

      const postId = await insertTestPost({
        title: `Post for ${name} ${Math.random()}`,
        slug: `post-${slug}`,
        markdown: 'Content',
        createdById: user.id,
      })
      posts.push(postId)
      await linkPostToTopic(postId, topicId, user.id)
    }

    await markPostsAsViewed(user.id, posts)

    // Get recommendations sorted by best (alphabetical by name)
    const results = await getRecommendedTopics(user, { sort: 'best' })

    // Find our topics in results
    const ourTopics = results.results.filter(r => topicIds.includes(r.id))
    expect(ourTopics.length).toBe(3)

    // Verify alphabetical order (suffix is shared so ordering is preserved)
    const names = ourTopics.map(r => {
      const topic = topics.find((_, i) => topicIds[i] === r.id)
      return topic?.name
    })
    expect(names).toEqual([
      `Apple Topic ${suffix}`,
      `Mango Topic ${suffix}`,
      `Zebra Topic ${suffix}`,
    ])
  })

  it('pagination works with best sort', async () => {
    // Use a shared random suffix to ensure uniqueness across runs
    const suffix = crypto.randomUUID().slice(0, 8)
    const topics = [
      { name: `Alpha ${suffix}`, slug: `alpha-${Date.now()}-${Math.random()}` },
      { name: `Beta ${suffix}`, slug: `beta-${Date.now()}-${Math.random()}` },
      { name: `Gamma ${suffix}`, slug: `gamma-${Date.now()}-${Math.random()}` },
      { name: `Delta ${suffix}`, slug: `delta-${Date.now()}-${Math.random()}` },
      { name: `Epsilon ${suffix}`, slug: `epsilon-${Date.now()}-${Math.random()}` },
    ]

    const posts = []
    for (const { name, slug } of topics) {
      const topicId = await insertTestTopic({
        name,
        slug,
        createdById: user.id,
      })

      const postId = await insertTestPost({
        title: `Post for ${name} ${Math.random()}`,
        slug: `post-${slug}`,
        markdown: 'Content',
        createdById: user.id,
      })
      posts.push(postId)
      await linkPostToTopic(postId, topicId, user.id)
    }

    await markPostsAsViewed(user.id, posts)

    // First page with limit 2
    const page1 = await getRecommendedTopics(user, { sort: 'best', limit: 2 })
    expect(page1.results.length).toBeGreaterThanOrEqual(2)
    expect(page1.page_info.has_next_page).toBe(true)
    expect(page1.page_info.end_cursor).toBeTruthy()

    // Second page
    const page2 = await getRecommendedTopics(user, {
      sort: 'best',
      limit: 2,
      after: page1.page_info.end_cursor!,
    })
    expect(page2.results.length).toBeGreaterThanOrEqual(2)

    // Verify no overlap
    const page1Ids = new Set(page1.results.map(r => r.id))
    const page2Ids = new Set(page2.results.map(r => r.id))
    const overlap = [...page1Ids].filter(id => page2Ids.has(id))
    expect(overlap.length).toBe(0)
  })

  it('rejects invalid cursor for best sort', async () => {
    // ScoreCursor is invalid for best sort
    const invalidCursor = encodeCursor({ score: 5.0, id: 'test-id' })
    await expect(
      getRecommendedTopics(user, { sort: 'best', after: invalidCursor }),
    ).rejects.toThrow('Invalid cursor for best sorting')
  })
})

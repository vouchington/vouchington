import { it, expect, beforeAll, describe } from 'vitest'
import {
  createTestUser,
  insertTestTopic,
  insertTestPost,
  linkPostToTopic,
  markPostsAsViewed,
  dismissTopicRecommendation,
  followTopicById,
} from '@voucha/test-helpers'
import { getRecommendedTopics } from '@services/recommended-topics'
import type { PrivateUser } from '@services/users/types'

describe('get-recommendations.basic', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser({ administrator: true })
  })
  it('returns empty results when user has no interactions', async () => {
    const result = await getRecommendedTopics(user, {})

    expect(result.results).toEqual([])
    expect(result.page_info.has_next_page).toBe(false)
  })

  it('full flow: get recommendations, dismiss one, get new recommendations', async () => {
    // Create two topics
    const topic1Id = await insertTestTopic({
      name: `Recommendation Topic 1 ${Math.random()}`,
      slug: `rec-topic-1-${Date.now()}`,
      createdById: user.id,
    })

    const topic2Id = await insertTestTopic({
      name: `Recommendation Topic 2 ${Math.random()}`,
      slug: `rec-topic-2-${Date.now()}`,
      createdById: user.id,
    })

    // Create posts related to each topic
    const post1Id = await insertTestPost({
      title: `Post for Topic 1 ${Math.random()}`,
      slug: `post-1-${Date.now()}`,
      markdown: 'Content about topic 1',
      createdById: user.id,
    })

    const post2Id = await insertTestPost({
      title: `Post for Topic 2 ${Math.random()}`,
      slug: `post-2-${Date.now()}`,
      markdown: 'Content about topic 2',
      createdById: user.id,
    })

    // Link posts to topics using entity relations
    await linkPostToTopic(post1Id, topic1Id, user.id)
    await linkPostToTopic(post2Id, topic2Id, user.id)

    // User views both posts
    await markPostsAsViewed(user.id, [post1Id, post2Id])

    // Step 1: Get recommendations - should include both topics
    const recommendations1 = await getRecommendedTopics(user, {})
    expect(recommendations1.results.length).toBeGreaterThanOrEqual(2)
    expect(recommendations1.results.some(r => r.id === topic1Id)).toBe(true)
    expect(recommendations1.results.some(r => r.id === topic2Id)).toBe(true)

    // Verify recommendations have scores and reasons
    const topic1Rec = recommendations1.results.find(r => r.id === topic1Id)
    expect(topic1Rec?.score).toBeGreaterThan(0)
    expect(topic1Rec?.reason).toContain('from_viewed_posts')

    // Step 2: User dismisses topic 1 recommendation
    await dismissTopicRecommendation(user.id, topic1Id)

    // Step 3: Get recommendations again - should NOT include topic 1 anymore
    const recommendations2 = await getRecommendedTopics(user, {})
    expect(recommendations2.results.some(r => r.id === topic1Id)).toBe(false)
    expect(recommendations2.results.some(r => r.id === topic2Id)).toBe(true)

    // Step 4: User follows topic 2
    await followTopicById(user.id, topic2Id)

    // Step 5: Get recommendations again - should NOT include topic 2 anymore (already followed)
    const recommendations3 = await getRecommendedTopics(user, {})
    expect(recommendations3.results.some(r => r.id === topic1Id)).toBe(false) // Still dismissed
    expect(recommendations3.results.some(r => r.id === topic2Id)).toBe(false) // Now followed
  })
})

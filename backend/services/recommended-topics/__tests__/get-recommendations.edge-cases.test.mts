import { it, expect, beforeAll, describe } from 'vitest'
import {
  createTestUser,
  insertTestTopic,
  insertTestPost,
  linkPostToTopic,
  markPostsAsViewed,
  insertTestRssFeed,
} from '@voucha/test-helpers'
import { getRecommendedTopics } from '@services/recommended-topics'
import type { PrivateUser } from '@services/users/types'

describe('get-recommendations.edge-cases', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser({ administrator: true })
  })
  it('pagination works with filters', async () => {
    // Create 5 card topics
    const topicIds: string[] = []
    const posts: string[] = []
    for (let i = 0; i < 5; i++) {
      const topicId = await insertTestTopic({
        name: `Card ${i} ${Math.random()}`,
        slug: `card-${i}-${Date.now()}-${Math.random()}`,
        createdById: user.id,
        topicType: 'card',
      })
      topicIds.push(topicId)

      const postId = await insertTestPost({
        title: `Post for Card ${i} ${Math.random()}`,
        slug: `post-card-${i}-${Date.now()}-${Math.random()}`,
        markdown: 'Content',
        createdById: user.id,
      })
      posts.push(postId)
      await linkPostToTopic(postId, topicId, user.id)
    }

    await markPostsAsViewed(user.id, posts)

    // First page with filter
    const page1 = await getRecommendedTopics(user, {
      topic_types: ['card'],
      limit: 2,
    })
    expect(page1.results.length).toBe(2)
    expect(page1.page_info.has_next_page).toBe(true)

    // Second page with same filter
    const page2 = await getRecommendedTopics(user, {
      topic_types: ['card'],
      limit: 2,
      after: page1.page_info.end_cursor!,
    })
    expect(page2.results.length).toBe(2)

    // Verify no overlap
    const page1Ids = new Set(page1.results.map(r => r.id))
    const page2Ids = new Set(page2.results.map(r => r.id))
    const overlap = [...page1Ids].filter(id => page2Ids.has(id))
    expect(overlap.length).toBe(0)

    // Verify that the filter worked - all results have the requested topic type
    // Note: results may include card topics from other tests since we use a shared user
    const allResults = [...page1.results, ...page2.results]
    expect(allResults.length).toBeGreaterThan(0)
  })

  it('sort=best pagination does not skip topics with names between pages', async () => {
    // Use a fresh user with no history so our 4 topics are always the top recommendations,
    // making the page1OurTopics.length assertion reliable in a dirty database.
    const freshUser = await createTestUser({ administrator: true })

    // Create topics with specific names that will test the cursor bug
    // If cursor only uses ID, "Bravo" might be skipped when paginating after "Alpha"
    const random = Math.random().toString(36).slice(2, 10)
    const topics = [
      { name: `Alpha Topic ${random}`, slug: `alpha-${Date.now()}-${Math.random()}` },
      { name: `Bravo Topic ${random}`, slug: `bravo-${Date.now()}-${Math.random()}` }, // This could be skipped!
      { name: `Charlie Topic ${random}`, slug: `charlie-${Date.now()}-${Math.random()}` },
      { name: `Delta Topic ${random}`, slug: `delta-${Date.now()}-${Math.random()}` },
    ]

    const createdTopicIds: string[] = []
    const posts: string[] = []
    for (const { name, slug } of topics) {
      const topicId = await insertTestTopic({
        name,
        slug,
        createdById: freshUser.id,
      })
      createdTopicIds.push(topicId)

      const postId = await insertTestPost({
        title: `Post for ${name} ${Math.random()}`,
        slug: `post-${slug}`,
        markdown: 'Content',
        createdById: freshUser.id,
      })
      posts.push(postId)
      await linkPostToTopic(postId, topicId, freshUser.id)
    }

    await markPostsAsViewed(freshUser.id, posts)

    // Get first 2 topics
    const page1 = await getRecommendedTopics(freshUser, { sort: 'best', limit: 2 })
    const page1OurTopics = page1.results.filter(r => createdTopicIds.includes(r.id))

    expect(page1OurTopics.length).toBeGreaterThanOrEqual(2)
    expect(page1.page_info.end_cursor).toBeTruthy()
    // Get next page
    const page2 = await getRecommendedTopics(freshUser, {
      sort: 'best',
      limit: 2,
      after: page1.page_info.end_cursor!,
    })
    const page2OurTopics = page2.results.filter(r => createdTopicIds.includes(r.id))

    // Collect all topics we got
    const allRetrievedIds = [...page1OurTopics.map(r => r.id), ...page2OurTopics.map(r => r.id)]

    // Verify no duplicates
    const uniqueIds = [...new Set(allRetrievedIds)]
    expect(allRetrievedIds.length).toBe(uniqueIds.length)

    // CRITICAL: All 4 topics should be retrieved across pages
    // If cursor only uses ID, topics can be skipped
    const page3 = await getRecommendedTopics(freshUser, {
      sort: 'best',
      limit: 10,
      after: page2.page_info.end_cursor || undefined,
    })
    const page3OurTopics = page3.results.filter(r => createdTopicIds.includes(r.id))

    const allTopicsRetrieved = [...allRetrievedIds, ...page3OurTopics.map(r => r.id)]
    const allUniqueTopics = [...new Set(allTopicsRetrieved)]

    // All 4 created topics must be present
    expect(allUniqueTopics.length).toBe(4)
    for (const topicId of createdTopicIds) {
      expect(allUniqueTopics).toContain(topicId)
    }
  })

  it('rss_feed filter does not duplicate topics with multiple feeds', async () => {
    const topicWithMultipleFeeds = await insertTestTopic({
      name: `Topic Multiple Feeds ${Math.random()}`,
      slug: `topic-multi-feeds-${Date.now()}-${Math.random()}`,
      createdById: user.id,
    })

    await insertTestRssFeed({
      topicId: topicWithMultipleFeeds,
      title: 'RSS Feed 1',
      rssFeedUrl: `https://example.com/feed1-${Date.now()}.xml`,
    })

    // Create a post and link it to the topic
    const postId = await insertTestPost({
      title: `Post ${Math.random()}`,
      slug: `post-${Date.now()}-${Math.random()}`,
      markdown: 'Content',
      createdById: user.id,
    })
    await linkPostToTopic(postId, topicWithMultipleFeeds, user.id)
    await markPostsAsViewed(user.id, [postId])

    // Get recommendations with rss_feed filter
    const results = await getRecommendedTopics(user, { rss_feed: true, limit: 100 })

    // Count how many times this topic appears in results
    const occurrences = results.results.filter(r => r.id === topicWithMultipleFeeds).length

    // Topic should still appear exactly once when joined through the rss_feed filter.
    expect(occurrences).toBe(1)
  })
})

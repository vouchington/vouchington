import { it, expect, describe } from 'vitest'
import { addRecentlyViewed, getRecentlyViewedIds } from '../index.mts'
import {
  createTestLandingPage,
  createTestTopic,
  createTestUser,
  createTestRssFeedItemWithUrl,
  insertTestPost,
  insertTestRssFeed,
} from '@voucha/test-helpers'

describe('index.all-entity-types.generated', () => {
  // Tests for posts
  it('addRecentlyViewed adds a post to recently viewed', async () => {
    const user = await createTestUser({ administrator: true })
    const random = Math.random().toString(36).slice(2, 15)

    const postId = await insertTestPost({
      title: `Test Post ${random}`,
      slug: `test-post-${random}`,
      createdById: user!.id,
      markdown: `Test post content ${random}`,
    })
    await addRecentlyViewed(user!.id, user!.id, 'post', postId)
    const viewed = await getRecentlyViewedIds(user!.id, user!.id, 'post')
    expect(viewed).toContain(postId)
  })

  it('addRecentlyViewed maintains order for posts with most recent first', async () => {
    const user = await createTestUser({ administrator: true })
    const random = Math.random().toString(36).slice(2, 15)

    const post1Id = await insertTestPost({
      title: `Test Post 1 ${random}`,
      slug: `test-post-1-${random}`,
      createdById: user!.id,
      markdown: `Test post 1 ${random}`,
    })
    const post2Id = await insertTestPost({
      title: `Test Post 2 ${random}`,
      slug: `test-post-2-${random}`,
      createdById: user!.id,
      markdown: `Test post 2 ${random}`,
    })
    await addRecentlyViewed(user!.id, user!.id, 'post', post1Id)
    await addRecentlyViewed(user!.id, user!.id, 'post', post2Id)

    const viewed = await getRecentlyViewedIds(user!.id, user!.id, 'post', 100)
    const idx1 = viewed.indexOf(post1Id)
    const idx2 = viewed.indexOf(post2Id)
    expect(idx1).toBeGreaterThanOrEqual(0)
    expect(idx2).toBeGreaterThanOrEqual(0)
    expect(idx2).toBeLessThan(idx1) // post2 more recent, appears first
  })

  it('getRecentlyViewedIds returns empty array when no posts viewed', async () => {
    const user = await createTestUser({ administrator: true })
    const viewed = await getRecentlyViewedIds(user!.id, user!.id, 'post')
    expect(viewed).toEqual([])
  })

  // Tests for rss_feed_items
  it('addRecentlyViewed adds an rss_feed_item to recently viewed', async () => {
    const user = await createTestUser({ administrator: true })
    const random = Math.random().toString(36).slice(2, 15)

    const topic = await createTestTopic({
      user: user!,
      name: `Test Topic ${random}`,
      slug: `test-topic-${random}`,
      hostname: `recent-${random}.example.com`,
    })
    const rssFeedId = await insertTestRssFeed({
      topicId: topic.id,
      title: `Test Feed ${random}`,
    })
    const rssFeedItem = await createTestRssFeedItemWithUrl(rssFeedId)

    await addRecentlyViewed(user!.id, user!.id, 'rss_feed_item', rssFeedItem.id)
    const viewed = await getRecentlyViewedIds(user!.id, user!.id, 'rss_feed_item')
    expect(viewed).toContain(rssFeedItem.id)
  })

  it('addRecentlyViewed maintains order for rss_feed_items with most recent first', async () => {
    const user = await createTestUser({ administrator: true })
    const random = Math.random().toString(36).slice(2, 15)

    const topic = await createTestTopic({
      user: user!,
      name: `Test Topic ${random}`,
      slug: `test-topic-${random}`,
      hostname: `recent-order-${random}.example.com`,
    })
    const rssFeedId = await insertTestRssFeed({
      topicId: topic.id,
      title: `Test Feed ${random}`,
    })
    const rssFeedItem1 = await createTestRssFeedItemWithUrl(rssFeedId)
    const rssFeedItem2 = await createTestRssFeedItemWithUrl(rssFeedId)

    await addRecentlyViewed(user!.id, user!.id, 'rss_feed_item', rssFeedItem1.id)
    await addRecentlyViewed(user!.id, user!.id, 'rss_feed_item', rssFeedItem2.id)

    const viewed = await getRecentlyViewedIds(user!.id, user!.id, 'rss_feed_item', 100)
    const idx1 = viewed.indexOf(rssFeedItem1.id)
    const idx2 = viewed.indexOf(rssFeedItem2.id)
    expect(idx1).toBeGreaterThanOrEqual(0)
    expect(idx2).toBeGreaterThanOrEqual(0)
    expect(idx2).toBeLessThan(idx1) // rssFeedItem2 more recent, appears first
  })

  it('getRecentlyViewedIds returns empty array when no rss_feed_items viewed', async () => {
    const user = await createTestUser({ administrator: true })
    const viewed = await getRecentlyViewedIds(user!.id, user!.id, 'rss_feed_item')
    expect(viewed).toEqual([])
  })

  // Tests for users
  it('addRecentlyViewed adds a user to recently viewed', async () => {
    const user = await createTestUser({ administrator: true })
    const viewedUser = await createTestUser({ administrator: true })
    await addRecentlyViewed(user!.id, user!.id, 'user', viewedUser!.id)
    const viewed = await getRecentlyViewedIds(user!.id, user!.id, 'user')
    expect(viewed).toContain(viewedUser!.id)
  })

  it('addRecentlyViewed maintains order for users with most recent first', async () => {
    const user = await createTestUser({ administrator: true })
    const viewedUser1 = await createTestUser({ administrator: true })
    const viewedUser2 = await createTestUser({ administrator: true })
    await addRecentlyViewed(user!.id, user!.id, 'user', viewedUser1!.id)
    await addRecentlyViewed(user!.id, user!.id, 'user', viewedUser2!.id)

    const viewed = await getRecentlyViewedIds(user!.id, user!.id, 'user', 100)
    const idx1 = viewed.indexOf(viewedUser1!.id)
    const idx2 = viewed.indexOf(viewedUser2!.id)
    expect(idx1).toBeGreaterThanOrEqual(0)
    expect(idx2).toBeGreaterThanOrEqual(0)
    expect(idx2).toBeLessThan(idx1) // viewedUser2 more recent, appears first
  })

  it('getRecentlyViewedIds returns empty array when no users viewed', async () => {
    const user = await createTestUser({ administrator: true })
    const viewed = await getRecentlyViewedIds(user!.id, user!.id, 'user')
    expect(viewed).toEqual([])
  })

  // Test session vs user context
  it('addRecentlyViewed stores session and user context when userId is provided', async () => {
    const user = await createTestUser({ administrator: true })
    const random = Math.random().toString(36).slice(2, 15)
    const topic = await createTestTopic({
      user: user!,
      name: `Test Topic ${random}`,
      slug: `test-topic-${random}`,
      hostname: `recent-session-${random}.example.com`,
    })
    const sessionId = user!.id
    const userId = user!.id

    await addRecentlyViewed(sessionId, userId, 'topic', topic.id)

    // Should be able to query by just session
    const viewedBySession = await getRecentlyViewedIds(sessionId, null, 'topic')
    expect(viewedBySession).toContain(topic.id)

    // Should also be able to query by session + user
    const viewedByUser = await getRecentlyViewedIds(sessionId, userId, 'topic')
    expect(viewedByUser).toContain(topic.id)
  })

  it('getRecentlyViewedIds includes user history when userId is provided', async () => {
    const user = await createTestUser({ administrator: true })
    const random = Math.random().toString(36).slice(2, 15)

    // Create topics
    const topic2 = await createTestTopic({
      user: user!,
      name: `Test Topic 2 ${random}`,
      slug: `test-topic-2-${random}`,
      hostname: `merge-2-${random}.example.com`,
    })
    const sessionId2 = user!.id // Logged in session
    const userId = user!.id

    // Add topic2 in logged-in session
    await addRecentlyViewed(sessionId2, userId, 'topic', topic2.id)

    // Query with same user - should see topic2 from user history
    const viewed = await getRecentlyViewedIds(sessionId2, userId, 'topic')
    expect(viewed).toContain(topic2.id)
  })

  // Tests for landing_pages
  it('addRecentlyViewed adds a landing page to recently viewed', async () => {
    const user = await createTestUser({ administrator: true })
    const { landingPageId } = await createTestLandingPage(user!.id, 'Test LP')
    await addRecentlyViewed(user!.id, user!.id, 'landing_page', landingPageId)
    const viewed = await getRecentlyViewedIds(user!.id, user!.id, 'landing_page')
    expect(viewed).toContain(landingPageId)
  })

  it('addRecentlyViewed maintains order for landing pages with most recent first', async () => {
    const user = await createTestUser({ administrator: true })
    const { landingPageId: lp1 } = await createTestLandingPage(user!.id, 'LP 1')
    const { landingPageId: lp2 } = await createTestLandingPage(user!.id, 'LP 2')
    await addRecentlyViewed(user!.id, user!.id, 'landing_page', lp1)
    await addRecentlyViewed(user!.id, user!.id, 'landing_page', lp2)
    const viewed = await getRecentlyViewedIds(user!.id, user!.id, 'landing_page', 100)
    const idx1 = viewed.indexOf(lp1)
    const idx2 = viewed.indexOf(lp2)
    expect(idx1).toBeGreaterThanOrEqual(0)
    expect(idx2).toBeGreaterThanOrEqual(0)
    expect(idx2).toBeLessThan(idx1) // lp2 viewed more recently, should appear first
  })

  it('getRecentlyViewedIds returns empty array when no landing pages viewed', async () => {
    const user = await createTestUser({ administrator: true })
    const viewed = await getRecentlyViewedIds(user!.id, user!.id, 'landing_page')
    expect(viewed).toEqual([])
  })

  it('different entity types do not interfere with each other', async () => {
    const user = await createTestUser({ administrator: true })
    const random = Math.random().toString(36).slice(2, 15)

    // Create a topic
    const topic = await createTestTopic({
      user: user!,
      name: `Test Topic ${random}`,
      slug: `test-topic-${random}`,
      hostname: `different-${random}.example.com`,
    })
    // Create a post
    const postId = await insertTestPost({
      title: `Test Post ${random}`,
      slug: `test-post-${random}`,
      createdById: user!.id,
      markdown: `Test post ${random}`,
    })
    // Create an RSS feed item
    const rssFeedId = await insertTestRssFeed({
      topicId: topic.id,
      title: `Test Feed ${random}`,
    })
    const rssFeedItem = await createTestRssFeedItemWithUrl(rssFeedId)

    // Create a user to view (different from the viewer)
    const viewedUser = await createTestUser({ administrator: true })

    // Add all entity types to recently viewed
    await addRecentlyViewed(user!.id, user!.id, 'topic', topic.id)
    await addRecentlyViewed(user!.id, user!.id, 'post', postId)
    await addRecentlyViewed(user!.id, user!.id, 'rss_feed_item', rssFeedItem.id)
    await addRecentlyViewed(user!.id, user!.id, 'user', viewedUser!.id)

    // Each entity type should have its own list
    const viewedTopics = await getRecentlyViewedIds(user!.id, user!.id, 'topic')
    const viewedPosts = await getRecentlyViewedIds(user!.id, user!.id, 'post')
    const viewedRssFeedItems = await getRecentlyViewedIds(user!.id, user!.id, 'rss_feed_item')
    const viewedUsers = await getRecentlyViewedIds(user!.id, user!.id, 'user')

    expect(viewedTopics).toContain(topic.id)
    expect(viewedPosts).toContain(postId)
    expect(viewedRssFeedItems).toContain(rssFeedItem.id)
    expect(viewedUsers).toContain(viewedUser!.id)
  })
})

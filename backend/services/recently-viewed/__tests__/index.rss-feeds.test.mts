import { it, expect, describe } from 'vitest'
import { addRecentlyViewed, getRecentlyViewedIds } from '../index.mts'
import { createTestTopic, createTestUser, insertTestRssFeed } from '@voucha/test-helpers'

describe('index.rss-feeds', () => {
  it('addRecentlyViewed adds an rss_feed to recently viewed', async () => {
    const user = await createTestUser({ administrator: true })
    const random = Math.random().toString(36).slice(2, 15)
    const topic = await createTestTopic({
      user: user!,
      name: `Test Topic ${random}`,
      slug: `test-topic-${random}`,
      hostname: `rss-feed-rv-${random}.example.com`,
    })
    const rssFeedId = await insertTestRssFeed({
      topicId: topic.id,
      title: `Test Feed ${random}`,
    })
    await addRecentlyViewed(user!.id, user!.id, 'rss_feed', rssFeedId)
    const viewed = await getRecentlyViewedIds(user!.id, user!.id, 'rss_feed')
    expect(viewed).toContain(rssFeedId)
  })

  it('addRecentlyViewed maintains order for rss_feeds with most recent first', async () => {
    const user = await createTestUser({ administrator: true })
    const random = Math.random().toString(36).slice(2, 15)
    const topic1 = await createTestTopic({
      user: user!,
      name: `Test Topic 1 ${random}`,
      slug: `test-topic-1-${random}`,
      hostname: `rss-feed-ord-1-${random}.example.com`,
    })
    const rssFeed1Id = await insertTestRssFeed({
      topicId: topic1.id,
      title: `Test Feed 1 ${random}`,
    })
    const topic2 = await createTestTopic({
      user: user!,
      name: `Test Topic 2 ${random}`,
      slug: `test-topic-2-${random}`,
      hostname: `rss-feed-ord-2-${random}.example.com`,
    })
    const rssFeed2Id = await insertTestRssFeed({
      topicId: topic2.id,
      title: `Test Feed 2 ${random}`,
    })
    await addRecentlyViewed(user!.id, user!.id, 'rss_feed', rssFeed1Id)
    await addRecentlyViewed(user!.id, user!.id, 'rss_feed', rssFeed2Id)
    const viewed = await getRecentlyViewedIds(user!.id, user!.id, 'rss_feed', 100)
    const idx1 = viewed.indexOf(rssFeed1Id)
    const idx2 = viewed.indexOf(rssFeed2Id)
    expect(idx1).toBeGreaterThanOrEqual(0)
    expect(idx2).toBeGreaterThanOrEqual(0)
    expect(idx2).toBeLessThan(idx1) // rssFeed2 more recent, appears first
  })

  it('getRecentlyViewedIds returns empty array when no rss_feeds viewed', async () => {
    const user = await createTestUser({ administrator: true })
    const viewed = await getRecentlyViewedIds(user!.id, user!.id, 'rss_feed')
    expect(viewed).toEqual([])
  })
})

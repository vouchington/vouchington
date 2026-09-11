import { it, expect, describe } from 'vitest'
import { searchRssFeedItems } from '@services/rss-feed-items/search'
import { upsertRssFeedItems } from '@services/rss-feed-items/upsert'
import { createTestTopic, insertTestRssFeedDirect } from '@voucha/test-helpers'
import { getRssFeedItemsByIdBatch } from '@services/rss-feed-items/get-batch'
import { caches } from '@services/entity-cache/caches'
import { updateRssFeedById } from '../update.mts'

// Reconstructed locally rather than imported from @services/entity-fetch: entity-fetch already
// depends on @services/rss-feeds, so importing entity-fetch's cached getter back into rss-feeds
// would create a fresh rss-feeds<->entity-fetch cycle.
const getRssFeedItemByIdCachedBatch =
  caches.rss_feed_items.cacheGetByAnyBatch(getRssFeedItemsByIdBatch)

async function updateDisabledAt(rssFeedId: string) {
  await updateRssFeedById(rssFeedId, { enabled: false })
}

describe('search.generated (basic)', () => {
  it('searchRssFeedItems returns items sorted by published_at DESC', async () => {
    const feed = await insertTestRssFeedDirect({})
    const random = Math.random().toString(36).slice(2, 15)

    await upsertRssFeedItems(feed.id, [
      {
        link: `https://example.com/article1-${random}`,
        guid: `guid1-${random}`,
        title: 'Article 1',
        pubDate: '2025-01-01T00:00:00Z',
      },
      {
        link: `https://example.com/article2-${random}`,
        guid: `guid2-${random}`,
        title: 'Article 2',
        pubDate: '2025-01-02T00:00:00Z',
      },
    ])
    const itemIds = (await searchRssFeedItems({ rss_feed_ids: [feed.id], limit: 10 })).results.map(
      result => result.id,
    )
    expect(Array.isArray(itemIds)).toBe(true)
    const results = await getRssFeedItemByIdCachedBatch(itemIds)
    const feedItems = results.filter((r): r is NonNullable<typeof r> => r != null)
    expect(feedItems.length).toBeGreaterThanOrEqual(2)
    // Article 2 (newer, published 2025-01-02) should come before Article 1 (older, published 2025-01-01)
    expect(feedItems[0]!.published_at.getTime()).toBeGreaterThanOrEqual(
      feedItems[1]!.published_at.getTime(),
    )
  })

  it('searchRssFeedItems filters by rss_feed_ids', async () => {
    const feed1 = await insertTestRssFeedDirect({})
    const feed2 = await insertTestRssFeedDirect({})
    const random = Math.random().toString(36).slice(2, 15)

    await upsertRssFeedItems(feed1.id, [
      {
        link: `https://example.com/article1-${random}`,
        guid: `guid1-${random}`,
        title: 'Article 1',
        pubDate: '2025-01-01T00:00:00Z',
      },
    ])
    await upsertRssFeedItems(feed2.id, [
      {
        link: `https://example.com/article2-${random}`,
        guid: `guid2-${random}`,
        title: 'Article 2',
        pubDate: '2025-01-02T00:00:00Z',
      },
    ])
    const itemIds = (await searchRssFeedItems({ rss_feed_ids: [feed1.id] })).results.map(
      result => result.id,
    )
    const results = await getRssFeedItemByIdCachedBatch(itemIds)
    const feed1Items = results.filter(r => r?.rss_feed?.id === feed1.id)
    const feed2Items = results.filter(r => r?.rss_feed?.id === feed2.id)
    expect(feed1Items.length).toBeGreaterThan(0)
    expect(feed2Items.length).toBe(0)
  })

  it('searchRssFeedItems filters by topic_ids', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topic1 = await createTestTopic({ hostname: `topic-1-${random}.example.com` })
    const topic2 = await createTestTopic({ hostname: `topic-2-${random}.example.com` })

    const feed1 = await insertTestRssFeedDirect({
      topicId: topic1.id,
      rssFeedUrl: `https://example.com/topic-1-feed-${random}.xml`,
      title: `Topic 1 Feed ${random}`,
    })
    const feed2 = await insertTestRssFeedDirect({
      topicId: topic2.id,
      rssFeedUrl: `https://example.com/topic-2-feed-${random}.xml`,
      title: `Topic 2 Feed ${random}`,
    })

    await upsertRssFeedItems(feed1.id, [
      {
        link: `https://example.com/topic-1-article-${random}`,
        guid: `topic-1-guid-${random}`,
        title: 'Topic 1 Article',
        pubDate: '2025-01-01T00:00:00Z',
      },
    ])
    await upsertRssFeedItems(feed2.id, [
      {
        link: `https://example.com/topic-2-article-${random}`,
        guid: `topic-2-guid-${random}`,
        title: 'Topic 2 Article',
        pubDate: '2025-01-02T00:00:00Z',
      },
    ])
    const itemIds = (await searchRssFeedItems({ topic_ids: [topic1.id] })).results.map(
      result => result.id,
    )
    const results = await getRssFeedItemByIdCachedBatch(itemIds)
    const topic1Items = results.filter(r => r?.rss_feed?.topic?.id === topic1.id)
    const topic2Items = results.filter(r => r?.rss_feed?.topic?.id === topic2.id)
    expect(topic1Items.length).toBeGreaterThan(0)
    expect(topic2Items.length).toBe(0)
  })

  it('searchRssFeedItems topic_ids ignores disabled feeds', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const enabledTopic = await createTestTopic({ hostname: `enabled-topic-${random}.example.com` })
    const disabledTopic = await createTestTopic({
      hostname: `disabled-topic-${random}.example.com`,
    })

    const enabledFeed = await insertTestRssFeedDirect({
      topicId: enabledTopic.id,
      rssFeedUrl: `https://example.com/enabled-topic-feed-${random}.xml`,
      title: `Enabled Topic Feed ${random}`,
    })
    const disabledFeed = await insertTestRssFeedDirect({
      topicId: disabledTopic.id,
      rssFeedUrl: `https://example.com/disabled-topic-feed-${random}.xml`,
      title: `Disabled Topic Feed ${random}`,
    })

    await upsertRssFeedItems(enabledFeed.id, [
      {
        link: `https://example.com/enabled-topic-article-${random}`,
        guid: `enabled-topic-guid-${random}`,
        title: 'Enabled Topic Article',
        pubDate: '2025-01-01T00:00:00Z',
      },
    ])
    await upsertRssFeedItems(disabledFeed.id, [
      {
        link: `https://example.com/disabled-topic-article-${random}`,
        guid: `disabled-topic-guid-${random}`,
        title: 'Disabled Topic Article',
        pubDate: '2025-01-02T00:00:00Z',
      },
    ])
    await updateDisabledAt(disabledFeed.id)

    const itemIds = (
      await searchRssFeedItems({ topic_ids: [enabledTopic.id, disabledTopic.id] })
    ).results.map(result => result.id)
    const results = await getRssFeedItemByIdCachedBatch(itemIds)

    expect(results.some(result => result?.rss_feed?.id === enabledFeed.id)).toBe(true)
    expect(results.some(result => result?.rss_feed?.id === disabledFeed.id)).toBe(false)
  })

  it('searchRssFeedItems respects limit', async () => {
    const feed = await insertTestRssFeedDirect({})
    const random = Math.random().toString(36).slice(2, 15)

    await upsertRssFeedItems(feed.id, [
      {
        link: `https://example.com/article1-${random}`,
        guid: `guid1-${random}`,
        title: 'Article 1',
        pubDate: '2025-01-01T00:00:00Z',
      },
      {
        link: `https://example.com/article2-${random}`,
        guid: `guid2-${random}`,
        title: 'Article 2',
        pubDate: '2025-01-02T00:00:00Z',
      },
    ])
    const itemIds = (await searchRssFeedItems({ limit: 1 })).results.map(result => result.id)
    expect(itemIds.length).toBeLessThanOrEqual(1)
  })
})

import { it, expect, describe } from 'vitest'
import { searchRssFeedItems } from '@services/rss-feed-items/search'
import { upsertRssFeedItems } from '@services/rss-feed-items/upsert'
import {
  createTestTopic,
  addCategoryToRssFeedItem,
  setRssFeedOwningTopicVoteScore,
  addRssFeedItemSource,
  insertTestRssFeedDirect,
} from '@voucha/test-helpers'
import { getRssFeedItemsByIdBatch } from '@services/rss-feed-items/get-batch'
import { caches } from '@services/entity-cache/caches'
import { updateRssFeedById } from '../update.mts'
import { evaluateRssFeedDiscoverability } from '../evaluate-discoverability.mts'

// Reconstructed locally rather than imported from @services/entity-fetch: entity-fetch already
// depends on @services/rss-feeds, so importing entity-fetch's cached getter back into rss-feeds
// would create a fresh rss-feeds<->entity-fetch cycle.
const getRssFeedItemByIdCachedBatch =
  caches.rss_feed_items.cacheGetByAnyBatch(getRssFeedItemsByIdBatch)

describe('search.suppression', () => {
  it('searchRssFeedItems filters by category_topic_ids', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const categoryTopic = await createTestTopic({ hostname: `cat-topic-${random}.example.com` })
    const otherTopic = await createTestTopic({ hostname: `other-topic-${random}.example.com` })

    const feed = await insertTestRssFeedDirect({
      topicId: otherTopic.id,
      rssFeedUrl: `https://example.com/cat-feed-${random}.xml`,
      title: `Cat Feed ${random}`,
    })

    const [catItem] = await upsertRssFeedItems(feed.id, [
      {
        link: `https://example.com/cat-article-${random}`,
        guid: `cat-guid-${random}`,
        title: 'Categorized Article',
        pubDate: '2025-06-01T00:00:00Z',
      },
      {
        link: `https://example.com/other-article-${random}`,
        guid: `other-guid-${random}`,
        title: 'Other Article',
        pubDate: '2025-06-02T00:00:00Z',
      },
    ])

    // Tag only the first item with the category topic
    await addCategoryToRssFeedItem(catItem!.id, categoryTopic.id)

    const catResult = await searchRssFeedItems({ category_topic_ids: [categoryTopic.id] })
    const catItemIds = catResult.results.map(r => r.id)
    const catItems = await getRssFeedItemByIdCachedBatch(catItemIds)

    const matchingCatItems = catItems.filter(r => r?.rss_feed?.id === feed.id)
    expect(matchingCatItems.length).toBe(1)
    expect(matchingCatItems[0]?.guid).toBe(`cat-guid-${random}`)
  })

  it('searchRssFeedItems hides items whose only source is not discoverable', async () => {
    const suppressedFeed = await insertTestRssFeedDirect({})
    const random = Math.random().toString(36).slice(2, 15)

    await upsertRssFeedItems(suppressedFeed.id, [
      {
        link: `https://example.com/suppressed-article-${random}`,
        guid: `suppressed-guid-${random}`,
        title: 'Suppressed Article',
        pubDate: '2025-05-01T00:00:00Z',
      },
    ])

    const beforeResult = await searchRssFeedItems({ rss_feed_ids: [suppressedFeed.id] })
    expect(beforeResult.results.length).toBeGreaterThan(0)

    await updateRssFeedById(suppressedFeed.id, { discoverable: false })

    const afterResult = await searchRssFeedItems({ rss_feed_ids: [suppressedFeed.id] })
    expect(afterResult.results.length).toBe(0)
  })

  it('searchRssFeedItems still shows items with multiple sources when only one is not discoverable', async () => {
    const suppressedFeed = await insertTestRssFeedDirect({})
    const unsuppressedFeed = await insertTestRssFeedDirect({})
    const random = Math.random().toString(36).slice(2, 15)

    const [item] = await upsertRssFeedItems(suppressedFeed.id, [
      {
        link: `https://example.com/multi-source-${random}`,
        guid: `multi-source-guid-${random}`,
        title: 'Multi-Source Article',
        pubDate: '2025-05-02T00:00:00Z',
      },
    ])
    await addRssFeedItemSource(unsuppressedFeed.id, item!.id)

    await updateRssFeedById(suppressedFeed.id, { discoverable: false })

    const result = await searchRssFeedItems({ rss_feed_ids: [unsuppressedFeed.id] })
    const ids = result.results.map(r => r.id)
    expect(ids).toContain(item!.id)
  })

  it('searchRssFeedItems auto-suppresses items when owning topic score falls below global threshold', async () => {
    const feed = await insertTestRssFeedDirect({})
    const random = Math.random().toString(36).slice(2, 15)

    await upsertRssFeedItems(feed.id, [
      {
        link: `https://example.com/auto-suppress-${random}`,
        guid: `auto-suppress-guid-${random}`,
        title: 'Auto Suppress Test Article',
        pubDate: '2025-05-03T00:00:00Z',
      },
    ])

    // Item is visible when score is at threshold (0)
    await setRssFeedOwningTopicVoteScore(feed.id, 0, 0)
    const visibleResult = await searchRssFeedItems({ rss_feed_ids: [feed.id] })
    expect(visibleResult.results.length).toBeGreaterThan(0)

    // Drop score below the auto-undiscoverable threshold and evaluate the async state machine.
    await setRssFeedOwningTopicVoteScore(feed.id, 0, 6)
    expect(await evaluateRssFeedDiscoverability(feed.id)).toBe('updated')
    const hiddenResult = await searchRssFeedItems({ rss_feed_ids: [feed.id] })
    expect(hiddenResult.results.length).toBe(0)
  })

  it('searchRssFeedItems category_topic_ids does not return source-owned items without category tag', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const sourceTopic = await createTestTopic({ hostname: `source-topic-${random}.example.com` })
    const categoryTopic = await createTestTopic({
      hostname: `category-topic-${random}.example.com`,
    })

    const feed = await insertTestRssFeedDirect({
      topicId: sourceTopic.id,
      rssFeedUrl: `https://example.com/source-feed-${random}.xml`,
      title: `Source Feed ${random}`,
    })

    await upsertRssFeedItems(feed.id, [
      {
        link: `https://example.com/source-article-${random}`,
        guid: `source-guid-${random}`,
        title: 'Source Article (no category tag)',
        pubDate: '2025-06-01T00:00:00Z',
      },
    ])

    // Filter by categoryTopic — this item is not tagged with it, only owned by sourceTopic
    const result = await searchRssFeedItems({ category_topic_ids: [categoryTopic.id] })
    const itemIds = result.results.map(r => r.id)
    const items = await getRssFeedItemByIdCachedBatch(itemIds)

    const feedItems = items.filter(r => r?.rss_feed?.id === feed.id)
    expect(feedItems.length).toBe(0)
  })
})

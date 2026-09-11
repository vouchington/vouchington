import { it, expect, describe } from 'vitest'
import { searchRssFeedItems } from '../search.mts'
import { upsertRssFeedItems } from '../upsert.mts'
import { insertTestStory, setTestItemStoryId, insertTestRssFeedDirect } from '@voucha/test-helpers'
import { caches } from '@services/entity-cache/caches'
import { getRssFeedItemsByIdBatch } from '../get-batch.mts'
import { getRssFeedItemKeyByGuid } from '../get.mts'

// Reconstructed locally rather than imported from @services/entity-fetch: entity-fetch already
// depends on @services/rss-feed-items, so importing entity-fetch's cached getter back into
// rss-feed-items would create a fresh rss-feed-items<->entity-fetch cycle. Same cache
// instance/TTL/invalidation-keys as entity-fetch's getRssFeedItemByIdCachedBatch.
const getRssFeedItemByIdCachedBatch =
  caches.rss_feed_items.cacheGetByAnyBatch(getRssFeedItemsByIdBatch)

describe('search.generated (pagination)', () => {
  it('searchRssFeedItems cursor returns only older items', async () => {
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
    // Page 1: get the newest item (limit 1, sorted by published_at DESC)
    const page1 = await searchRssFeedItems({ rss_feed_ids: [feed.id], limit: 1 })
    expect(page1.results).toHaveLength(1)
    expect(page1.page_info.has_next_page).toBe(true)
    expect(page1.page_info.end_cursor).toBeTruthy()
    // Page 2: use end_cursor to get the next (older) item
    const page2 = await searchRssFeedItems({
      rss_feed_ids: [feed.id],
      limit: 1,
      after: page1.page_info.end_cursor!,
    })
    expect(page2.results).toHaveLength(1)
    expect(page2.page_info.has_next_page).toBe(false)
    // Verify page 2 item is older than page 1 item
    expect(page2.results[0].published_at.getTime()).toBeLessThan(
      page1.results[0].published_at.getTime(),
    )
    // Verify no overlap
    expect(page2.results[0].id).not.toBe(page1.results[0].id)
  })

  it('paginates canonical story representatives without duplicates or gaps', async () => {
    const feed = await insertTestRssFeedDirect({})
    const random = Math.random().toString(36).slice(2, 15)
    await upsertRssFeedItems(feed.id, [
      {
        link: `https://example.com/a-${random}`,
        guid: `a-${random}`,
        title: 'A',
        pubDate: '2025-06-05T00:00:00Z',
      },
      {
        link: `https://example.com/b-${random}`,
        guid: `b-${random}`,
        title: 'B',
        pubDate: '2025-06-04T00:00:00Z',
      },
      {
        link: `https://example.com/c-${random}`,
        guid: `c-${random}`,
        title: 'C',
        pubDate: '2025-06-03T00:00:00Z',
      },
      {
        link: `https://example.com/d-${random}`,
        guid: `d-${random}`,
        title: 'D',
        pubDate: '2025-06-02T00:00:00Z',
      },
      {
        link: `https://example.com/e-${random}`,
        guid: `e-${random}`,
        title: 'E',
        pubDate: '2025-06-01T00:00:00Z',
      },
    ])
    // Look up item IDs by guid using the view
    const [itemAKey, itemBKey, itemCKey, itemDKey, itemEKey] = await Promise.all([
      getRssFeedItemKeyByGuid(`a-${random}`),
      getRssFeedItemKeyByGuid(`b-${random}`),
      getRssFeedItemKeyByGuid(`c-${random}`),
      getRssFeedItemKeyByGuid(`d-${random}`),
      getRssFeedItemKeyByGuid(`e-${random}`),
    ])
    expect(itemAKey).toBeDefined()
    expect(itemBKey).toBeDefined()
    expect(itemCKey).toBeDefined()
    expect(itemDKey).toBeDefined()
    expect(itemEKey).toBeDefined()
    const story = await insertTestStory({ officialRssFeedItemId: itemBKey!.id })
    await Promise.all([
      setTestItemStoryId(itemBKey!.id, story.id),
      setTestItemStoryId(itemCKey!.id, story.id),
      setTestItemStoryId(itemDKey!.id, story.id),
    ])
    const fullPage = await searchRssFeedItems({ rss_feed_ids: [feed.id], limit: 3 })
    expect(fullPage.results.map(result => result.id)).toEqual([
      itemAKey!.id,
      itemBKey!.id,
      itemEKey!.id,
    ])
    expect(fullPage.page_info.has_next_page).toBe(false)

    const page1 = await searchRssFeedItems({ rss_feed_ids: [feed.id], limit: 2 })
    expect(page1.results.map(result => result.id)).toEqual([itemAKey!.id, itemBKey!.id])
    expect(page1.page_info.has_next_page).toBe(true)
    const page2 = await searchRssFeedItems({
      rss_feed_ids: [feed.id],
      limit: 2,
      after: page1.page_info.end_cursor!,
    })
    expect(page2.results.map(result => result.id)).toEqual([itemEKey!.id])
    expect(page2.page_info.has_next_page).toBe(false)
  })

  it('searchRssFeedItems filters by text_search_query', async () => {
    const feed = await insertTestRssFeedDirect({})
    const random = Math.random().toString(36).slice(2, 15)
    const uniqueWord = `xqzrss${random}`

    await upsertRssFeedItems(feed.id, [
      {
        link: `https://example.com/match-${random}`,
        guid: `match-${random}`,
        title: `Unique ${uniqueWord} Article`,
        pubDate: '2025-03-01T00:00:00Z',
      },
      {
        link: `https://example.com/nomatch-${random}`,
        guid: `nomatch-${random}`,
        title: `Unrelated Banana Fruit ${random}`,
        pubDate: '2025-03-02T00:00:00Z',
      },
    ])

    const result = await searchRssFeedItems({
      rss_feed_ids: [feed.id],
      text_search_query: uniqueWord,
    })

    expect(result.results.length).toBe(1)
    const matchIds = await getRssFeedItemByIdCachedBatch(result.results.map(r => r.id))
    expect(matchIds[0]?.data.title).toContain(uniqueWord)
  })

  it('searchRssFeedItems pagination is stable for timestamp ties', async () => {
    const feed = await insertTestRssFeedDirect({})
    const random = Math.random().toString(36).slice(2, 15)
    const sharedDate = '2025-06-15T12:00:00Z'
    // Create 3 items with identical published_at
    await upsertRssFeedItems(feed.id, [
      {
        link: `https://example.com/tie-a-${random}`,
        guid: `tie-a-${random}`,
        title: 'Tie A',
        pubDate: sharedDate,
      },
      {
        link: `https://example.com/tie-b-${random}`,
        guid: `tie-b-${random}`,
        title: 'Tie B',
        pubDate: sharedDate,
      },
      {
        link: `https://example.com/tie-c-${random}`,
        guid: `tie-c-${random}`,
        title: 'Tie C',
        pubDate: sharedDate,
      },
    ])
    const seenIds = new Set<string>()
    // Page 1
    const page1 = await searchRssFeedItems({ rss_feed_ids: [feed.id], limit: 1 })
    expect(page1.results).toHaveLength(1)
    expect(page1.page_info.has_next_page).toBe(true)
    seenIds.add(page1.results[0].id)
    // Page 2
    const page2 = await searchRssFeedItems({
      rss_feed_ids: [feed.id],
      limit: 1,
      after: page1.page_info.end_cursor!,
    })
    expect(page2.results).toHaveLength(1)
    expect(page2.page_info.has_next_page).toBe(true)
    expect(seenIds.has(page2.results[0].id)).toBe(false)
    seenIds.add(page2.results[0].id)
    // Page 3
    const page3 = await searchRssFeedItems({
      rss_feed_ids: [feed.id],
      limit: 1,
      after: page2.page_info.end_cursor!,
    })
    expect(page3.results).toHaveLength(1)
    expect(page3.page_info.has_next_page).toBe(false)
    expect(seenIds.has(page3.results[0].id)).toBe(false)
    seenIds.add(page3.results[0].id)
    // All 3 items should have been returned exactly once
    expect(seenIds.size).toBe(3)
  })

  it('searchRssFeedItems validates cursor format', async () => {
    // Invalid cursor (not base64)
    await expect(searchRssFeedItems({ after: 'not-base64!!!' })).rejects.toThrow(/Invalid cursor/)

    // Valid base64 but not JSON
    const nonJsonBase64 = 'cGxhaW4tdGV4dA==' // "plain-text" in base64
    await expect(searchRssFeedItems({ after: nonJsonBase64 })).rejects.toThrow(Error)

    // Valid JSON but wrong cursor shape (not timestamp cursor)
    const wrongShapeCursor = Buffer.from(JSON.stringify({ id: 'test' })).toString('base64')
    await expect(searchRssFeedItems({ after: wrongShapeCursor })).rejects.toThrow(
      /expected timestamp cursor/,
    )
  })

  it('searchRssFeedItems filters by media_types', async () => {
    const feed = await insertTestRssFeedDirect({})
    const random = Math.random().toString(36).slice(2, 15)

    await upsertRssFeedItems(feed.id, [
      {
        link: `https://example.com/article-${random}`,
        guid: `article-${random}`,
        title: 'Article',
        pubDate: '2025-01-01T00:00:00Z',
      },
      {
        link: `https://example.com/audio-${random}`,
        guid: `audio-${random}`,
        title: 'Podcast Episode',
        pubDate: '2025-01-02T00:00:00Z',
        media_type: 'audio' as const,
        enclosure_url: `https://cdn.example.com/ep-${random}.mp3`,
        enclosure_type: 'audio/mpeg',
      },
      {
        link: `https://example.com/video-${random}`,
        guid: `video-${random}`,
        title: 'Video',
        pubDate: '2025-01-03T00:00:00Z',
        media_type: 'video' as const,
        video_id: `vid-${random}`,
        video_platform: 'youtube',
      },
    ])
    // Filter audio only
    const audioResult = await searchRssFeedItems({
      rss_feed_ids: [feed.id],
      media_types: ['audio'],
    })
    expect(audioResult.results).toHaveLength(1)
    // Filter video only
    const videoResult = await searchRssFeedItems({
      rss_feed_ids: [feed.id],
      media_types: ['video'],
    })
    expect(videoResult.results).toHaveLength(1)
    // Filter article + audio (excludes video)
    const mixedResult = await searchRssFeedItems({
      rss_feed_ids: [feed.id],
      media_types: ['article', 'audio'],
    })
    expect(mixedResult.results).toHaveLength(2)
    // No filter returns all three
    const allResult = await searchRssFeedItems({ rss_feed_ids: [feed.id] })
    expect(allResult.results).toHaveLength(3)
  })
})

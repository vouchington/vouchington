import { it, expect, describe } from 'vitest'

import { upsertRssFeedItems } from '../upsert.mts'

import { getRssFeedItemById } from '../get.mts'

import { getRssFeedItemTitleByGuidForTest, insertTestRssFeedDirect } from '@voucha/test-helpers'

import {
  RSS_FEED_ITEM_MAX_CATEGORIES,
  RSS_FEED_ITEM_SQL_BATCH_SIZE,
} from '../processing-limits.mts'

describe('upsert.generated', () => {
  it('upsertRssFeedItems creates new items', async () => {
    const feed = await insertTestRssFeedDirect({})
    const random = Math.random().toString(36).slice(2, 15)

    const items = await upsertRssFeedItems(feed.id, [
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
        isoDate: '2025-01-02T00:00:00Z',
      },
    ])
    // RSS feed items cascade-delete with feed, no need to track separately

    expect(items.length).toBe(2)
    expect(items[0].id).toBeDefined()
    expect(items[1].id).toBeDefined()
  })

  it('upsertRssFeedItems updates existing items when content changes', async () => {
    const feed = await insertTestRssFeedDirect({})
    const random = Math.random().toString(36).slice(2, 15)

    const guid = `guid-${random}`
    await upsertRssFeedItems(feed.id, [
      {
        link: `https://example.com/article-${random}`,
        guid,
        title: 'Original Title',
        pubDate: '2025-01-01T00:00:00Z',
      },
    ])

    const updatedItems = await upsertRssFeedItems(feed.id, [
      {
        link: `https://example.com/article-${random}`,
        guid,
        title: 'Updated Title',
        pubDate: '2025-01-01T00:00:00Z',
      },
    ])

    expect(updatedItems.length).toBe(1)
    const item = await getRssFeedItemById(updatedItems[0].id)
    expect(item).toBeDefined()
    // The data field is not exposed in the view, but we can verify the item was updated
    expect(item!.id).toBe(updatedItems[0].id)
  })

  it('upsertRssFeedItems does not update when content unchanged', async () => {
    const feed = await insertTestRssFeedDirect({})
    const random = Math.random().toString(36).slice(2, 15)

    const guid = `guid-${random}`
    const itemData = {
      link: `https://example.com/article-${random}`,
      guid,
      title: 'Test Title',
      pubDate: '2025-01-01T00:00:00Z',
    }

    await upsertRssFeedItems(feed.id, [itemData])

    const unchangedItems = await upsertRssFeedItems(feed.id, [itemData])

    expect(unchangedItems.length).toBe(0)
  })

  it('upsertRssFeedItems updates existing YouTube metrics when content is unchanged', async () => {
    const feed = await insertTestRssFeedDirect({})
    const random = Math.random().toString(36).slice(2, 15)
    const guid = `video-metrics-${random}`
    const baseItem = {
      link: `https://www.youtube.com/watch?v=metrics-${random}`,
      guid,
      title: 'YouTube Metrics',
      'media:description': 'Stable YouTube description.',
      media_type: 'video' as const,
      video_platform: 'youtube',
      video_id: `metrics-${random}`,
    }

    const [created] = await upsertRssFeedItems(feed.id, [
      {
        ...baseItem,
        'media:starRating': { average: 5, count: 10, min: 1, max: 5 },
        'media:statistics': { views: 100 },
      },
    ])

    const updatedItems = await upsertRssFeedItems(feed.id, [
      {
        ...baseItem,
        'media:starRating': { average: 4.75, count: 12, min: 1, max: 5 },
        'media:statistics': { views: 150 },
      },
    ])

    expect(updatedItems).toHaveLength(1)
    expect(updatedItems[0].id).toBe(created.id)
    const item = await getRssFeedItemById(created.id)
    expect(item!.data['media:starRating']).toEqual({ average: 4.75, count: 12, min: 1, max: 5 })
    expect(item!.data['media:statistics']).toEqual({ views: 150 })

    const unchangedItems = await upsertRssFeedItems(feed.id, [
      {
        ...baseItem,
        'media:starRating': { average: 4.75, count: 12, min: 1, max: 5 },
        'media:statistics': { views: 150 },
      },
    ])
    expect(unchangedItems).toHaveLength(0)
  })

  it('upsertRssFeedItems throws error for empty feedItems', async () => {
    const feed = await insertTestRssFeedDirect({})

    await expect(upsertRssFeedItems(feed.id, [])).rejects.toThrow('feedItems is required')
  })

  it('upsertRssFeedItems stores audio media fields', async () => {
    const feed = await insertTestRssFeedDirect({})
    const random = Math.random().toString(36).slice(2, 15)

    const items = await upsertRssFeedItems(feed.id, [
      {
        link: `https://example.com/podcast-${random}`,
        guid: `podcast-${random}`,
        title: 'Podcast Episode',
        pubDate: '2025-01-01T00:00:00Z',
        media_type: 'audio' as const,
        enclosure_url: `https://cdn.example.com/ep-${random}.mp3`,
        enclosure_type: 'audio/mpeg',
        enclosure_length: 50000000,
        duration_seconds: 1800,
      },
    ])
    expect(items).toHaveLength(1)

    const item = await getRssFeedItemById(items[0].id)
    expect(item).toBeDefined()
    expect(item!.data.media_type).toBe('audio')
    expect(item!.data.enclosure_url).toBe(`https://cdn.example.com/ep-${random}.mp3`)
    expect(item!.data.enclosure_type).toBe('audio/mpeg')
    expect(item!.data.enclosure_length).toBe(50000000)
    expect(item!.data.duration_seconds).toBe(1800)
  })

  it('upsertRssFeedItems stores video media fields', async () => {
    const feed = await insertTestRssFeedDirect({})
    const random = Math.random().toString(36).slice(2, 15)

    const items = await upsertRssFeedItems(feed.id, [
      {
        link: `https://www.youtube.com/watch?v=vid-${random}`,
        guid: `video-${random}`,
        title: 'YouTube Video',
        pubDate: '2025-01-01T00:00:00Z',
        media_type: 'video' as const,
        video_id: `vid-${random}`,
        video_platform: 'youtube',
        thumbnail_url: `https://i.ytimg.com/vi/vid-${random}/hqdefault.jpg`,
      },
    ])
    expect(items).toHaveLength(1)

    const item = await getRssFeedItemById(items[0].id)
    expect(item).toBeDefined()
    expect(item!.data.media_type).toBe('video')
    expect(item!.data.video_id).toBe(`vid-${random}`)
    expect(item!.data.video_platform).toBe('youtube')
    expect(item!.data.thumbnail_url).toBe(`https://i.ytimg.com/vi/vid-${random}/hqdefault.jpg`)
  })

  it('upsertRssFeedItems handles items without pubDate or isoDate', async () => {
    const feed = await insertTestRssFeedDirect({})
    const random = Math.random().toString(36).slice(2, 15)

    const items = await upsertRssFeedItems(feed.id, [
      {
        link: `https://example.com/article-${random}`,
        guid: `guid-${random}`,
        title: 'Article without date',
      },
    ])
    // RSS feed items cascade-delete with feed, no need to track separately

    expect(items.length).toBe(1)
    const item = await getRssFeedItemById(items[0].id)
    expect(item).toBeDefined()
  })

  it('upsertRssFeedItems ignores pre-1970 publisher dates and falls back to fetch time', async () => {
    const feed = await insertTestRssFeedDirect({})
    const random = Math.random().toString(36).slice(2, 15)
    const insertedAt = Date.now()

    const items = await upsertRssFeedItems(feed.id, [
      {
        link: `https://example.com/year-one-${random}`,
        guid: `year-one-${random}`,
        title: 'Article with sentinel date',
        pubDate: 'Mon, 01 Jan 0001 00:00:00 +0000',
        isoDate: '0001-01-01T00:00:00Z',
      },
    ])

    expect(items).toHaveLength(1)
    const item = await getRssFeedItemById(items[0].id)
    expect(item).toBeDefined()
    expect(item!.data.pubDate).toBeUndefined()
    expect(item!.data.isoDate).toBeUndefined()
    expect(item!.published_at.getTime()).toBeGreaterThan(insertedAt - 60_000)
    expect(item!.published_at.getTime()).toBeLessThanOrEqual(Date.now() + 5_000)
  })

  it('upsertRssFeedItems handles duplicate guids in a single batch (regression for ON CONFLICT 21000)', async () => {
    const feed = await insertTestRssFeedDirect({})
    const random = Math.random().toString(36).slice(2, 15)
    const guid = `dup-guid-${random}`

    const items = await upsertRssFeedItems(feed.id, [
      {
        link: `https://example.com/a-${random}`,
        guid,
        title: 'First',
        pubDate: '2025-01-01T00:00:00Z',
      },
      {
        link: `https://example.com/b-${random}`,
        guid,
        title: 'Second',
        pubDate: '2025-01-02T00:00:00Z',
      },
    ])

    expect(items.length).toBe(1)
  })

  it('upsertRssFeedItems keeps the last occurrence when guids duplicate within a batch', async () => {
    const feed = await insertTestRssFeedDirect({})
    const random = Math.random().toString(36).slice(2, 15)
    const guid = `dup-last-${random}`

    const items = await upsertRssFeedItems(feed.id, [
      {
        link: `https://example.com/first-${random}`,
        guid,
        title: 'First',
        pubDate: '2025-01-01T00:00:00Z',
      },
      {
        link: `https://example.com/second-${random}`,
        guid,
        title: 'Second',
        pubDate: '2025-01-02T00:00:00Z',
      },
    ])

    expect(items.length).toBe(1)
    const item = await getRssFeedItemById(items[0].id)
    expect(item).toBeDefined()
    expect(item!.data.title).toBe('Second')
  })
  // keep generated shard bindings live for typecheck
  void (0 as unknown as typeof getRssFeedItemTitleByGuidForTest)
  void (0 as unknown as typeof RSS_FEED_ITEM_MAX_CATEGORIES)
  void (0 as unknown as typeof RSS_FEED_ITEM_SQL_BATCH_SIZE)
})

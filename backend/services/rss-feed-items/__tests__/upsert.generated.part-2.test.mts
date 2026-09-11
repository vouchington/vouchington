import { afterEach, describe, expect, it, vi } from 'vitest'

import { upsertRssFeedItems } from '../upsert.mts'

import * as psqlEnqueues from '@queues/psql/enqueues'
import { createUnlinkedTopicAlias } from '@services/topics/aliases'
import { setTestRssFeedDiscoverable } from '@voucha/test-helpers/entities/rss-feeds-discovery'

import { getRssFeedItemByCompositeKey, getRssFeedItemById } from '../get.mts'

import {
  createTopHashtagRssSourceForTest,
  getRssFeedItemTitleByGuidForTest,
  insertTestRssFeedDirect,
} from '@voucha/test-helpers'

import {
  RSS_FEED_ITEM_MAX_CATEGORIES,
  RSS_FEED_ITEM_SQL_BATCH_SIZE,
} from '../processing-limits.mts'

describe('upsert.generated', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('refreshes top hashtags when an eligible source relinks an unchanged item', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const hostname = `top-hashtag-relink-${random}.example.com`
    const firstFeed = await insertTestRssFeedDirect({
      rssFeedUrl: `https://${hostname}/first.xml`,
      topicHostname: `first-${hostname}`,
    })
    const secondFeed = await insertTestRssFeedDirect({
      rssFeedUrl: `https://${hostname}/second.xml`,
      topicHostname: `second-${hostname}`,
    })
    const item = {
      link: `https://${hostname}/article`,
      guid: `top-hashtag-relink-${random}`,
      title: 'Top hashtag relink',
    }
    const [created] = await upsertRssFeedItems(firstFeed.id, [item])
    const alias = await createUnlinkedTopicAlias(`top-hashtag-relink-${random}`)
    await createTopHashtagRssSourceForTest({
      rssFeedItemId: created.id,
      topicAliasId: alias.id,
      authoredToken: `#top-hashtag-relink-${random}`,
    })
    await setTestRssFeedDiscoverable(firstFeed.id, false)
    const refreshTopHashtags = vi.spyOn(psqlEnqueues, 'enqueueRefreshTopHashtags')
    await expect(upsertRssFeedItems(secondFeed.id, [item])).resolves.toEqual([])
    expect(refreshTopHashtags).toHaveBeenCalledOnce()

    refreshTopHashtags.mockClear()
    await expect(upsertRssFeedItems(secondFeed.id, [item])).resolves.toEqual([])
    expect(refreshTopHashtags).not.toHaveBeenCalled()

    const changedItem = { ...item, guid: `${item.guid}-changed`, title: 'Before relink' }
    const [changed] = await upsertRssFeedItems(firstFeed.id, [changedItem])
    const changedAlias = await createUnlinkedTopicAlias(`${item.guid}-changed`)
    await createTopHashtagRssSourceForTest({
      rssFeedItemId: changed.id,
      topicAliasId: changedAlias.id,
      authoredToken: `#${item.guid}-changed`,
    })
    refreshTopHashtags.mockClear()

    await upsertRssFeedItems(secondFeed.id, [{ ...changedItem, title: 'Changed during relink' }])

    expect(refreshTopHashtags).toHaveBeenCalledOnce()
  })

  it('refreshes top hashtags when an eligible item publication date changes', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const feed = await insertTestRssFeedDirect({})
    const item = {
      link: `https://example.com/publication-change-${random}`,
      guid: `publication-change-${random}`,
      title: 'Publication date before correction',
      pubDate: '2025-02-02T00:00:00Z',
    }
    const [created] = await upsertRssFeedItems(feed.id, [item])
    const alias = await createUnlinkedTopicAlias(`publication-change-${random}`)
    await createTopHashtagRssSourceForTest({
      rssFeedItemId: created.id,
      topicAliasId: alias.id,
      authoredToken: `#publication-change-${random}`,
    })

    const refreshTopHashtags = vi.spyOn(psqlEnqueues, 'enqueueRefreshTopHashtags')
    await upsertRssFeedItems(feed.id, [
      {
        ...item,
        pubDate: '2025-01-01T00:00:00Z',
      },
    ])
    expect(refreshTopHashtags).toHaveBeenCalledOnce()

    refreshTopHashtags.mockClear()
    await upsertRssFeedItems(feed.id, [
      {
        ...item,
        title: 'Content changed without moving publication date',
        pubDate: '2025-01-01T00:00:00Z',
      },
    ])
    expect(refreshTopHashtags).not.toHaveBeenCalled()
  })

  it('upsertRssFeedItems does not revert an existing row when the batch has [old, new] duplicates', async () => {
    // Regression: with the existing-row filter applied before dedupe, the newer
    // duplicate would be filtered out as "unchanged" and the older duplicate
    // would survive and overwrite the DB. Dedupe must happen first.
    const feed = await insertTestRssFeedDirect({})
    const random = Math.random().toString(36).slice(2, 15)
    const guid = `revert-guard-${random}`

    // Seed the DB with the "new" version.
    const seeded = await upsertRssFeedItems(feed.id, [
      {
        link: `https://example.com/new-${random}`,
        guid,
        title: 'New version',
        pubDate: '2025-01-02T00:00:00Z',
      },
    ])
    expect(seeded.length).toBe(1)
    const seededId = seeded[0].id

    // Replay a feed that lists the old version followed by the (already-stored)
    // new version. Without the fix, the old version reverts the row.
    await upsertRssFeedItems(feed.id, [
      {
        link: `https://example.com/old-${random}`,
        guid,
        title: 'Old version',
        pubDate: '2025-01-01T00:00:00Z',
      },
      {
        link: `https://example.com/new-${random}`,
        guid,
        title: 'New version',
        pubDate: '2025-01-02T00:00:00Z',
      },
    ])

    const item = await getRssFeedItemById(seededId)
    expect(item).toBeDefined()
    expect(item!.data.title).toBe('New version')
  })

  it('upsertRssFeedItems caps direct-call categories before storing item data', async () => {
    const feed = await insertTestRssFeedDirect({})
    const random = Math.random().toString(36).slice(2, 15)

    const [itemResult] = await upsertRssFeedItems(feed.id, [
      {
        link: `https://example.com/category-cap-${random}`,
        guid: `category-cap-${random}`,
        title: 'Category cap',
        categories: [
          ' Travel ',
          'travel',
          ...Array.from({ length: RSS_FEED_ITEM_MAX_CATEGORIES + 5 }, (_, index) => `Cat ${index}`),
        ],
      },
    ])

    const item = await getRssFeedItemById(itemResult.id)
    expect(item).toBeDefined()
    expect(item!.data.categories).toHaveLength(RSS_FEED_ITEM_MAX_CATEGORIES)
    expect(item!.data.categories![0]).toBe('Travel')
    expect(item!.data.categories).not.toContain('travel')
  })

  it('upsertRssFeedItems updates chapter metadata when content is unchanged', async () => {
    const feed = await insertTestRssFeedDirect({})
    const random = Math.random().toString(36).slice(2, 15)
    const guid = `chapters-metadata-${random}`
    const baseItem = {
      link: `https://example.com/podcast-${random}`,
      guid,
      title: 'Podcast Episode',
      media_type: 'audio' as const,
      enclosure_url: `https://cdn.example.com/ep-${random}.mp3`,
      enclosure_type: 'audio/mpeg',
    }

    const [created] = await upsertRssFeedItems(feed.id, [baseItem])

    const updated = await upsertRssFeedItems(feed.id, [
      {
        ...baseItem,
        chapters_url: `https://cdn.example.com/ep-${random}.chapters.json`,
        chapters_type: 'application/json+chapters',
      },
    ])

    expect(updated).toHaveLength(1)
    expect(updated[0].id).toBe(created.id)
    const item = await getRssFeedItemById(created.id)
    expect(item!.data.chapters_url).toBe(`https://cdn.example.com/ep-${random}.chapters.json`)
    expect(item!.data.chapters_type).toBe('application/json+chapters')
  })

  it('links unchanged existing items to each feed source on the same hostname', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const hostname = `shared-source-${random}.example.com`
    const firstFeed = await insertTestRssFeedDirect({
      rssFeedUrl: `https://${hostname}/first.xml`,
      topicHostname: `first-${hostname}`,
    })
    const secondFeed = await insertTestRssFeedDirect({
      rssFeedUrl: `https://${hostname}/second.xml`,
      topicHostname: `second-${hostname}`,
    })
    const item = {
      link: `https://${hostname}/article`,
      guid: `shared-guid-${random}`,
      title: 'Shared item',
    }

    const [created] = await upsertRssFeedItems(firstFeed.id, [item])
    const unchanged = await upsertRssFeedItems(secondFeed.id, [item])

    expect(unchanged).toHaveLength(0)
    const secondSourceItem = await getRssFeedItemByCompositeKey(secondFeed.id, item.guid)
    expect(secondSourceItem?.id).toBe(created.id)
  })

  it('links concurrent inserts for same-host feed sources', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const hostname = `concurrent-source-${random}.example.com`
    const firstFeed = await insertTestRssFeedDirect({
      rssFeedUrl: `https://${hostname}/first.xml`,
      topicHostname: `first-concurrent-${hostname}`,
    })
    const secondFeed = await insertTestRssFeedDirect({
      rssFeedUrl: `https://${hostname}/second.xml`,
      topicHostname: `second-concurrent-${hostname}`,
    })
    const item = {
      link: `https://${hostname}/article`,
      guid: `concurrent-guid-${random}`,
      title: 'Concurrent shared item',
    }

    await Promise.all([
      upsertRssFeedItems(firstFeed.id, [item]),
      upsertRssFeedItems(secondFeed.id, [item]),
    ])

    const firstSourceItem = await getRssFeedItemByCompositeKey(firstFeed.id, item.guid)
    const secondSourceItem = await getRssFeedItemByCompositeKey(secondFeed.id, item.guid)
    expect(firstSourceItem?.id).toBeDefined()
    expect(secondSourceItem?.id).toBe(firstSourceItem?.id)
  })

  it('upsertRssFeedItems dedupes duplicate guids across SQL chunk boundaries', async () => {
    const feed = await insertTestRssFeedDirect({})
    const random = Math.random().toString(36).slice(2, 15)
    const guid = `chunk-dup-${random}`
    const middleItems = Array.from({ length: RSS_FEED_ITEM_SQL_BATCH_SIZE - 1 }, (_, index) => ({
      link: `https://example.com/chunk-${random}-${index}`,
      guid: `chunk-${random}-${index}`,
      title: `Chunk item ${index}`,
    }))

    const items = await upsertRssFeedItems(feed.id, [
      {
        link: `https://example.com/chunk-old-${random}`,
        guid,
        title: 'Old chunk version',
      },
      ...middleItems,
      {
        link: `https://example.com/chunk-new-${random}`,
        guid,
        title: 'New chunk version',
      },
    ])

    expect(items).toHaveLength(RSS_FEED_ITEM_SQL_BATCH_SIZE)
    expect(await getRssFeedItemTitleByGuidForTest(guid)).toBe('New chunk version')
    const duplicate = await upsertRssFeedItems(feed.id, [
      {
        link: `https://example.com/chunk-new-${random}`,
        guid,
        title: 'New chunk version',
      },
    ])
    expect(duplicate).toHaveLength(0)
  })
})

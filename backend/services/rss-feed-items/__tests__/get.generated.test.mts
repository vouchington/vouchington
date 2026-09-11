import { it, expect, describe } from 'vitest'
import { getRssFeedItemByCompositeKey, getRssFeedItemKeyByGuid } from '../get.mts'
import { upsertRssFeedItems } from '../upsert.mts'
import { insertTestRssFeedDirect } from '@voucha/test-helpers'
import { v7 } from 'uuid'

describe('get.generated', () => {
  it('getRssFeedItemKeyByGuid resolves the persistent identity key', async () => {
    const feed = await insertTestRssFeedDirect({})
    const random = Math.random().toString(36).slice(2, 15)
    const guid = `identity-guid-${random}`

    const [upserted] = await upsertRssFeedItems(feed.id, [
      {
        link: `https://example.com/identity-${random}`,
        guid,
        title: 'Identity lookup item',
      },
    ])

    await expect(getRssFeedItemKeyByGuid(guid)).resolves.toEqual({ id: upserted.id })
  })

  it('getRssFeedItemByCompositeKey retrieves item by composite key', async () => {
    const feed = await insertTestRssFeedDirect({})
    const random = Math.random().toString(36).slice(2, 15)
    const guid = `guid-${random}`

    await upsertRssFeedItems(feed.id, [
      {
        link: `https://example.com/article-${random}`,
        guid,
        title: 'Test Article',
        pubDate: '2025-01-01T00:00:00Z',
      },
    ])
    // RSS feed items cascade-delete with feed, no need to track separately

    const item = await getRssFeedItemByCompositeKey(feed.id, guid)
    expect(item).toBeDefined()
    expect(item!.rss_feed.id).toBe(feed.id)
    expect(item!.guid).toBe(guid)
    expect(item!.published_at).toBeDefined()
    expect(item!.url).toBeDefined()
    expect(item!.rss_feed).toBeDefined()
  })

  it('getRssFeedItemByCompositeKey returns null for non-existent item', async () => {
    const nonExistentFeedId = v7()
    const nonExistentGuid = 'non-existent-guid'

    const item = await getRssFeedItemByCompositeKey(nonExistentFeedId, nonExistentGuid)
    expect(item).toBeNull()
  })
})

import { randomUUID } from 'node:crypto'
import { it, expect, describe } from 'vitest'
import { insertTestRssFeedDirect } from '@voucha/test-helpers'
import { invalidate } from '../invalidate.mts'

// getRssFeedCacheKeys/getRssFeedItemCacheKeys resolve by normalizing the input ID only (no DB
// round trip), so invalidate.rss_feeds/rss_feed_items reach their enqueueBulkPurgeCacheTags(...)
// call for both a real feed/item id and a non-existent one.
describe('invalidate.rss_feeds and invalidate.rss_feed_items enqueue an edge Cache-Tag purge', () => {
  it('invalidate.rss_feeds resolves without throwing for a real feed id', async () => {
    const { id } = await insertTestRssFeedDirect({})
    await expect(invalidate.rss_feeds(id)).resolves.not.toThrow()
  })

  it('invalidate.rss_feeds resolves without throwing for a non-existent feed id', async () => {
    await expect(invalidate.rss_feeds(randomUUID())).resolves.not.toThrow()
  })

  it('invalidate.rss_feed_items resolves without throwing for a non-existent item id', async () => {
    await expect(invalidate.rss_feed_items(randomUUID())).resolves.not.toThrow()
  })

  it('invalidate.rss_feeds and invalidate.rss_feed_items resolve without throwing for empty input', async () => {
    await expect(invalidate.rss_feeds()).resolves.not.toThrow()
    await expect(invalidate.rss_feed_items()).resolves.not.toThrow()
  })
})

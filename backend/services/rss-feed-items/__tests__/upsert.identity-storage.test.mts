import { describe, expect, it } from 'vitest'

import {
  deleteRssFeedUrlHostnameForTest,
  getRssFeedItemPartitionNamesForTest,
  getRssFeedItemStorageStateForTest,
  getTestRssFeedItemIdentityTransactionId,
  insertTestRssFeedDirect,
  softDeleteRssFeedItemsForTest,
} from '@voucha/test-helpers'
import { upsertRssFeedItems } from '../upsert.mts'

describe('RSS feed item identity storage', () => {
  it('does not rewrite an unchanged identity', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const feed = await insertTestRssFeedDirect({})
    const input = {
      link: `https://identity-unchanged-${random}.example.com/article`,
      guid: `identity-unchanged-${random}`,
      title: 'Unchanged identity item',
    }
    const [created] = await upsertRssFeedItems(feed.id, [input])
    const before = await getTestRssFeedItemIdentityTransactionId(created.id)

    await expect(upsertRssFeedItems(feed.id, [input])).resolves.toEqual([])

    await expect(getTestRssFeedItemIdentityTransactionId(created.id)).resolves.toBe(before)
  })

  it('resurrects soft-deleted content with its permanent identity and default partition', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const feed = await insertTestRssFeedDirect({
      rssFeedUrl: `https://identity-${random}.example.com/feed.xml`,
    })
    const item = {
      link: `https://identity-${random}.example.com/article`,
      guid: `identity-${random}`,
      title: 'Permanent identity item',
    }
    const [created] = await upsertRssFeedItems(feed.id, [item])

    await softDeleteRssFeedItemsForTest([created.id])
    expect(await getRssFeedItemStorageStateForTest(created.id)).toMatchObject({
      identity_exists: true,
      content_exists: true,
      storage_table: 'rss_feed_items_default',
      deleted_at: expect.any(Date),
    })

    const [resurrected] = await upsertRssFeedItems(feed.id, [item])
    expect(resurrected.id).toBe(created.id)
    expect(await getRssFeedItemStorageStateForTest(created.id)).toMatchObject({
      identity_exists: true,
      content_exists: true,
      storage_table: 'rss_feed_items_default',
      view_guid: item.guid,
      view_url_hostname_id: expect.any(String),
      deleted_at: null,
    })
    expect(await getRssFeedItemPartitionNamesForTest()).toEqual(['rss_feed_items_default'])
  })

  it('cascades hostname deletion through identity and content rows', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const feed = await insertTestRssFeedDirect({
      rssFeedUrl: `https://cascade-${random}.example.com/feed.xml`,
    })
    const [created] = await upsertRssFeedItems(feed.id, [
      {
        link: `https://content-${random}.example.net/article`,
        guid: `cascade-${random}`,
        title: 'Cascade item',
      },
    ])

    await deleteRssFeedUrlHostnameForTest(feed.id)

    expect(await getRssFeedItemStorageStateForTest(created.id)).toMatchObject({
      identity_exists: false,
      content_exists: false,
      storage_table: null,
      view_guid: null,
      view_url_hostname_id: null,
      deleted_at: null,
    })
  })
})

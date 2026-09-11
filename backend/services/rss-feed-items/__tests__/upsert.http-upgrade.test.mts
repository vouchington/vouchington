import { it, expect, describe } from 'vitest'
import { upsertRssFeedItems } from '../upsert.mts'
import { getRssFeedItemById } from '../get.mts'
import { insertTestRssFeedDirect } from '@voucha/test-helpers'

describe('upsert.http-upgrade', () => {
  it('upsertRssFeedItems upgrades http item links to https', async () => {
    const feed = await insertTestRssFeedDirect({})
    const random = Math.random().toString(36).slice(2, 15)

    // Feeds in the wild commonly publish http:// links — these should be stored as https://
    const items = await upsertRssFeedItems(feed.id, [
      {
        link: `http://example-${random}.com/article-1`,
        guid: `http-guid-1-${random}`,
        title: 'HTTP Article 1',
      },
      {
        link: `http://example-${random}.com/article-2`,
        guid: `http-guid-2-${random}`,
        title: 'HTTP Article 2',
      },
    ])

    expect(items).toHaveLength(2)

    const item1 = await getRssFeedItemById(items.find(i => i.id)!.id)
    expect(item1).toBeDefined()
    expect(item1!.url.url).toMatch(/^https:\/\//)
    expect(item1!.url.url).toContain(`example-${random}.com`)
  })

  it('upsertRssFeedItems deduplicates http and https variants of the same URL', async () => {
    const feed = await insertTestRssFeedDirect({})
    const random = Math.random().toString(36).slice(2, 15)
    const hostname = `dedup-${random}.example.com`

    // Insert via http:// — stored as https://
    const httpItems = await upsertRssFeedItems(feed.id, [
      {
        link: `http://${hostname}/article`,
        guid: `dedup-http-${random}`,
        title: 'Via HTTP',
      },
    ])
    expect(httpItems).toHaveLength(1)
    const httpItem = await getRssFeedItemById(httpItems[0].id)

    // Insert via https:// — normalises to the same https:// URL row
    const httpsItems = await upsertRssFeedItems(feed.id, [
      {
        link: `https://${hostname}/article`,
        guid: `dedup-https-${random}`,
        title: 'Via HTTPS',
      },
    ])
    expect(httpsItems).toHaveLength(1)
    const httpsItem = await getRssFeedItemById(httpsItems[0].id)

    // Both items must point to the same canonical https:// URL row
    expect(httpItem!.url.url).toBe(`https://${hostname}/article`)
    expect(httpsItem!.url.url).toBe(`https://${hostname}/article`)
    expect(httpItem!.url.id).toBe(httpsItem!.url.id)
  })

  it('upsertRssFeedItems handles a mix of http and https links without throwing', async () => {
    const feed = await insertTestRssFeedDirect({})
    const random = Math.random().toString(36).slice(2, 15)

    // The original bug: any single http:// link in the batch caused the entire upsert to fail.
    // After the fix, all items should be stored successfully and http:// links upgraded.
    const items = await upsertRssFeedItems(feed.id, [
      {
        link: `https://secure-${random}.example.com/item-1`,
        guid: `mix-1-${random}`,
        title: 'HTTPS item',
      },
      {
        link: `http://insecure-${random}.example.com/item-2`,
        guid: `mix-2-${random}`,
        title: 'HTTP item (should be upgraded)',
      },
      {
        link: `https://secure-${random}.example.com/item-3`,
        guid: `mix-3-${random}`,
        title: 'Another HTTPS item',
      },
    ])

    expect(items).toHaveLength(3)

    // Fetch all items and verify every stored URL is https://
    const fullItems = await Promise.all(items.map(i => getRssFeedItemById(i.id)))
    for (const item of fullItems) {
      expect(item!.url.url).toMatch(/^https:\/\//)
    }
    // The insecure-${random} host (originally http://) must have been upgraded
    const insecureItem = fullItems.find(i => i!.url.url.includes(`insecure-${random}`))
    expect(insecureItem!.url.url).toBe(`https://insecure-${random}.example.com/item-2`)
  })
})

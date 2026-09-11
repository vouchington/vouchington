import { it, expect, describe } from 'vitest'
import { upsertRssFeedItems } from '../upsert.mts'
import { getRssFeedItemById } from '../get.mts'
import { insertTestRssFeedDirect } from '@voucha/test-helpers'

describe('upsert.url-id', () => {
  it('upsertRssFeedItems inserts items with bare-host links (url_id NOT NULL)', async () => {
    // Regression: "https://twill.ai" normalizes to "https://twill.ai/" — the trailing
    // slash was previously causing a Map.get() miss that let url_id = undefined hit the INSERT.
    const feed = await insertTestRssFeedDirect({})
    const random = Math.random().toString(36).slice(2, 15)

    // Use a link that is exactly a bare host (no path) — normalizeUrlForUrlTable adds trailing slash
    const items = await upsertRssFeedItems(feed.id, [
      {
        link: 'https://twill-test.example.com',
        guid: `twill-bare-host-${random}`,
        title: 'Bare host link item',
      },
    ])

    expect(items).toHaveLength(1)
    const item = await getRssFeedItemById(items[0].id)
    expect(item).toBeDefined()
    // url_id must be set — if it were NULL, the DB would have thrown a NOT NULL violation
    expect(item!.url).toBeDefined()
    expect(item!.url.url).toBe('https://twill-test.example.com/')
  })

  it('upsertRssFeedItems inserts items with trailing-slash links without duplication', async () => {
    const feed = await insertTestRssFeedDirect({})
    const random = Math.random().toString(36).slice(2, 15)

    const link = `https://example-${random}.com/post/`
    const items = await upsertRssFeedItems(feed.id, [
      { link, guid: `trailing-slash-${random}`, title: 'Trailing slash item' },
    ])

    expect(items).toHaveLength(1)
    // Inserting the same guid again should be a no-op (unchanged content)
    const items2 = await upsertRssFeedItems(feed.id, [
      { link, guid: `trailing-slash-${random}`, title: 'Trailing slash item' },
    ])
    expect(items2).toHaveLength(0)
  })

  it('upsertRssFeedItems skips items with invalid links and processes the rest', async () => {
    const feed = await insertTestRssFeedDirect({})
    const random = Math.random().toString(36).slice(2, 15)

    // One valid item and one invalid link (non-https scheme is rejected by normalizeUrlForUrlTable)
    const items = await upsertRssFeedItems(feed.id, [
      {
        link: `https://example-${random}.com/good-article`,
        guid: `good-item-${random}`,
        title: 'Good item',
      },
      {
        link: 'ftp://bad-scheme.example.com/file',
        guid: `bad-link-${random}`,
        title: 'Bad link item',
      },
    ])

    // Only the valid item should be inserted
    expect(items).toHaveLength(1)
    const item = await getRssFeedItemById(items[0].id)
    expect(item).toBeDefined()
  })

  it('upsertRssFeedItems stores URL-table links without fragments and keeps raw item data', async () => {
    const feed = await insertTestRssFeedDirect({})
    const random = Math.random().toString(36).slice(2, 15)
    const link = `https://example-${random}.com/good-article#comments`

    const items = await upsertRssFeedItems(feed.id, [
      {
        link,
        guid: `fragment-item-${random}`,
        title: 'Fragment item',
      },
    ])

    expect(items).toHaveLength(1)
    const item = await getRssFeedItemById(items[0].id)
    expect(item).toBeDefined()
    expect(item!.url.url).toBe(`https://example-${random}.com/good-article`)
    expect(item!.data.link).toBe(link)
  })

  it('upsertRssFeedItems skips localhost links and processes the rest', async () => {
    const feed = await insertTestRssFeedDirect({})
    const random = Math.random().toString(36).slice(2, 15)

    const items = await upsertRssFeedItems(feed.id, [
      {
        link: `https://example-${random}.com/good-article`,
        guid: `good-localhost-mix-${random}`,
        title: 'Good item',
      },
      {
        link: 'https://localhost:3000/open-source/the-lingua-franca-of-latex/',
        guid: `localhost-link-${random}`,
        title: 'Localhost link item',
      },
    ])

    expect(items).toHaveLength(1)
    const item = await getRssFeedItemById(items[0].id)
    expect(item).toBeDefined()
    expect(item!.url.url).toBe(`https://example-${random}.com/good-article`)
  })

  it('upsertRssFeedItems skips private-IP links and processes the rest', async () => {
    const feed = await insertTestRssFeedDirect({})
    const random = Math.random().toString(36).slice(2, 15)

    const items = await upsertRssFeedItems(feed.id, [
      {
        link: `https://example-${random}.com/public-article`,
        guid: `good-private-ip-mix-${random}`,
        title: 'Good item',
      },
      {
        link: 'https://192.168.1.1/item',
        guid: `private-ip-link-${random}`,
        title: 'Private IP link item',
      },
    ])

    expect(items).toHaveLength(1)
    const item = await getRssFeedItemById(items[0].id)
    expect(item).toBeDefined()
    expect(item!.url.url).toBe(`https://example-${random}.com/public-article`)
  })
})

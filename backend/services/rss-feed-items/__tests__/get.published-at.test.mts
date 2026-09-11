import { it, expect, describe } from 'vitest'
import { createHash } from 'node:crypto'
import { getRssFeedItemByCompositeKey } from '../get.mts'
import { insertTestRssFeedDirect, insertTestRssFeedItem } from '@voucha/test-helpers'
import { addUrl } from '@services/urls'

describe('get.published-at', () => {
  function contentSha256(itemData: unknown): Buffer {
    return createHash('sha256').update(JSON.stringify(itemData)).digest()
  }

  it('published_at is earliest of isoDate only when earlier than created_at', async () => {
    const feed = await insertTestRssFeedDirect({})
    const random = Math.random().toString(36).slice(2, 15)
    const urlObj = await addUrl(null, `https://example.com/pub-${random}`, {
      content_type: 'text/html',
    })
    const isoDate = '2020-06-15T12:00:00Z'
    const itemData = { title: 'Item', isoDate, link: urlObj!.url }
    await insertTestRssFeedItem({
      rssFeedId: feed.id,
      urlId: urlObj!.id,
      guid: `guid-${random}`,
      itemData,
      contentSha256: contentSha256(itemData),
    })
    const item = await getRssFeedItemByCompositeKey(feed.id, `guid-${random}`)
    expect(item).toBeDefined()
    expect(item!.published_at).toEqual(new Date(isoDate))
  })

  it('published_at is earliest of pubDate only when earlier than created_at', async () => {
    const feed = await insertTestRssFeedDirect({})
    const random = Math.random().toString(36).slice(2, 15)
    const urlObj = await addUrl(null, `https://example.com/pub2-${random}`, {
      content_type: 'text/html',
    })
    const pubDate = '2021-03-01T08:00:00Z'
    const itemData = { title: 'Item', pubDate, link: urlObj!.url }
    await insertTestRssFeedItem({
      rssFeedId: feed.id,
      urlId: urlObj!.id,
      guid: `guid-${random}`,
      itemData,
      contentSha256: contentSha256(itemData),
    })
    const item = await getRssFeedItemByCompositeKey(feed.id, `guid-${random}`)
    expect(item).toBeDefined()
    expect(item!.published_at).toEqual(new Date(pubDate))
  })

  it('published_at is earliest when both isoDate and pubDate present (isoDate earlier)', async () => {
    const feed = await insertTestRssFeedDirect({})
    const random = Math.random().toString(36).slice(2, 15)
    const urlObj = await addUrl(null, `https://example.com/both-${random}`, {
      content_type: 'text/html',
    })
    const isoDate = '2019-01-01T00:00:00Z'
    const pubDate = '2022-06-01T00:00:00Z'
    const itemData = { title: 'Item', isoDate, pubDate, link: urlObj!.url }
    await insertTestRssFeedItem({
      rssFeedId: feed.id,
      urlId: urlObj!.id,
      guid: `guid-${random}`,
      itemData,
      contentSha256: contentSha256(itemData),
    })
    const item = await getRssFeedItemByCompositeKey(feed.id, `guid-${random}`)
    expect(item).toBeDefined()
    expect(item!.published_at).toEqual(new Date(isoDate))
  })

  it('published_at is earliest when both isoDate and pubDate present (pubDate earlier)', async () => {
    const feed = await insertTestRssFeedDirect({})
    const random = Math.random().toString(36).slice(2, 15)
    const urlObj = await addUrl(null, `https://example.com/both2-${random}`, {
      content_type: 'text/html',
    })
    const isoDate = '2023-01-01T00:00:00Z'
    const pubDate = '2020-06-15T00:00:00Z'
    const itemData = { title: 'Item', isoDate, pubDate, link: urlObj!.url }
    await insertTestRssFeedItem({
      rssFeedId: feed.id,
      urlId: urlObj!.id,
      guid: `guid-${random}`,
      itemData,
      contentSha256: contentSha256(itemData),
    })
    const item = await getRssFeedItemByCompositeKey(feed.id, `guid-${random}`)
    expect(item).toBeDefined()
    expect(item!.published_at).toEqual(new Date(pubDate))
  })

  it('published_at equals created_at when no isoDate or pubDate', async () => {
    const feed = await insertTestRssFeedDirect({})
    const random = Math.random().toString(36).slice(2, 15)
    const urlObj = await addUrl(null, `https://example.com/nodate-${random}`, {
      content_type: 'text/html',
    })
    const itemData = { title: 'Item', link: urlObj!.url }
    await insertTestRssFeedItem({
      rssFeedId: feed.id,
      urlId: urlObj!.id,
      guid: `guid-${random}`,
      itemData,
      contentSha256: contentSha256(itemData),
    })
    const insertedAt = Date.now()
    const item = await getRssFeedItemByCompositeKey(feed.id, `guid-${random}`)
    const fetchedAt = Date.now()
    expect(item).toBeDefined()
    // created_at defaults to CURRENT_TIMESTAMP (≈ insertion time), so published_at ≈ now
    expect(item!.published_at.getTime()).toBeGreaterThan(insertedAt - 60_000)
    expect(item!.published_at.getTime()).toBeLessThanOrEqual(fetchedAt + 5_000)
  })

  it('published_at falls back to created_at when isoDate and pubDate are literal "null"', async () => {
    const feed = await insertTestRssFeedDirect({})
    const random = Math.random().toString(36).slice(2, 15)
    const urlObj = await addUrl(null, `https://example.com/null-date-${random}`, {
      content_type: 'text/html',
    })
    const itemData = { title: 'Item', isoDate: 'null', pubDate: 'null', link: urlObj!.url }
    await insertTestRssFeedItem({
      rssFeedId: feed.id,
      urlId: urlObj!.id,
      guid: `guid-${random}`,
      itemData,
      contentSha256: contentSha256(itemData),
    })
    const insertedAt = Date.now()
    const item = await getRssFeedItemByCompositeKey(feed.id, `guid-${random}`)
    const fetchedAt = Date.now()
    expect(item).toBeDefined()
    // "null" dates are ignored, so published_at falls back to uuid_extract_timestamp(id) ≈ now
    expect(item!.published_at.getTime()).toBeGreaterThan(insertedAt - 60_000)
    expect(item!.published_at.getTime()).toBeLessThanOrEqual(fetchedAt + 5_000)
  })

  it('published_at equals created_at when both feed dates are after created_at', async () => {
    const feed = await insertTestRssFeedDirect({})
    const random = Math.random().toString(36).slice(2, 15)
    const urlObj = await addUrl(null, `https://example.com/future-${random}`, {
      content_type: 'text/html',
    })
    const itemData = {
      title: 'Item',
      isoDate: '2030-01-01T00:00:00Z',
      pubDate: '2029-06-01T00:00:00Z',
      link: urlObj!.url,
    }
    await insertTestRssFeedItem({
      rssFeedId: feed.id,
      urlId: urlObj!.id,
      guid: `guid-${random}`,
      itemData,
      contentSha256: contentSha256(itemData),
    })
    const insertedAt = Date.now()
    const item = await getRssFeedItemByCompositeKey(feed.id, `guid-${random}`)
    const fetchedAt = Date.now()
    expect(item).toBeDefined()
    // created_at (≈ now, 2026) is earlier than both future feed dates, so published_at ≈ now
    expect(item!.published_at.getTime()).toBeGreaterThan(insertedAt - 60_000)
    expect(item!.published_at.getTime()).toBeLessThanOrEqual(fetchedAt + 5_000)
  })

  it('published_at preserves real date from Hugo/Go feed with GMT-0700 offset', async () => {
    const feed = await insertTestRssFeedDirect({})
    const random = Math.random().toString(36).slice(2, 15)
    const urlObj = await addUrl(null, `https://example.com/hugo-${random}`, {
      content_type: 'text/html',
    })
    // Hugo/Go feeds emit "Mon, 02 Jan 2006 15:04:05 GMT-0700"
    // With offset -0700, UTC equivalent is 2006-01-02T22:04:05Z
    const itemData = {
      title: 'Item',
      isoDate: 'Mon, 02 Jan 2006 15:04:05 GMT-0700',
      link: urlObj!.url,
    }
    await insertTestRssFeedItem({
      rssFeedId: feed.id,
      urlId: urlObj!.id,
      guid: `guid-${random}`,
      itemData,
      contentSha256: contentSha256(itemData),
    })
    const item = await getRssFeedItemByCompositeKey(feed.id, `guid-${random}`)
    expect(item).toBeDefined()
    expect(item!.published_at).toEqual(new Date('2006-01-02T22:04:05Z'))
  })

  it('published_at falls back to ingest time when weekday prefix is a typo', async () => {
    const feed = await insertTestRssFeedDirect({})
    const random = Math.random().toString(36).slice(2, 15)
    const urlObj = await addUrl(null, `https://example.com/typo-${random}`, {
      content_type: 'text/html',
    })
    // "Tus," is not a known RFC 822 weekday abbreviation — it is not stripped, so
    // PostgreSQL cannot parse the date and fn_text_to_timestamptz returns NULL,
    // causing the generated column to fall back to uuid_extract_timestamp(id) ≈ now.
    const itemData = {
      title: 'Item',
      pubDate: 'Tus, 14 Jan 2025 16:15:00 GMT',
      link: urlObj!.url,
    }
    const insertedAt = Date.now()
    await insertTestRssFeedItem({
      rssFeedId: feed.id,
      urlId: urlObj!.id,
      guid: `guid-${random}`,
      itemData,
      contentSha256: contentSha256(itemData),
    })
    const item = await getRssFeedItemByCompositeKey(feed.id, `guid-${random}`)
    const fetchedAt = Date.now()
    expect(item).toBeDefined()
    expect(item!.published_at.getTime()).toBeGreaterThanOrEqual(insertedAt - 60_000)
    expect(item!.published_at.getTime()).toBeLessThanOrEqual(fetchedAt + 5_000)
  })

  it('published_at falls back to ingest time when offset is out of range', async () => {
    const feed = await insertTestRssFeedDirect({})
    const random = Math.random().toString(36).slice(2, 15)
    const urlObj = await addUrl(null, `https://example.com/badoffset-${random}`, {
      content_type: 'text/html',
    })
    // +20:00 is an invalid timezone offset; fn_text_to_timestamptz returns NULL,
    // so the generated column falls back to uuid_extract_timestamp(id) ≈ now
    const itemData = {
      title: 'Item',
      isoDate: '2026-02-18T22:02:31+20:00',
      link: urlObj!.url,
    }
    const insertedAt = Date.now()
    await insertTestRssFeedItem({
      rssFeedId: feed.id,
      urlId: urlObj!.id,
      guid: `guid-${random}`,
      itemData,
      contentSha256: contentSha256(itemData),
    })
    const item = await getRssFeedItemByCompositeKey(feed.id, `guid-${random}`)
    const fetchedAt = Date.now()
    expect(item).toBeDefined()
    expect(item!.published_at.getTime()).toBeGreaterThanOrEqual(insertedAt - 60_000)
    expect(item!.published_at.getTime()).toBeLessThanOrEqual(fetchedAt + 5_000)
  })
})

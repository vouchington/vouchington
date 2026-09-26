import { it, expect, vi, beforeEach, describe } from 'vitest'
import { createHash } from 'node:crypto'
import { parseFeedDocument } from '@vouchington/rss-parser'
import type CrawlerRss from '@services/crawler-rss'
import { addUrl } from '@services/urls'
import { getRssFeedItemById } from '@services/rss-feed-items/get'
import type { checkRssFeedCrawlable } from '../fetch-robots-check.mts'
import { fetchRssFeed } from '../fetch.mts'
import { createTestRssFeed } from '../test-fixtures.mts'
import { updateRssFeedById } from '../update.mts'
import { getRssFeedById } from '../get.mts'
import {
  getLatestRssFeedCrawlForFeed,
  insertRssFeedCrawl,
  parseRssLastModifiedHeader,
} from '../crawls.mts'
import { searchRssFeedItems } from '@services/rss-feed-items/search'
import { createRssFeedItemEmbeddingContent } from '../../rss-feed-items/content.mts'
import { createTestTopic, insertTestRssFeedItem } from '@voucha/test-helpers'

const mockCrawlerRss = vi.fn<typeof CrawlerRss>()

const mockCheckRssFeedCrawlable = vi.fn<typeof checkRssFeedCrawlable>()

function createMockFeedFixture(label = Math.random().toString(36).slice(2, 15)) {
  const xml = `<rss version="2.0"><channel><title>Mock ${label}</title><item><link>https://example.com/item-${label}</link><guid>guid-${label}</guid><title>Item ${label}</title></item></channel></rss>`
  return [
    parseFeedDocument(Buffer.from(xml)).feed,
    createHash('sha256').update(xml).digest(),
  ] as const
}

function fetchRssFeedForTest(...args: Parameters<typeof fetchRssFeed>) {
  const [rssFeedId, ttl, overrideUrl, hopCount, dependencies] = args
  return fetchRssFeed(rssFeedId, ttl, overrideUrl, hopCount, {
    crawlerRss: mockCrawlerRss,
    checkRssFeedCrawlable: mockCheckRssFeedCrawlable,
    ...dependencies,
  })
}

describe('fetch.feed-data', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCheckRssFeedCrawlable.mockResolvedValue(true)
    const [defaultFeed, defaultContentSha256] = createMockFeedFixture()
    mockCrawlerRss.mockResolvedValue({
      responseCode: 200,
      feed: defaultFeed,
      contentSha256: defaultContentSha256,
      headers: { etag: null, lastModified: null },
    })
  })

  it('parseRssLastModifiedHeader preserves dates with two-digit years and numeric timezones', () => {
    const parsed = parseRssLastModifiedHeader('Sun, 06 Nov 94 08:49:37 +0000')
    expect(parsed?.toISOString()).toBe('1994-11-06T08:49:37.000Z')
  })

  it('fetchRssFeed skips item upsert when feed_data_sha256 unchanged (read before write)', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topic = await createTestTopic({
      name: `Test Topic ${random}`,
      slug: `test-topic-${random}`,
      hostname: `fetch-mock-${random}.example.com`,
    })
    const feed = await createTestRssFeed({
      rssFeedUrl: `https://example.com/feed-${random}.xml`,
      topicId: topic.id,
      title: `Test Feed ${random}`,
    })
    await updateRssFeedById(feed.id, {
      enabled: true,
      discoverable: true,
    })

    const firstResult = await fetchRssFeedForTest(feed.id, 0)
    const firstCount = firstResult!.length
    const secondResult = await fetchRssFeedForTest(feed.id, 0)
    expect(secondResult).toEqual([])
    const itemsAfter = await searchRssFeedItems({ rss_feed_ids: [feed.id], limit: 10 })
    expect(itemsAfter.results.length).toBe(firstCount)
  }, 30_000)

  it('fetchRssFeed backfills chapter metadata when a conditional fetch returns 304', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topic = await createTestTopic({
      name: `Topic chapters ${random}`,
      slug: `topic-chapters-${random}`,
      hostname: `fetch-chapters-${random}.example.com`,
    })
    const feed = await createTestRssFeed({
      rssFeedUrl: `https://example.com/chapters-${random}.xml`,
      topicId: topic.id,
      title: `Feed chapters ${random}`,
    })
    await updateRssFeedById(feed.id, { enabled: true, etag: '"chapter-etag"' })
    const itemLink = `https://example.com/episode-${random}`
    const chaptersUrl = `https://cdn.example.com/episode-${random}.chapters.json`
    const chaptersXml = Buffer.from(
      `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:podcast="https://podcastindex.org/namespace/1.0">
  <channel>
    <title>Mock</title>
    <item>
      <link>${itemLink}</link>
      <guid>guid-${random}</guid>
      <title>Episode ${random}</title>
      <podcast:chapters url="${chaptersUrl}" type="application/json+chapters" />
    </item>
  </channel>
</rss>`,
      'utf-8',
    )
    const parsedFeed = parseFeedDocument(chaptersXml).feed
    const [parsedItem] = (parsedFeed.items as Record<string, unknown>[] | undefined) ?? []
    const seedItemData = { ...(parsedItem as Record<string, unknown>) }
    delete seedItemData.chapters_url
    delete seedItemData.chapters_type
    const { content_sha256: seedItemContentSha256 } = createRssFeedItemEmbeddingContent({
      link: itemLink,
      guid: `guid-${random}`,
      title: `Episode ${random}`,
    })
    const itemUrl = await addUrl(null, itemLink, { content_type: 'text/html' })
    const seededItemId = await insertTestRssFeedItem({
      rssFeedId: feed.id,
      urlId: itemUrl!.id,
      guid: `guid-${random}`,
      itemData: seedItemData,
      contentSha256: seedItemContentSha256,
    })
    const fetchContentSha256 = createHash('sha256').update(chaptersXml).digest()
    await insertRssFeedCrawl({
      rss_feed_id: feed.id,
      response_code: 200,
      feed_data: parsedFeed,
      feed_data_sha256: fetchContentSha256,
    })

    mockCrawlerRss.mockResolvedValueOnce({
      responseCode: 304,
      feed: null,
      contentSha256: null,
      headers: { etag: null, lastModified: null },
    })

    const result = await fetchRssFeedForTest(feed.id)
    expect(result).toEqual([])

    const updatedItem = await getRssFeedItemById(seededItemId)
    expect(updatedItem).not.toBeNull()
    expect(updatedItem!.data.chapters_url).toBe(chaptersUrl)
    expect(updatedItem!.data.chapters_type).toBe('application/json+chapters')
  }, 30_000)

  it('getLatestRssFeedCrawlForFeed returns feed_data_sha256 after fetch', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topic = await createTestTopic({
      name: `Topic ${random}`,
      slug: `topic-${random}`,
      hostname: `fetch-latest-${random}.example.com`,
    })
    const feed = await createTestRssFeed({
      rssFeedUrl: `https://example.com/f-${random}.xml`,
      topicId: topic.id,
      title: `Feed ${random}`,
    })
    await updateRssFeedById(feed.id, { enabled: true })

    const before = await getLatestRssFeedCrawlForFeed(feed.id)
    expect(before).toBeNull()

    await fetchRssFeedForTest(feed.id, 0)
    const after = await getLatestRssFeedCrawlForFeed(feed.id)
    expect(after).not.toBeNull()
    expect(Buffer.isBuffer(after!.feed_data_sha256)).toBe(true)
  }, 30_000)

  it('fetchRssFeed dedupe still skips upsert after a 304 crawl', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topic = await createTestTopic({
      name: `Topic 304 ${random}`,
      slug: `topic-304-${random}`,
      hostname: `fetch-304-${random}.example.com`,
    })
    const feed = await createTestRssFeed({
      rssFeedUrl: `https://example.com/304-${random}.xml`,
      topicId: topic.id,
      title: `Feed 304 ${random}`,
    })
    await updateRssFeedById(feed.id, { enabled: true })
    const [fixtureFeed, fixtureContentSha256] = createMockFeedFixture(`304-${random}`)

    mockCrawlerRss
      .mockResolvedValueOnce({
        responseCode: 200,
        feed: fixtureFeed,
        contentSha256: fixtureContentSha256,
        headers: { etag: '"etag-1"', lastModified: 'Wed, 21 Oct 2015 07:28:00 GMT' },
      })
      .mockResolvedValueOnce({
        responseCode: 304,
        feed: null,
        contentSha256: null,
        headers: { etag: null, lastModified: null },
      })
      .mockResolvedValueOnce({
        responseCode: 200,
        feed: fixtureFeed,
        contentSha256: fixtureContentSha256,
        headers: { etag: null, lastModified: null },
      })

    const firstResult = await fetchRssFeedForTest(feed.id, 0)
    const firstCount = firstResult!.length
    const secondResult = await fetchRssFeedForTest(feed.id, 0)
    expect(secondResult).toEqual([])

    const thirdResult = await fetchRssFeedForTest(feed.id, 0)
    expect(thirdResult).toEqual([])

    const itemsAfter = await searchRssFeedItems({ rss_feed_ids: [feed.id], limit: 10 })
    expect(itemsAfter.results.length).toBe(firstCount)
  }, 30_000)

  it('fetchRssFeed does not clear etag and last_modified_at when response headers are missing', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topic = await createTestTopic({
      name: `Topic headers ${random}`,
      slug: `topic-headers-${random}`,
      hostname: `fetch-headers-${random}.example.com`,
    })
    const feed = await createTestRssFeed({
      rssFeedUrl: `https://example.com/headers-${random}.xml`,
      topicId: topic.id,
      title: `Feed headers ${random}`,
    })
    await updateRssFeedById(feed.id, {
      enabled: true,
      etag: '"seed-etag"',
      last_modified_at: new Date('2024-01-01T00:00:00.000Z'),
    })

    mockCrawlerRss.mockResolvedValueOnce({
      responseCode: 304,
      feed: null,
      contentSha256: null,
      headers: { etag: null, lastModified: null },
    })

    const result = await fetchRssFeedForTest(feed.id, 0)
    expect(result).toEqual([])

    const updatedFeed = await getRssFeedById(feed.id)
    expect(updatedFeed!.etag).toBe('"seed-etag"')
    expect(updatedFeed!.last_modified_at).toEqual(new Date('2024-01-01T00:00:00.000Z'))
  }, 30_000)

  it('fetchRssFeed ignores invalid and pre-1970 Last-Modified headers', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topic = await createTestTopic({
      name: `Topic bad last modified ${random}`,
      slug: `topic-bad-last-modified-${random}`,
      hostname: `fetch-bad-last-modified-${random}.example.com`,
    })
    const feed = await createTestRssFeed({
      rssFeedUrl: `https://example.com/bad-last-modified-${random}.xml`,
      topicId: topic.id,
      title: `Feed bad last modified ${random}`,
    })
    const seedLastModifiedAt = new Date('2024-01-01T00:00:00.000Z')
    await updateRssFeedById(feed.id, {
      enabled: true,
      etag: '"seed-etag"',
      last_modified_at: seedLastModifiedAt,
    })

    mockCrawlerRss.mockResolvedValueOnce({
      responseCode: 304,
      feed: null,
      contentSha256: null,
      headers: { etag: '"new-etag"', lastModified: 'Mon, 01 Jan 0001 00:00:00 +0000' },
    })

    const result = await fetchRssFeedForTest(feed.id, 0)
    expect(result).toEqual([])

    const updatedFeed = await getRssFeedById(feed.id)
    expect(updatedFeed!.etag).toBe('"new-etag"')
    expect(updatedFeed!.last_modified_at).toEqual(seedLastModifiedAt)
  }, 30_000)
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { parseFeedDocument } from '@vouchington/rss-parser'
import type CrawlerRss from '@services/crawler-rss'
import type { checkRssFeedCrawlable } from '../fetch-robots-check.mts'
import { fetchRssFeed } from '../fetch.mts'
import { createRssFeed } from '../create.mts'
import { updateRssFeedById } from '../update.mts'
import { getLatestRssFeedCrawlForFeed, insertRssFeedCrawl } from '../crawls.mts'
import { searchRssFeedItems } from '@services/rss-feed-items/search'
import { createTestTopic } from '@voucha/test-helpers'

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

describe('fetch.conditional-get', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCheckRssFeedCrawlable.mockResolvedValue(true)
  })

  it('getLatestRssFeedCrawlForFeed ignores sha256-only crawls that cannot replay a body', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topic = await createTestTopic({
      name: `Topic sha256-only ${random}`,
      slug: `topic-sha256-only-${random}`,
      hostname: `fetch-sha256-only-${random}.example.com`,
    })
    const feed = await createRssFeed({
      skipRemoteValidation: true,
      rss_feed_url: `https://example.com/sha256-only-${random}.xml`,
      topic_id: topic.id,
      title: `Feed sha256-only ${random}`,
    })
    const [, fixtureContentSha256] = createMockFeedFixture(`sha256-only-${random}`)
    await insertRssFeedCrawl({
      rss_feed_id: feed.id,
      response_code: 200,
      feed_data_sha256: fixtureContentSha256,
    })

    await expect(getLatestRssFeedCrawlForFeed(feed.id)).resolves.toBeNull()
  }, 30_000)

  it('fetchRssFeed withholds validators and stores items when the crawl body is gone', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topic = await createTestTopic({
      name: `Topic stale 304 ${random}`,
      slug: `topic-stale-304-${random}`,
      hostname: `fetch-stale-304-${random}.example.com`,
    })
    const feed = await createRssFeed({
      skipRemoteValidation: true,
      rss_feed_url: `https://example.com/stale-304-${random}.xml`,
      topic_id: topic.id,
      title: `Feed stale 304 ${random}`,
    })
    await updateRssFeedById(feed.id, {
      enabled: true,
      etag: '"stale-etag"',
      last_modified_at: new Date('2024-01-01T00:00:00.000Z'),
      last_fetched_at: new Date('2020-01-01T00:00:00.000Z'),
    })
    const [fixtureFeed, fixtureContentSha256] = createMockFeedFixture(`stale-304-${random}`)
    mockCrawlerRss.mockImplementation(async (_url, requestOptions) => {
      if (
        requestOptions?.headers?.['If-None-Match'] ||
        requestOptions?.headers?.['If-Modified-Since']
      ) {
        return {
          responseCode: 304,
          feed: null,
          contentSha256: null,
          headers: { etag: null, lastModified: null },
        }
      }
      return {
        responseCode: 200,
        feed: fixtureFeed,
        contentSha256: fixtureContentSha256,
        headers: { etag: '"fresh-etag"', lastModified: null },
      }
    })

    const result = await fetchRssFeedForTest(feed.id)
    const items = await searchRssFeedItems({ rss_feed_ids: [feed.id], limit: 10 })

    expect(mockCrawlerRss.mock.calls[0]?.[1]?.headers).toEqual({})
    expect(result).toHaveLength(1)
    expect(items.results).toHaveLength(1)
  }, 30_000)

  it('fetchRssFeed still sends validators when a replayable crawl body remains', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topic = await createTestTopic({
      name: `Topic replay 304 ${random}`,
      slug: `topic-replay-304-${random}`,
      hostname: `fetch-replay-304-${random}.example.com`,
    })
    const feed = await createRssFeed({
      skipRemoteValidation: true,
      rss_feed_url: `https://example.com/replay-304-${random}.xml`,
      topic_id: topic.id,
      title: `Feed replay 304 ${random}`,
    })
    await updateRssFeedById(feed.id, {
      enabled: true,
      etag: '"fresh-etag"',
      last_fetched_at: new Date('2020-01-01T00:00:00.000Z'),
    })
    const [fixtureFeed, fixtureContentSha256] = createMockFeedFixture(`replay-304-${random}`)
    await insertRssFeedCrawl({
      rss_feed_id: feed.id,
      response_code: 200,
      feed_data: fixtureFeed,
      feed_data_sha256: fixtureContentSha256,
    })
    mockCrawlerRss.mockResolvedValueOnce({
      responseCode: 304,
      feed: null,
      contentSha256: null,
      headers: { etag: null, lastModified: null },
    })

    const result = await fetchRssFeedForTest(feed.id)

    expect(mockCrawlerRss.mock.calls[0]?.[1]?.headers).toEqual({
      'If-None-Match': '"fresh-etag"',
    })
    expect(result).toEqual([])
  }, 30_000)
})

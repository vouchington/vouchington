import { it, expect, vi, beforeEach, describe } from 'vitest'
import type CrawlerRss from '@services/crawler-rss'
import type { checkRssFeedCrawlable } from '../fetch-robots-check.mts'
import { fetchRssFeed } from '../fetch.mts'
import { createRssFeed } from '../create.mts'
import { getRssFeedById } from '../get.mts'
import { updateRssFeedById } from '../update.mts'
import {
  getDomainRateLimitRemainingMs,
  setDomainRateLimited,
} from '@services/crawls/domain-rate-limit'
import { assertRssFetchHostnameNotRateLimited } from '../domain-rate-limit.mts'
import {
  CrawlerInvalidContentTypeError,
  CrawlerHttpClientError,
  CrawlerServerError,
  CrawlerRateLimitError,
} from '@modules/on-error/errors'
import { getEffectiveUnreliableStatusCodes } from '../fetch-failures.mts'
import {
  createTestTopic,
  getRssFeedDeletedAt,
  updateUrlHostnameUnreliableStatusCodes,
} from '@voucha/test-helpers'

const VALID_CONTENT_TYPES = ['application/rss+xml', 'application/atom+xml']

const mockCrawlerRss = vi.fn<typeof CrawlerRss>()

const mockCheckRssFeedCrawlable = vi.fn<typeof checkRssFeedCrawlable>()

function fetchRssFeedForTest(...args: Parameters<typeof fetchRssFeed>) {
  const [rssFeedId, ttl, overrideUrl, hopCount, dependencies] = args
  return fetchRssFeed(rssFeedId, ttl, overrideUrl, hopCount, {
    crawlerRss: mockCrawlerRss,
    checkRssFeedCrawlable: mockCheckRssFeedCrawlable,
    ...dependencies,
  })
}

describe('fetch.permanent-error', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCheckRssFeedCrawlable.mockResolvedValue(true)
  })

  it('getEffectiveUnreliableStatusCodes tolerates missing policy data', () => {
    expect(getEffectiveUnreliableStatusCodes(null)).toEqual([])
    expect(getEffectiveUnreliableStatusCodes(undefined)).toEqual([])
  })

  async function createEnabledFeed(random: string) {
    const topic = await createTestTopic({
      hostname: `perm-err-${random}.example.com`,
    })
    const feed = await createRssFeed({
      skipRemoteValidation: true,
      rss_feed_url: `https://perm-err-${random}.example.com/feed.xml`,
      topic_id: topic.id,
      title: `Perm Error Test ${random}`,
    })
    await updateRssFeedById(feed.id, { enabled: true })
    return feed
  }

  async function getFeedHostnameId(feedId: string) {
    const feed = await getRssFeedById(feedId)
    return feed!.rss_feed_url.hostname.id as string
  }

  it('fetchRssFeed defers without calling CrawlerRss when the hostname has an active domain rate-limit lock', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const feed = await createEnabledFeed(random)
    const hostnameId = await getFeedHostnameId(feed.id)

    await setDomainRateLimited(hostnameId, 10_000)

    await expect(fetchRssFeedForTest(feed.id, 0)).rejects.toThrow(CrawlerRateLimitError)
    expect(mockCrawlerRss).not.toHaveBeenCalled()
  }, 30_000)

  it('assertRssFetchHostnameNotRateLimited falls back to the raw feed URL for malformed analytics labels', async () => {
    const hostnameId = `malformed-rss-url-${crypto.randomUUID()}`

    await setDomainRateLimited(hostnameId, 10_000)

    await expect(assertRssFetchHostnameNotRateLimited(hostnameId, 'http://[::1')).rejects.toThrow(
      CrawlerRateLimitError,
    )
  }, 30_000)

  it('fetchRssFeed records a domain rate-limit lock when CrawlerRss returns a rate-limit error', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const feed = await createEnabledFeed(random)
    const hostnameId = await getFeedHostnameId(feed.id)

    mockCrawlerRss.mockRejectedValue(
      new CrawlerRateLimitError(`https://perm-err-${random}.example.com/feed.xml`, 429, 50, 0),
    )

    await expect(fetchRssFeedForTest(feed.id, 0)).rejects.toThrow(CrawlerRateLimitError)

    const remainingMs = await getDomainRateLimitRemainingMs(hostnameId)
    expect(remainingMs).toBeGreaterThan(0)
  }, 30_000)

  it('fetchRssFeed soft-deletes the feed when parseFeed throws (invalid XML)', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const feed = await createEnabledFeed(random)

    const parseError = new Error('Failed to parse feed XML')
    Object.assign(parseError, { tags: { operation: 'parseFeed' } })
    mockCrawlerRss.mockRejectedValue(parseError)

    await expect(fetchRssFeedForTest(feed.id, 0)).rejects.toThrow(Error)

    const deletedAt = await getRssFeedDeletedAt(feed.id)
    expect(deletedAt).not.toBeNull()
  }, 30_000)

  it('fetchRssFeed soft-deletes the feed on CrawlerInvalidContentTypeError', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const feed = await createEnabledFeed(random)

    mockCrawlerRss.mockRejectedValue(
      new CrawlerInvalidContentTypeError(
        `https://perm-err-${random}.example.com/feed.xml`,
        'text/html',
        50,
        VALID_CONTENT_TYPES,
      ),
    )

    await expect(fetchRssFeedForTest(feed.id, 0)).rejects.toThrow(Error)

    const deletedAt = await getRssFeedDeletedAt(feed.id)
    expect(deletedAt).not.toBeNull()
  }, 30_000)

  it('fetchRssFeed soft-deletes the feed on CrawlerHttpClientError 404', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const feed = await createEnabledFeed(random)

    mockCrawlerRss.mockRejectedValue(
      new CrawlerHttpClientError(`https://perm-err-${random}.example.com/feed.xml`, 404, 50),
    )

    await expect(fetchRssFeedForTest(feed.id, 0)).rejects.toThrow(Error)

    const deletedAt = await getRssFeedDeletedAt(feed.id)
    expect(deletedAt).not.toBeNull()
  }, 30_000)

  it('fetchRssFeed does NOT soft-delete on feed-configured unreliable CrawlerHttpClientError 404', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const feed = await createEnabledFeed(random)
    await updateRssFeedById(feed.id, { unreliable_status_codes: [404] })

    mockCrawlerRss.mockRejectedValue(
      new CrawlerHttpClientError(`https://perm-err-${random}.example.com/feed.xml`, 404, 50),
    )

    await expect(fetchRssFeedForTest(feed.id, 0)).rejects.toThrow(Error)

    const deletedAt = await getRssFeedDeletedAt(feed.id)
    expect(deletedAt).toBeNull()
  }, 30_000)

  it('fetchRssFeed does NOT soft-delete on hostname-configured unreliable CrawlerHttpClientError 404', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const feed = await createEnabledFeed(random)
    const hostnameId = await getFeedHostnameId(feed.id)
    await updateUrlHostnameUnreliableStatusCodes(hostnameId, [404])

    mockCrawlerRss.mockRejectedValue(
      new CrawlerHttpClientError(`https://perm-err-${random}.example.com/feed.xml`, 404, 50),
    )

    await expect(fetchRssFeedForTest(feed.id, 0)).rejects.toThrow(Error)

    const deletedAt = await getRssFeedDeletedAt(feed.id)
    expect(deletedAt).toBeNull()
  }, 30_000)

  it('fetchRssFeed soft-deletes when feed empty unreliable statuses override hostname 404', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const feed = await createEnabledFeed(random)
    const hostnameId = await getFeedHostnameId(feed.id)
    await updateUrlHostnameUnreliableStatusCodes(hostnameId, [404])
    await updateRssFeedById(feed.id, { unreliable_status_codes: [] })

    mockCrawlerRss.mockRejectedValue(
      new CrawlerHttpClientError(`https://perm-err-${random}.example.com/feed.xml`, 404, 50),
    )

    await expect(fetchRssFeedForTest(feed.id, 0)).rejects.toThrow(Error)

    const deletedAt = await getRssFeedDeletedAt(feed.id)
    expect(deletedAt).not.toBeNull()
  }, 30_000)

  it('fetchRssFeed does NOT soft-delete on CrawlerHttpClientError 429 (transient)', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const feed = await createEnabledFeed(random)

    mockCrawlerRss.mockRejectedValue(
      new CrawlerHttpClientError(`https://perm-err-${random}.example.com/feed.xml`, 429, 50),
    )

    await expect(fetchRssFeedForTest(feed.id, 0)).rejects.toThrow(Error)

    const deletedAt = await getRssFeedDeletedAt(feed.id)
    expect(deletedAt).toBeNull()
  }, 30_000)

  it('fetchRssFeed does NOT soft-delete on CrawlerServerError 500 (transient)', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const feed = await createEnabledFeed(random)

    mockCrawlerRss.mockRejectedValue(
      new CrawlerServerError(`https://perm-err-${random}.example.com/feed.xml`, 500, 50),
    )

    await expect(fetchRssFeedForTest(feed.id, 0)).rejects.toThrow(Error)

    const deletedAt = await getRssFeedDeletedAt(feed.id)
    expect(deletedAt).toBeNull()
  }, 30_000)

  it('fetchRssFeed does NOT soft-delete on CrawlerRateLimitError (transient)', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const feed = await createEnabledFeed(random)

    mockCrawlerRss.mockRejectedValue(
      new CrawlerRateLimitError(`https://perm-err-${random}.example.com/feed.xml`, 429, 50),
    )

    await expect(fetchRssFeedForTest(feed.id, 0)).rejects.toThrow(Error)

    const deletedAt = await getRssFeedDeletedAt(feed.id)
    expect(deletedAt).toBeNull()
  }, 30_000)

  it('fetchRssFeed idempotent: second invocation exits early after soft-delete', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const feed = await createEnabledFeed(random)

    mockCrawlerRss.mockRejectedValue(
      new CrawlerInvalidContentTypeError(
        `https://perm-err-${random}.example.com/feed.xml`,
        'text/html',
        50,
        VALID_CONTENT_TYPES,
      ),
    )

    // First call: soft-deletes and throws
    await expect(fetchRssFeedForTest(feed.id, 0)).rejects.toThrow(Error)

    // Second call: getRssFeedByIdToFetch returns null → early exit, no crash
    const result = await fetchRssFeedForTest(feed.id, 0)
    expect(result).toEqual([])
  }, 30_000)
})

import { it, expect, vi, beforeEach, describe } from 'vitest'
import { createHash } from 'node:crypto'
import { parseFeedDocument } from '@vouchington/rss-parser'
import type CrawlerRss from '@services/crawler-rss'
import type { checkRssFeedCrawlable } from '../fetch-robots-check.mts'
import { fetchRssFeed } from '../fetch.mts'
import { createRssFeed } from '../create.mts'
import { updateRssFeedById } from '../update.mts'
import { getRssFeedById } from '../get.mts'
import {
  createTestTopic,
  getRssFeedDeletedAt,
  updateUrlHostnameBlocked,
  updateUrlHostnameUnreliableStatusCodes,
} from '@voucha/test-helpers'
import { upsertUrlHostnames } from '@services/urls-hostnames'
import { CrawlerHttpClientError } from '@modules/on-error/errors'

const mockXml = Buffer.from(
  '<rss version="2.0"><channel><title>Mock</title><item><link>https://example.com/item-redirect-1</link><guid>redir-guid-1</guid><title>Item 1</title></item></channel></rss>',
  'utf-8',
)
const mockContentSha256 = createHash('sha256').update(mockXml).digest()
const mockFeed = parseFeedDocument(mockXml).feed

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

async function makeFeed(suffix: string) {
  const random = Math.random().toString(36).slice(2, 12)
  const feedUrl = `https://redir-test-${suffix}-${random}.example.com/feed.xml`
  const topic = await createTestTopic({
    name: `Redirect Test ${suffix} ${random}`,
    slug: `redir-test-${suffix}-${random}`,
    hostname: `redir-test-${suffix}-${random}.example.com`,
  })
  const feed = await createRssFeed({
    skipRemoteValidation: true,
    rss_feed_url: feedUrl,
    topic_id: topic.id,
    title: `Redirect Feed ${suffix} ${random}`,
  })
  await updateRssFeedById(feed.id, { enabled: true })
  return { ...feed, feedUrl }
}

describe('fetch.redirect', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCheckRssFeedCrawlable.mockResolvedValue(true)
  })

  it('fetchRssFeed handles permanent redirect (308): updates feed URL and re-fetches', async () => {
    const feed = await makeFeed('perm')

    const redirectLocation = `https://redir-perm-target-${Math.random().toString(36).slice(2, 12)}.example.com/feed.xml`

    mockCrawlerRss
      .mockResolvedValueOnce({
        responseCode: 308,
        feed: null,
        contentSha256: null,
        headers: { etag: null, lastModified: null },
        redirect: { location: redirectLocation, isPermanent: true },
      })
      .mockResolvedValueOnce({
        responseCode: 200,
        feed: mockFeed,
        contentSha256: mockContentSha256,
        headers: { etag: null, lastModified: null },
      })

    await fetchRssFeedForTest(feed.id, 0)

    // Feed URL should be updated to the redirect target
    const updatedFeed = await getRssFeedById(feed.id)
    expect(updatedFeed?.rss_feed_url.url).toContain('redir-perm-target')
  }, 30_000)

  it('fetchRssFeed handles temporary redirect (307): does not update feed URL permanently', async () => {
    const feed = await makeFeed('tmp')
    const originalUrl = feed.feedUrl

    const redirectLocation = `https://redir-tmp-target-${Math.random().toString(36).slice(2, 12)}.example.com/feed.xml`

    mockCrawlerRss
      .mockResolvedValueOnce({
        responseCode: 307,
        feed: null,
        contentSha256: null,
        headers: { etag: null, lastModified: null },
        redirect: { location: redirectLocation, isPermanent: false },
      })
      .mockResolvedValueOnce({
        responseCode: 200,
        feed: mockFeed,
        contentSha256: mockContentSha256,
        headers: { etag: null, lastModified: null },
      })

    await fetchRssFeedForTest(feed.id, 0)

    // Feed URL should NOT be changed for a temporary redirect
    const updatedFeed = await getRssFeedById(feed.id)
    expect(updatedFeed?.rss_feed_url.url).toBe(originalUrl)

    // Feed should remain enabled (not disabled for temporary redirects)
    expect(updatedFeed?.is_enabled).toBe(true)
  }, 30_000)

  it('fetchRssFeed self-redirect does not loop', async () => {
    const feed = await makeFeed('self')

    mockCrawlerRss.mockResolvedValueOnce({
      responseCode: 301,
      feed: null,
      contentSha256: null,
      headers: { etag: null, lastModified: null },
      redirect: { location: feed.feedUrl, isPermanent: true },
    })

    // Should complete without throwing or looping
    await expect(fetchRssFeedForTest(feed.id, 0)).resolves.toEqual([])
    // CrawlerRss should only be called once (self-redirect detected and aborted)
    expect(mockCrawlerRss).toHaveBeenCalledTimes(1)
  }, 30_000)

  it('fetchRssFeed records a blocked redirect target without retrying', async () => {
    const feed = await makeFeed('blocked-target')
    const targetHostname = `redir-blocked-target-${Math.random().toString(36).slice(2, 12)}.example.com`
    const redirectLocation = `https://${targetHostname}/feed.xml`
    const hostnameMap = await upsertUrlHostnames(null, [targetHostname])
    await updateUrlHostnameBlocked(hostnameMap.get(targetHostname)!, true)

    mockCrawlerRss.mockResolvedValueOnce({
      responseCode: 302,
      feed: null,
      contentSha256: null,
      headers: { etag: null, lastModified: null },
      redirect: { location: redirectLocation, isPermanent: false },
    })

    await expect(fetchRssFeedForTest(feed.id, 0)).resolves.toEqual([])
    expect(mockCrawlerRss).toHaveBeenCalledTimes(1)
    const updatedFeed = await getRssFeedById(feed.id)
    expect(updatedFeed?.rss_feed_url.url).toBe(feed.feedUrl)
  }, 30_000)

  it('fetchRssFeed applies temporary redirect target hostname retry policy', async () => {
    const feed = await makeFeed('target-unreliable')
    const targetHostname = `redir-unreliable-target-${Math.random().toString(36).slice(2, 12)}.example.com`
    const redirectLocation = `https://${targetHostname}/feed.xml`
    const hostnameMap = await upsertUrlHostnames(null, [targetHostname])
    await updateUrlHostnameUnreliableStatusCodes(hostnameMap.get(targetHostname)!, [404])

    mockCrawlerRss
      .mockResolvedValueOnce({
        responseCode: 302,
        feed: null,
        contentSha256: null,
        headers: { etag: null, lastModified: null },
        redirect: { location: redirectLocation, isPermanent: false },
      })
      .mockRejectedValueOnce(new CrawlerHttpClientError(redirectLocation, 404, 50))

    await expect(fetchRssFeedForTest(feed.id, 0)).rejects.toThrow(CrawlerHttpClientError)
    expect(await getRssFeedDeletedAt(feed.id)).toBeNull()
  }, 30_000)

  it('fetchRssFeed permanent redirect to existing canonical feed: disables source', async () => {
    const sourceFeed = await makeFeed('perm-src')
    const canonicalFeed = await makeFeed('perm-can')

    // The canonical feed already has its own URL stored in the DB
    const canonicalFeedData = await getRssFeedById(canonicalFeed.id)
    const canonicalUrl = canonicalFeedData!.rss_feed_url.url

    mockCrawlerRss
      .mockResolvedValueOnce({
        responseCode: 308,
        feed: null,
        contentSha256: null,
        headers: { etag: null, lastModified: null },
        redirect: { location: canonicalUrl, isPermanent: true },
      })
      .mockResolvedValueOnce({
        responseCode: 200,
        feed: mockFeed,
        contentSha256: mockContentSha256,
        headers: { etag: null, lastModified: null },
      })

    await fetchRssFeedForTest(sourceFeed.id, 0)

    const updatedSource = await getRssFeedById(sourceFeed.id)
    // Source feed should be disabled
    expect(updatedSource?.is_enabled).toBe(false)
    expect(updatedSource?.is_discoverable).toBe(false)

    // canonical_rss_feed_id should be set (view exposes it)
    expect(updatedSource?.canonical_rss_feed_id).toBe(canonicalFeed.id)
  }, 30_000)
})

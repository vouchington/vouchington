import { it, expect, vi, beforeEach, describe } from 'vitest'
import type CrawlerRss from '@services/crawler-rss'
import type { checkRssFeedCrawlable } from '../fetch-robots-check.mts'
import { fetchRssFeed } from '../fetch.mts'
import { createRssFeed } from '../create.mts'
import { updateRssFeedById } from '../update.mts'
import { upsertUrlHostnames } from '@services/urls-hostnames'
import { NETWORK_BACKOFF_FAILURE_THRESHOLD } from '@services/urls-hostnames/network-backoff'
import { CrawlerNetworkError } from '@modules/on-error/errors'
import { createTestTopic, WEB_PROVENANCE } from '@voucha/test-helpers'
import {
  expireTestHostnameNetworkBackoff,
  getTestHostnameNetworkBackoff,
} from '@voucha/test-helpers/entities/url-hostname-network-backoff'

const mockCrawlerRss = vi.fn<typeof CrawlerRss>()
const mockCheckRssFeedCrawlable = vi.fn<typeof checkRssFeedCrawlable>()

function fetchRssFeedForTest(rssFeedId: string) {
  return fetchRssFeed(rssFeedId, 0, null, 0, {
    crawlerRss: mockCrawlerRss,
    checkRssFeedCrawlable: mockCheckRssFeedCrawlable,
    resolveDnsCanary: () => Promise.resolve(),
  })
}

function makeResetError(hostname: string): CrawlerNetworkError {
  const inner = Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' })
  const cause = new TypeError('fetch failed', { cause: inner })
  return new CrawlerNetworkError(`https://${hostname}/feed.xml`, 2, cause as Error)
}

async function makeFeed() {
  const random = Math.random().toString(36).slice(2, 12)
  const hostname = `net-backoff-rss-${random}.example.com`
  const topic = await createTestTopic({
    name: `Network backoff RSS ${random}`,
    slug: `net-backoff-rss-${random}`,
    hostname,
  })
  const feed = await createRssFeed({
    provenance: WEB_PROVENANCE,
    rss_feed_url: `https://${hostname}/feed.xml`,
    topic_id: topic.id,
    title: `Network backoff RSS ${random}`,
    skipRemoteValidation: true,
  })
  await updateRssFeedById(feed.id, { is_enabled: true })
  const hostnameId = [...(await upsertUrlHostnames(null, [hostname])).values()][0]!
  return { feedId: feed.id, hostname, hostnameId }
}

describe('fetch.network-backoff', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCheckRssFeedCrawlable.mockResolvedValue(true)
  })

  it('trips the hostname backoff and then skips fetches without failing the feed', async () => {
    const { feedId, hostname, hostnameId } = await makeFeed()
    mockCrawlerRss.mockRejectedValue(makeResetError(hostname))

    for (let attempt = 0; attempt < NETWORK_BACKOFF_FAILURE_THRESHOLD; attempt++) {
      await expect(fetchRssFeedForTest(feedId)).rejects.toBeInstanceOf(CrawlerNetworkError)
    }
    const state = (await getTestHostnameNetworkBackoff(hostnameId))!
    expect(state.network_backoff_step).toBe(1)
    expect(state.is_crawlable).toBe(true)

    mockCrawlerRss.mockClear()
    await expect(fetchRssFeedForTest(feedId)).resolves.toEqual([])
    expect(mockCrawlerRss).not.toHaveBeenCalled()
  })

  it('leaves the probe unclaimed when robots.txt disallows the feed', async () => {
    const { feedId, hostname, hostnameId } = await makeFeed()
    mockCrawlerRss.mockRejectedValue(makeResetError(hostname))
    for (let attempt = 0; attempt < NETWORK_BACKOFF_FAILURE_THRESHOLD; attempt++) {
      await expect(fetchRssFeedForTest(feedId)).rejects.toBeInstanceOf(CrawlerNetworkError)
    }
    await expireTestHostnameNetworkBackoff(hostnameId)

    mockCrawlerRss.mockClear()
    mockCheckRssFeedCrawlable.mockResolvedValueOnce(false)
    await expect(fetchRssFeedForTest(feedId)).resolves.toEqual([])
    expect(mockCrawlerRss).not.toHaveBeenCalled()
    expect(
      (await getTestHostnameNetworkBackoff(hostnameId))!.network_backoff_probe_claimed_at,
    ).toBeNull()
  })
})

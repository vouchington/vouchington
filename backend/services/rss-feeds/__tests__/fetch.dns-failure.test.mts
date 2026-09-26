import { it, expect, vi, beforeEach, describe } from 'vitest'
import type CrawlerRss from '@services/crawler-rss'
import type { checkRssFeedCrawlable } from '../fetch-robots-check.mts'
import { fetchRssFeed } from '../fetch.mts'
import { createRssFeed } from '../create.mts'
import { updateRssFeedById } from '../update.mts'
import { upsertUrlHostnames } from '@services/urls-hostnames'
import { recordHostnameConfigurationFailure } from '@services/urls-hostnames/dns-failures'
import { CrawlerNetworkError } from '@modules/on-error/errors'
import {
  createTestTopic,
  getTestHostnameDnsStats,
  updateUrlHostnameCrawlable,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'

const mockCrawlerRss = vi.fn<typeof CrawlerRss>()

const mockCheckRssFeedCrawlable = vi.fn<typeof checkRssFeedCrawlable>()

const mockResolveDnsCanary = vi.fn<VitestLooseMock>().mockResolvedValue(undefined)

function fetchRssFeedForTest(...args: Parameters<typeof fetchRssFeed>) {
  const [rssFeedId, ttl, overrideUrl, hopCount, dependencies] = args
  return fetchRssFeed(rssFeedId, ttl, overrideUrl, hopCount, {
    crawlerRss: mockCrawlerRss,
    checkRssFeedCrawlable: mockCheckRssFeedCrawlable,
    resolveDnsCanary: mockResolveDnsCanary,
    ...dependencies,
  })
}

function makeDnsError(hostname: string): CrawlerNetworkError {
  const inner = new Error(`getaddrinfo ENOTFOUND ${hostname}`)
  Object.assign(inner, { code: 'ENOTFOUND', syscall: 'getaddrinfo', hostname })
  const cause = new TypeError('fetch failed', { cause: inner })
  return new CrawlerNetworkError(`https://${hostname}/feed.xml`, 2, cause as Error)
}

function makeTlsHostnameError(hostname: string): CrawlerNetworkError {
  const inner = Object.assign(
    new Error(
      `Hostname/IP does not match certificate's altnames: Host: ${hostname}. is not in the cert's altnames`,
    ),
    {
      code: 'ERR_TLS_CERT_ALTNAME_INVALID',
      host: hostname,
    },
  )
  const cause = new TypeError('fetch failed', { cause: inner })
  return new CrawlerNetworkError(`https://${hostname}/feed.xml`, 2, cause as Error)
}

async function makeFeed(label: string) {
  const random = Math.random().toString(36).slice(2, 12)
  const hostname = `dns-rss-${label}-${random}.example.com`
  const feedUrl = `https://${hostname}/feed.xml`
  const topic = await createTestTopic({
    name: `DNS RSS ${label} ${random}`,
    slug: `dns-rss-${label}-${random}`,
    hostname,
  })
  const feed = await createRssFeed({
    provenance: WEB_PROVENANCE,
    rss_feed_url: feedUrl,
    topic_id: topic.id,
    title: `DNS RSS Feed ${label} ${random}`,
    skipRemoteValidation: true,
  })
  await updateRssFeedById(feed.id, { enabled: true })

  // Resolve the hostname_id for later inspection
  const hostnamesMap = await upsertUrlHostnames(null, [hostname])
  const hostnameId = [...hostnamesMap.values()][0]!

  return { feedId: feed.id, hostname, hostnameId }
}

describe('fetch.dns-failure', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCheckRssFeedCrawlable.mockResolvedValue(true)
  })

  it('fetchRssFeed disables hostname after 3 DNS failures', async () => {
    const { feedId, hostname, hostnameId } = await makeFeed('disable')
    mockCrawlerRss.mockRejectedValue(makeDnsError(hostname))

    await expect(fetchRssFeedForTest(feedId)).rejects.toBeInstanceOf(CrawlerNetworkError)
    await expect(fetchRssFeedForTest(feedId)).rejects.toBeInstanceOf(CrawlerNetworkError)
    await expect(fetchRssFeedForTest(feedId)).rejects.toBeInstanceOf(CrawlerNetworkError)

    const dnsStats = await getTestHostnameDnsStats(hostnameId)
    expect(dnsStats!.consecutive_dns_failures).toBe(3)
    expect(dnsStats!.crawlable).toBe(false)
    expect(mockResolveDnsCanary).toHaveBeenCalledTimes(3)
  })

  it('fetchRssFeed disables hostname after 3 TLS hostname certificate failures', async () => {
    const { feedId, hostname, hostnameId } = await makeFeed('tls-altname')
    mockCrawlerRss.mockRejectedValue(makeTlsHostnameError(hostname))

    await expect(fetchRssFeedForTest(feedId)).rejects.toBeInstanceOf(CrawlerNetworkError)
    await expect(fetchRssFeedForTest(feedId)).rejects.toBeInstanceOf(CrawlerNetworkError)
    await expect(fetchRssFeedForTest(feedId)).rejects.toBeInstanceOf(CrawlerNetworkError)

    const dnsStats = await getTestHostnameDnsStats(hostnameId)
    expect(dnsStats!.consecutive_dns_failures).toBe(3)
    expect(dnsStats!.last_dns_failure_at).toBeInstanceOf(Date)
    expect(dnsStats!.dns_disabled_at).toBeInstanceOf(Date)
    expect(dnsStats!.crawlable).toBe(false)
  })

  it('fetchRssFeed records redirect-target TLS hostname failures on the target hostname', async () => {
    const { feedId, hostnameId } = await makeFeed('redirect-tls')
    const random = Math.random().toString(36).slice(2, 12)
    const targetHostname = `dns-rss-redirect-target-${random}.example.com`
    const targetUrl = `https://${targetHostname}/feed.xml`
    const targetHostnameId = [...(await upsertUrlHostnames(null, [targetHostname])).values()][0]!

    mockCrawlerRss
      .mockResolvedValueOnce({
        responseCode: 302,
        feed: null,
        contentSha256: null,
        headers: { etag: null, lastModified: null },
        redirect: { location: targetUrl, isPermanent: false },
      })
      .mockRejectedValueOnce(makeTlsHostnameError(targetHostname))

    await expect(fetchRssFeedForTest(feedId)).rejects.toBeInstanceOf(CrawlerNetworkError)

    const sourceStats = await getTestHostnameDnsStats(hostnameId)
    const targetStats = await getTestHostnameDnsStats(targetHostnameId)
    expect(sourceStats!.consecutive_dns_failures).toBe(0)
    expect(targetStats!.consecutive_dns_failures).toBe(1)
  })

  it('fetchRssFeed resets redirect-target hostname failures after a redirected success', async () => {
    const { feedId, hostnameId } = await makeFeed('redirect-reset')
    const random = Math.random().toString(36).slice(2, 12)
    const targetHostname = `dns-rss-redirect-reset-target-${random}.example.com`
    const targetUrl = `https://${targetHostname}/feed.xml`
    const targetHostnameId = [...(await upsertUrlHostnames(null, [targetHostname])).values()][0]!
    await recordHostnameConfigurationFailure(targetHostnameId)

    mockCrawlerRss
      .mockResolvedValueOnce({
        responseCode: 302,
        feed: null,
        contentSha256: null,
        headers: { etag: null, lastModified: null },
        redirect: { location: targetUrl, isPermanent: false },
      })
      .mockResolvedValueOnce({
        responseCode: 304,
        feed: null,
        contentSha256: null,
        headers: { etag: null, lastModified: null },
      })

    await expect(fetchRssFeedForTest(feedId)).resolves.toEqual([])

    const sourceStats = await getTestHostnameDnsStats(hostnameId)
    const targetStats = await getTestHostnameDnsStats(targetHostnameId)
    expect(sourceStats!.consecutive_dns_failures).toBe(0)
    expect(targetStats!.consecutive_dns_failures).toBe(0)
    expect(targetStats!.dns_disabled_at).toBeNull()
    expect(targetStats!.crawlable).toBe(true)
  })

  it('fetchRssFeed short-circuits without calling CrawlerRss when crawlable=false', async () => {
    const { feedId, hostnameId } = await makeFeed('gate')
    mockCrawlerRss.mockRejectedValue(makeDnsError('dns-rss-gate.example.com'))

    // Set crawlable=false directly; counter behavior is covered above and by
    // urls-hostnames/dns-failures.mock.test.mts.
    await updateUrlHostnameCrawlable(hostnameId, false)

    const callCountBefore = mockCrawlerRss.mock.calls.length

    // fetchRssFeed must short-circuit: no CrawlerRss call, returns []
    const result = await fetchRssFeedForTest(feedId)
    expect(result).toEqual([])
    expect(mockCrawlerRss.mock.calls.length).toBe(callCountBefore)
  })
})

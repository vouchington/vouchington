import { describe, it, expect } from 'vitest'
import { addUrl } from '@services/urls/upsert'
import { createCrawler } from '@services/crawlers'
import { NETWORK_BACKOFF_FAILURE_THRESHOLD } from '@services/urls-hostnames/network-backoff'
import { useCrawlUrlRedirectHarness } from '@voucha/test-helpers/services/crawls/crawl-url-redirect-harness'
import {
  expireTestHostnameNetworkBackoff,
  getTestHostnameNetworkBackoff,
} from '@voucha/test-helpers/entities/url-hostname-network-backoff'
import { CrawlerNetworkError, CrawlerRateLimitError } from '@modules/on-error/errors'
import { dispatchCrawlUrlsPerHostname } from '../dispatch-per-hostname.mts'
import { getDomainRateLimitRemainingMs } from '../domain-rate-limit.mts'

describe('crawl-url network backoff', () => {
  const { fetchCrawlerHtml, crawlUrlForTest, createMockCrawlerResult, user } =
    useCrawlUrlRedirectHarness()

  async function createHostname(prefix: string) {
    const hostname = `${prefix}-${crypto.randomUUID()}.example.com`
    const first = await addUrl(user().id, `https://${hostname}/0`)
    await createCrawler(user(), { hostname_id: first!.hostname.id, crawler_type: 'fetch' })
    return {
      hostname,
      hostnameId: first!.hostname.id,
      addPage: async (page: number) => (await addUrl(user().id, `https://${hostname}/${page}`))!,
    }
  }

  function refused(hostname: string, page: number, code = 'ECONNRESET') {
    const cause = Object.assign(new Error(`socket ${code}`), { code })
    return new CrawlerNetworkError(`https://${hostname}/${page}`, 5, cause)
  }

  async function tripBackoff(host: Awaited<ReturnType<typeof createHostname>>) {
    for (let page = 1; page <= NETWORK_BACKOFF_FAILURE_THRESHOLD; page++) {
      const url = await host.addPage(page)
      fetchCrawlerHtml.mockRejectedValueOnce(refused(host.hostname, page))
      await expect(crawlUrlForTest(url.id)).rejects.toThrow(CrawlerNetworkError)
    }
  }

  it('trips after repeated connection failures and then skips the hostname', async () => {
    const host = await createHostname('net-backoff-trip')
    await tripBackoff(host)

    const state = (await getTestHostnameNetworkBackoff(host.hostnameId))!
    expect(state.network_backoff_step).toBe(1)
    expect(state.is_crawlable).toBe(true)

    fetchCrawlerHtml.mockClear()
    const next = await host.addPage(100)
    await expect(crawlUrlForTest(next.id)).resolves.toBeNull()
    expect(fetchCrawlerHtml).not.toHaveBeenCalled()
    await expect(dispatchCrawlUrlsPerHostname(host.hostnameId)).resolves.toEqual({
      count: 0,
      hasMore: false,
    })
  })

  it('runs exactly one probe after expiry and closes the backoff on success', async () => {
    const host = await createHostname('net-backoff-probe')
    await tripBackoff(host)
    await expireTestHostnameNetworkBackoff(host.hostnameId)
    const [probeUrl, waitingUrl] = [await host.addPage(100), await host.addPage(101)]

    fetchCrawlerHtml.mockClear()
    let finishProbe!: () => void
    const probeStarted = new Promise<void>(resolveStarted => {
      fetchCrawlerHtml.mockImplementationOnce(
        () =>
          new Promise(resolveFetch => {
            finishProbe = () => resolveFetch(createMockCrawlerResult(200, null, null))
            resolveStarted()
          }),
      )
    })
    const probe = crawlUrlForTest(probeUrl.id)
    await probeStarted

    await expect(crawlUrlForTest(waitingUrl.id)).resolves.toBeNull()
    expect(fetchCrawlerHtml).toHaveBeenCalledTimes(1)

    finishProbe()
    await expect(probe).resolves.not.toBeNull()
    expect(await getTestHostnameNetworkBackoff(host.hostnameId)).toMatchObject({
      network_backoff_step: 0,
      network_backoff_ends_at: null,
      consecutive_network_failures: 0,
    })
  })

  it('leaves the probe unclaimed when robots.txt disallows the first URL', async () => {
    const host = await createHostname('net-backoff-robots')
    await tripBackoff(host)
    await expireTestHostnameNetworkBackoff(host.hostnameId)

    fetchCrawlerHtml.mockClear()
    const disallowed = await host.addPage(100)
    const skipped = crawlUrlForTest(disallowed.id, 0, new Set(), {
      dependencies: { isUrlCrawlable: () => Promise.resolve(false) },
    })
    await expect(skipped).resolves.toBeNull()
    expect(fetchCrawlerHtml).not.toHaveBeenCalled()
    expect(
      (await getTestHostnameNetworkBackoff(host.hostnameId))!.network_backoff_probe_claimed_at,
    ).toBeNull()

    const probeUrl = await host.addPage(101)
    fetchCrawlerHtml.mockResolvedValueOnce(createMockCrawlerResult(200, null, null))
    await expect(crawlUrlForTest(probeUrl.id)).resolves.not.toBeNull()
    expect(fetchCrawlerHtml).toHaveBeenCalledTimes(1)
  })

  it('closes the backoff when the probe answers with a redirect', async () => {
    const host = await createHostname('net-backoff-redirect')
    await tripBackoff(host)
    await expireTestHostnameNetworkBackoff(host.hostnameId)

    const probeUrl = await host.addPage(100)
    const target = `https://net-backoff-target-${crypto.randomUUID()}.example.com/`
    fetchCrawlerHtml
      .mockResolvedValueOnce(createMockCrawlerResult(301, null, target))
      .mockResolvedValueOnce(createMockCrawlerResult(200, null, null))
    await crawlUrlForTest(probeUrl.id)

    expect(await getTestHostnameNetworkBackoff(host.hostnameId)).toMatchObject({
      network_backoff_step: 0,
      network_backoff_ends_at: null,
    })
  })

  it('reopens the backoff for longer when the probe fails', async () => {
    const host = await createHostname('net-backoff-reopen')
    await tripBackoff(host)
    const firstEndsAt = (await getTestHostnameNetworkBackoff(host.hostnameId))!
      .network_backoff_ends_at!
    await expireTestHostnameNetworkBackoff(host.hostnameId)

    const probeUrl = await host.addPage(100)
    fetchCrawlerHtml.mockRejectedValueOnce(refused(host.hostname, 100))
    await expect(crawlUrlForTest(probeUrl.id)).rejects.toThrow(CrawlerNetworkError)

    const state = (await getTestHostnameNetworkBackoff(host.hostnameId))!
    expect(state.network_backoff_step).toBe(2)
    expect(state.network_backoff_ends_at!.getTime()).toBeGreaterThan(firstEndsAt.getTime())
  })

  it('counts a refused redirect target once, not once per redirect hop', async () => {
    const host = await createHostname('net-backoff-hops')
    const source = await host.addPage(1)
    fetchCrawlerHtml
      .mockResolvedValueOnce(createMockCrawlerResult(301, null, `https://${host.hostname}/2`))
      .mockRejectedValueOnce(refused(host.hostname, 2))
    await expect(crawlUrlForTest(source.id)).rejects.toThrow(CrawlerNetworkError)

    expect(
      (await getTestHostnameNetworkBackoff(host.hostnameId))!.consecutive_network_failures,
    ).toBe(1)
  })

  it('keeps DNS failures on the DNS path and 429s on the rate-limit lock', async () => {
    const host = await createHostname('net-backoff-paths')
    const failing = await host.addPage(1)
    fetchCrawlerHtml.mockRejectedValueOnce(refused(host.hostname, 1))
    await expect(crawlUrlForTest(failing.id)).rejects.toThrow(CrawlerNetworkError)
    expect(
      (await getTestHostnameNetworkBackoff(host.hostnameId))!.consecutive_network_failures,
    ).toBe(1)

    const dns = await host.addPage(2)
    fetchCrawlerHtml.mockRejectedValueOnce(refused(host.hostname, 2, 'ENOTFOUND'))
    const dnsCrawl = crawlUrlForTest(dns.id, 0, new Set(), {
      dependencies: { resolveDnsCanary: () => Promise.resolve() },
    })
    await expect(dnsCrawl).rejects.toThrow(CrawlerNetworkError)
    expect(
      (await getTestHostnameNetworkBackoff(host.hostnameId))!.consecutive_network_failures,
    ).toBe(1)

    const limited = await host.addPage(3)
    fetchCrawlerHtml.mockRejectedValueOnce(
      new CrawlerRateLimitError(`https://${host.hostname}/3`, 429, 5, 30_000),
    )
    await expect(crawlUrlForTest(limited.id)).rejects.toThrow(CrawlerRateLimitError)
    expect(await getDomainRateLimitRemainingMs(host.hostnameId)).toBeGreaterThan(0)
    expect(
      (await getTestHostnameNetworkBackoff(host.hostnameId))!.consecutive_network_failures,
    ).toBe(0)
  })
})

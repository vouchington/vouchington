import { randomUUID } from 'node:crypto'
import dns from 'node:dns'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MockAgent, withMockAgentDefaultFetchForTest } from '@voucha/test-helpers/provider-http'
import { insertTestRssFeedDirect } from '@voucha/test-helpers/entities/rss-feeds'
import { withPostgresQueryFailureForTest } from '@voucha/test-helpers/postgres-query-failure'
import { withPostgresPoolQueryFailureForTest } from '@voucha/test-helpers/postgres-pool-query-failure'
import { sentryCaptureExceptionMock } from '../../../test-helpers/vitest.setup.sentry-mock.mts'
import { getUrlById } from '@services/urls'
import { fetchRssFeed } from '../fetch.mts'
import { getRssFeedById } from '../get.mts'
import { updateRssFeedById } from '../update.mts'

describe('fetchRssFeed redirect persistence failures', () => {
  let agent: MockAgent
  let restoreLookup: () => void
  const ownedHostnames = new Set<string>()

  beforeEach(() => {
    agent = new MockAgent()
    agent.disableNetConnect()
    ownedHostnames.clear()
    const originalLookup = dns.promises.lookup
    const lookup = vi.fn<VitestLooseMock>(
      async (hostname: string, options?: { all?: boolean } | number) => {
        if (!ownedHostnames.has(hostname))
          return Reflect.apply(originalLookup, dns.promises, [hostname, options])
        const address = { address: '8.8.8.8', family: 4 } satisfies dns.LookupAddress
        return typeof options === 'object' && options.all ? [address] : address
      },
    )
    const lookupSpy = vi.spyOn(dns.promises, 'lookup').mockImplementation(lookup)
    restoreLookup = () => lookupSpy.mockRestore()
  })

  afterEach(async () => {
    restoreLookup()
    await agent.close()
  })

  async function makeFeed() {
    const hostname = `redirect-${randomUUID()}.example.com`
    ownedHostnames.add(hostname)
    const feedUrl = `https://${hostname}/feed.xml`
    const feed = await insertTestRssFeedDirect({
      topicHostname: hostname,
      rssFeedUrl: feedUrl,
      homePageUrl: `https://${hostname}/`,
    })
    await updateRssFeedById(feed.id, { ignore_robots_txt: true })
    return { ...feed, feedUrl }
  }

  function respondToRedirect(sourceUrl: string, targetUrl: string) {
    ownedHostnames.add(new URL(targetUrl).hostname)
    agent
      .get(new URL(sourceUrl).origin)
      .intercept({ path: '/feed.xml', method: 'GET' })
      .reply(301, '', { headers: { location: targetUrl } })
    agent
      .get(new URL(targetUrl).origin)
      .intercept({ path: '/feed.xml', method: 'GET' })
      .reply(
        200,
        '<rss version="2.0"><channel><title>Owned redirect feed</title></channel></rss>',
        { headers: { 'content-type': 'application/rss+xml' } },
      )
      .persist()
  }

  it('continues fetching when the permanent URL canonical write fails', async () => {
    const source = await makeFeed()
    const targetUrl = `https://target-${randomUUID()}.example.com/feed.xml`
    respondToRedirect(source.feedUrl, targetUrl)

    const { error } = await withMockAgentDefaultFetchForTest(agent, () =>
      withPostgresQueryFailureForTest('/* setCanonicalUrl */', () => fetchRssFeed(source.id, 0), {
        command: 'UPDATE',
      }),
    )

    expect(error).toMatchObject({ code: '25P02' })
    await expect(getUrlById(source.rss_feed_url_id)).resolves.toMatchObject({
      canonical_url_id: null,
    })
    const updated = await getRssFeedById(source.id)
    expect(updated?.rss_feed_url.url).toBe(targetUrl)
    expect(updated?.is_enabled).toBe(true)
    expect(sentryCaptureExceptionMock).toHaveBeenCalledWith(error, expect.anything())
    agent.assertNoPendingInterceptors()
  })

  it('disables the source after a failed feed canonical write without storing the relation', async () => {
    const source = await makeFeed()
    const target = await makeFeed()
    agent
      .get(new URL(source.feedUrl).origin)
      .intercept({ path: '/feed.xml', method: 'GET' })
      .reply(301, '', { headers: { location: target.feedUrl } })

    const { error } = await withMockAgentDefaultFetchForTest(agent, () =>
      withPostgresQueryFailureForTest(
        '/* setCanonicalRssFeed */',
        () => fetchRssFeed(source.id, 0),
        { command: 'UPDATE' },
      ),
    )

    expect(error).toMatchObject({ code: '25P02' })
    const updated = await getRssFeedById(source.id)
    expect(updated).toMatchObject({
      is_enabled: false,
      is_discoverable: false,
      canonical_rss_feed_id: null,
    })
    expect(sentryCaptureExceptionMock).toHaveBeenCalledWith(error, expect.anything())
    agent.assertNoPendingInterceptors()
  })

  it('rethrows a database failure while adding the redirect target', async () => {
    const source = await makeFeed()
    const targetUrl = `https://target-${randomUUID()}.example.com/feed.xml`
    ownedHostnames.add(new URL(targetUrl).hostname)
    agent
      .get(new URL(source.feedUrl).origin)
      .intercept({ path: '/feed.xml', method: 'GET' })
      .reply(301, '', { headers: { location: targetUrl } })

    const { result, error } = await withMockAgentDefaultFetchForTest(agent, () =>
      withPostgresPoolQueryFailureForTest(
        '/* addUrls */',
        () => fetchRssFeed(source.id, 0).catch((err: unknown) => err),
        { command: 'INSERT' },
      ),
    )

    expect(error).toMatchObject({ code: '25P02' })
    expect(result).toBe(error)
    const unchanged = await getRssFeedById(source.id)
    expect(unchanged?.rss_feed_url.url).toBe(source.feedUrl)
    expect(unchanged?.canonical_rss_feed_id).toBeNull()
    agent.assertNoPendingInterceptors()
  })
})

import { randomUUID } from 'node:crypto'
import dns from 'node:dns'
import type { Job } from 'glide-mq'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { RSS_FEEDS_FETCH_JOB } from '@queues/background/enqueues/rss-feeds-jobs'
import { background } from '@queues/background/queues'
import {
  FAILING_DISPATCH_LANE,
  getRssFeedById,
  getRssFeedByIdToFetch,
  getRssFeedsToFetch,
  updateRssFeedById,
} from '@services/rss-feeds'
import { rssFeedCrawlConfig } from '@services/rss-feeds/crawl-config'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import {
  deleteRssFeedsByIds,
  getTestRssFeedFetchTimestamps,
  insertTestRssFeedDirect,
  updateRssFeedFailedTiming,
} from '@voucha/test-helpers/entities/rss-feeds'
import {
  getTestHostnameRateLimitedUntil,
  setTestHostnameRateLimitedUntil,
} from '@voucha/test-helpers/entities/url-hostname-network-backoff'
import { MockAgent, withMockAgentDefaultFetchForTest } from '@voucha/test-helpers/provider-http'
import { readAllQueueJobs } from '@voucha/test-helpers'
import { uuidBefore } from '@voucha/test-helpers/uuid-before'
import { createTestUuidWindow } from '@voucha/test-helpers/uuid-window'
import { processRssFeedsDispatcher } from '../processors.mts'
import { rssFeedsHandlers } from '../workers.mts'

function mockHostDns(hostname: string) {
  const originalLookup = dns.promises.lookup
  const spy = vi.spyOn(dns.promises, 'lookup').mockImplementation(
    vi.fn<VitestLooseMock>(async (name: string, options?: { all?: boolean } | number) => {
      if (name !== hostname) return Reflect.apply(originalLookup, dns.promises, [name, options])
      const address = { address: '8.8.8.8', family: 4 } satisfies dns.LookupAddress
      return typeof options === 'object' && options.all ? [address] : address
    }),
  )
  onTestFinished(() => spy.mockRestore())
}

function findFetchHandler() {
  const handler = rssFeedsHandlers.find(entry => entry.job.name === RSS_FEEDS_FETCH_JOB.name)
  if (!handler) throw new Error('RSS fetch job handler must be registered')
  return handler
}

async function createOwnedFeed(prefix: string) {
  const { firstId } = createTestUuidWindow()
  const hostname = `${prefix}-${randomUUID()}.example.com`
  const feed = await insertTestRssFeedDirect({
    id: firstId,
    topicHostname: hostname,
    rssFeedUrl: `https://${hostname}/feed.xml`,
    homePageUrl: `https://${hostname}/`,
  })
  onTestFinished(() => deleteRssFeedsByIds([feed.id]))
  await updateRssFeedById(feed.id, { should_ignore_robots_txt: true })
  const fetchable = (await getRssFeedByIdToFetch(feed.id, { ttl: 0 }))!
  return { id: feed.id, hostname, hostnameId: fetchable.url_hostname_id }
}

describe('RSS fetch worker rate-limit and final-attempt outcomes', () => {
  it('ends a 429 job without retries, sets rate_limit_ends_at, and skips the hostname in dispatch until expiry', async () => {
    const { id, hostname, hostnameId } = await createOwnedFeed('rate-limit-429')
    mockHostDns(hostname)
    const agent = new MockAgent()
    agent.disableNetConnect()
    onTestFinished(() => agent.close())
    agent
      .get(`https://${hostname}`)
      .intercept({ path: '/feed.xml', method: 'GET' })
      .reply(429, 'Too Many Requests', { headers: { 'retry-after': '120' } })

    const fetchHandler = findFetchHandler()
    const fakeJob = {
      data: { rssFeedId: id, ttl: 0 },
      attemptsMade: 0,
      opts: { attempts: 3 },
    } as unknown as Job<never>

    const result = await withMockAgentDefaultFetchForTest(agent, async () =>
      fetchHandler.handle(fakeJob),
    )
    expect(result).toEqual({ rss_feed_id: id, item_count: 0 })
    agent.assertNoPendingInterceptors()

    const rateLimitedUntil = await getTestHostnameRateLimitedUntil(hostnameId)
    expect(rateLimitedUntil).toBeInstanceOf(Date)
    expect(rateLimitedUntil!.getTime()).toBeGreaterThan(Date.now() + 60_000)
    expect(await getTestRssFeedFetchTimestamps(id)).toEqual({
      last_fetch_succeeded_at: null,
      last_fetch_failed_at: null,
    })

    const cursor = {
      lane: 5,
      afterLastFetchedAt: null,
      afterId: uuidBefore(id),
      throughId: id,
    }
    expect((await getRssFeedsToFetch({ cursor })).feeds).toEqual([])

    // A second job while the Valkey lock is active also ends cleanly without hitting the network
    // and refreshes rate_limit_ends_at without stamping the feed.
    await setTestHostnameRateLimitedUntil(hostnameId, null)
    await expect(
      withMockAgentDefaultFetchForTest(agent, async () => fetchHandler.handle(fakeJob)),
    ).resolves.toEqual({ rss_feed_id: id, item_count: 0 })
    expect(await getTestHostnameRateLimitedUntil(hostnameId)).toBeInstanceOf(Date)
    expect(await getTestRssFeedFetchTimestamps(id)).toEqual({
      last_fetch_succeeded_at: null,
      last_fetch_failed_at: null,
    })

    await setTestHostnameRateLimitedUntil(hostnameId, new Date(Date.now() - 1000))
    expect((await getRssFeedsToFetch({ cursor })).feeds.map(f => f.id)).toEqual([id])
  })

  it('stamps last_fetch_failed_at only on the final job attempt and never moves API last_fetched_at', async () => {
    const { id, hostname } = await createOwnedFeed('final-attempt-500')
    mockHostDns(hostname)
    const agent = new MockAgent()
    agent.disableNetConnect()
    onTestFinished(() => agent.close())
    agent
      .get(`https://${hostname}`)
      .intercept({ path: '/feed.xml', method: 'GET' })
      .reply(500, 'Server Error')
      .times(3)

    const fetchHandler = findFetchHandler()
    for (const attemptsMade of [0, 1]) {
      const retryJob = {
        data: { rssFeedId: id, ttl: 0 },
        attemptsMade,
        opts: { attempts: 3 },
      } as unknown as Job<never>
      await expect(
        withMockAgentDefaultFetchForTest(agent, async () => fetchHandler.handle(retryJob)),
      ).rejects.toThrow('HTTP 500')
      expect(await getTestRssFeedFetchTimestamps(id)).toEqual({
        last_fetch_succeeded_at: null,
        last_fetch_failed_at: null,
      })
    }

    const finalJob = {
      data: { rssFeedId: id, ttl: 0 },
      attemptsMade: 2,
      opts: { attempts: 3 },
    } as unknown as Job<never>
    await expect(
      withMockAgentDefaultFetchForTest(agent, async () => fetchHandler.handle(finalJob)),
    ).rejects.toThrow('HTTP 500')
    agent.assertNoPendingInterceptors()

    const timestamps = await getTestRssFeedFetchTimestamps(id)
    expect(timestamps?.last_fetch_succeeded_at).toBeNull()
    expect(timestamps?.last_fetch_failed_at).toBeInstanceOf(Date)
    expect((await getRssFeedById(id)).last_fetched_at).toBeNull()
  })

  it('enqueues failing-lane feeds with retry_interval_ms as ttl', async () => {
    const retryIntervalMs = 45 * 60_000
    onTestFinished(
      overrideDynamicConfigFieldsForTest(rssFeedCrawlConfig, {
        retry_interval_ms: retryIntervalMs,
      }),
    )
    const { id } = await createOwnedFeed('failing-ttl')
    const asOf = new Date('2012-07-01T00:00:00.000Z')
    const failedAt = new Date(asOf.getTime() - 2 * retryIntervalMs)
    await updateRssFeedFailedTiming(id, failedAt)
    onTestFinished(async () => {
      const jobs = (await readAllQueueJobs(background)).filter(
        job =>
          job.name === RSS_FEEDS_FETCH_JOB.name &&
          (job.data as { rssFeedId: string }).rssFeedId === id,
      )
      await Promise.all(jobs.map(job => job.remove()))
    })

    const result = await processRssFeedsDispatcher({
      cursor: {
        lane: FAILING_DISPATCH_LANE,
        afterLastFetchedAt: new Date(failedAt.getTime() - 1000).toISOString(),
        afterId: uuidBefore(id),
        throughId: id,
      },
      asOf,
      limit: 5,
      rawBudget: 5,
    })
    expect(result.count).toBe(1)
    const jobs = (await readAllQueueJobs(background)).filter(
      job =>
        job.name === RSS_FEEDS_FETCH_JOB.name &&
        (job.data as { rssFeedId: string }).rssFeedId === id,
    )
    expect(jobs.map(job => job.data)).toEqual([{ rssFeedId: id, ttl: retryIntervalMs }])
  })
})

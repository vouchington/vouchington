import { randomUUID } from 'node:crypto'
import dns from 'node:dns'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { RSS_FEEDS_FETCH_JOB } from '@queues/background/enqueues/rss-feeds-jobs'
import { background } from '@queues/background/queues'
import {
  getRssFeedByIdToFetch,
  updateRssFeedById,
  type RssFeedDispatchCursor,
} from '@services/rss-feeds'
import { rssFeedCrawlConfig } from '@services/rss-feeds/crawl-config'
import {
  readAllQueueJobs,
  updateUrlHostnameCrawlable,
  insertTestRssFeedDirect,
} from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { deleteRssFeedsByIds, updateRssFeedTiming } from '@voucha/test-helpers/entities/rss-feeds'
import { MockAgent, withMockAgentDefaultFetchForTest } from '@voucha/test-helpers/provider-http'
import { uuidBefore } from '@voucha/test-helpers/uuid-before'
import { createTestUuidWindow } from '@voucha/test-helpers/uuid-window'
import { processFetchRssFeed, processRssFeedsDispatcher } from '../processors.mts'

const TIER_5_SLA_MS = 3_600_000

async function ownedFetchJobs(feedIds: readonly string[]) {
  return (await readAllQueueJobs(background)).filter(
    job =>
      job.name === RSS_FEEDS_FETCH_JOB.name &&
      feedIds.includes((job.data as { rssFeedId: string }).rssFeedId),
  )
}

async function dispatchOwnedPage(feedIds: string[], cursor: RssFeedDispatchCursor) {
  onTestFinished(async () => {
    await Promise.all((await ownedFetchJobs(feedIds)).map(job => job.remove()))
    await deleteRssFeedsByIds(feedIds)
  })
  const result = await processRssFeedsDispatcher({
    cursor,
    asOf: new Date(),
    limit: 5,
    rawBudget: 5,
  })
  return { result, jobs: await ownedFetchJobs(feedIds) }
}

describe('processRssFeedsDispatcher', () => {
  it('returns { count: 0 } and enqueues nothing when no owned feed is due', async () => {
    const { firstId, secondId } = createTestUuidWindow()
    const feed = await insertTestRssFeedDirect({ id: firstId })
    await updateRssFeedTiming(feed.id, new Date())

    const { result, jobs } = await dispatchOwnedPage([feed.id], {
      lane: 5,
      afterId: uuidBefore(firstId),
      throughId: secondId,
    })

    expect(result).toEqual({
      count: 0,
      rawRowsRead: 1,
      nextCursor: { lane: 6, afterId: '00000000-0000-0000-0000-000000000000', throughId: secondId },
    })
    expect(jobs).toEqual([])
  })

  it('enqueues due tier-5 feeds with TIER_PRIORITY[5] and the tier-5 SLA as ttl', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(rssFeedCrawlConfig, { tier5_sla_ms: TIER_5_SLA_MS }),
    )
    const { firstId, secondId, thirdId } = createTestUuidWindow()
    const feeds = await Promise.all([firstId, secondId].map(id => insertTestRssFeedDirect({ id })))
    const feedIds = feeds.map(feed => feed.id)

    const { result, jobs } = await dispatchOwnedPage(feedIds, {
      lane: 5,
      afterId: uuidBefore(firstId),
      throughId: thirdId,
    })

    expect(result).toMatchObject({ count: 2, rawRowsRead: 2 })
    expect(jobs.map(job => job.data)).toEqual([
      { rssFeedId: firstId, ttl: TIER_5_SLA_MS },
      { rssFeedId: secondId, ttl: TIER_5_SLA_MS },
    ])
    expect(jobs.map(job => job.opts.priority)).toEqual([20, 20])
  })

  it('omits ttl for backfill feeds so they are not blocked by the SLA dedup window', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(rssFeedCrawlConfig, {
        tier1_sla_ms: 5 * 60_000,
        tier5_sla_ms: TIER_5_SLA_MS,
      }),
    )
    const { firstId, secondId } = createTestUuidWindow()
    const feed = await insertTestRssFeedDirect({ id: firstId })
    await updateRssFeedTiming(feed.id, new Date(Date.now() - 10 * 60_000))

    const { result, jobs } = await dispatchOwnedPage([feed.id], {
      lane: 10,
      afterId: uuidBefore(firstId),
      throughId: secondId,
    })

    expect(result).toMatchObject({ count: 1, rawRowsRead: 1 })
    expect(jobs.map(job => job.data)).toEqual([{ rssFeedId: firstId, ttl: undefined }])
    expect(jobs.map(job => job.opts.priority)).toEqual([20])
  })
})

describe('processFetchRssFeed', () => {
  it('returns small fetch metadata and forwards the ttl to the fetch', async () => {
    const { firstId } = createTestUuidWindow()
    const feed = await insertTestRssFeedDirect({ id: firstId })
    onTestFinished(() => deleteRssFeedsByIds([feed.id]))
    const lastFetchedAt = new Date(Date.now() - 60 * 60_000)
    await updateRssFeedTiming(feed.id, lastFetchedAt)
    const fetchable = await getRssFeedByIdToFetch(feed.id, { ttl: 0 })
    await updateUrlHostnameCrawlable(fetchable!.url_hostname_id, false)

    // A two-hour ttl treats the hour-old fetch as fresh, so nothing is fetched or stamped.
    await expect(processFetchRssFeed(feed.id, 2 * 60 * 60_000)).resolves.toEqual({
      rss_feed_id: feed.id,
      item_count: 0,
    })
    expect((await getRssFeedByIdToFetch(feed.id, { ttl: 0 }))!.last_fetched_at).toEqual(
      lastFetchedAt,
    )

    // A one-minute ttl makes the feed due; the uncrawlable hostname stamps it without fetching.
    await expect(processFetchRssFeed(feed.id, 60_000)).resolves.toEqual({
      rss_feed_id: feed.id,
      item_count: 0,
    })
    expect(
      (await getRssFeedByIdToFetch(feed.id, { ttl: 0 }))!.last_fetched_at!.getTime(),
    ).toBeGreaterThan(lastFetchedAt.getTime())
  })
  it('reports the number of items a real fetch returns', async () => {
    const hostname = `fetch-count-${randomUUID()}.example.com`
    const feedUrl = `https://${hostname}/feed.xml`
    const feed = await insertTestRssFeedDirect({
      topicHostname: hostname,
      rssFeedUrl: feedUrl,
      homePageUrl: `https://${hostname}/`,
    })
    onTestFinished(() => deleteRssFeedsByIds([feed.id]))
    await updateRssFeedById(feed.id, { should_ignore_robots_txt: true })
    const agent = new MockAgent()
    agent.disableNetConnect()
    onTestFinished(() => agent.close())
    const originalLookup = dns.promises.lookup
    const lookupSpy = vi.spyOn(dns.promises, 'lookup').mockImplementation(
      vi.fn<VitestLooseMock>(async (name: string, options?: { all?: boolean } | number) => {
        if (name !== hostname) return Reflect.apply(originalLookup, dns.promises, [name, options])
        const address = { address: '8.8.8.8', family: 4 } satisfies dns.LookupAddress
        return typeof options === 'object' && options.all ? [address] : address
      }),
    )
    onTestFinished(() => lookupSpy.mockRestore())
    const items = [1, 2]
      .map(
        n =>
          `<item><title>Item ${n}</title><link>https://${hostname}/item-${n}</link><guid>${hostname}-${n}</guid></item>`,
      )
      .join('')
    agent
      .get(`https://${hostname}`)
      .intercept({ path: '/feed.xml', method: 'GET' })
      .reply(200, `<rss version="2.0"><channel><title>Count feed</title>${items}</channel></rss>`, {
        headers: { 'content-type': 'application/rss+xml' },
      })

    await expect(
      withMockAgentDefaultFetchForTest(agent, () => processFetchRssFeed(feed.id, 0)),
    ).resolves.toEqual({ rss_feed_id: feed.id, item_count: 2 })
    agent.assertNoPendingInterceptors()
  })
})

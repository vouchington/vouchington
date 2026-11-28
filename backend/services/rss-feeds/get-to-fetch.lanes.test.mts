import { describe, expect, it, onTestFinished } from 'vitest'
import {
  deleteRssFeedsByIds,
  insertTestRssFeedDirect,
  setRssFeedOwningTopicVoteScore,
  updateRssFeedFailedTiming,
  updateRssFeedTiming,
} from '@voucha/test-helpers/entities/rss-feeds'
import { getRssFeedCrawlTierAssignments } from '@voucha/test-helpers/data-stores/psql/rss-feed-crawl-tiers'
import { setTestHostnameRateLimitedUntil } from '@voucha/test-helpers/entities/url-hostname-network-backoff'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { refreshMaterializedViewForTest } from '@voucha/test-helpers/refresh-materialized-view-for-test'
import { uuidAfter, uuidBefore } from '@voucha/test-helpers/uuid-before'
import { createTestUuidWindow } from '@voucha/test-helpers/uuid-window'
import { rssFeedCrawlConfig } from './crawl-config.mts'
import {
  FAILING_DISPATCH_LANE,
  getRssFeedByIdToFetch,
  getRssFeedsToFetch,
  type RssFeedDispatchCursor,
} from './get-to-fetch.mts'

const AS_OF = new Date('2012-06-01T00:00:00.000Z')
const TIER_FIVE_SLA_MS = 24 * 60 * 60_000
const RETRY_INTERVAL_MS = 60 * 60_000

async function makeOwnedFeedChain(count: number): Promise<string[]> {
  const { firstId } = createTestUuidWindow()
  const ids = [firstId]
  for (let i = 1; i < count; i++) ids.push(uuidAfter(ids[i - 1]!))
  await Promise.all(ids.map(id => insertTestRssFeedDirect({ id })))
  onTestFinished(() => deleteRssFeedsByIds(ids))
  return ids
}

describe('RSS dispatcher healthy and failing lanes', () => {
  it('dispatches healthy due feeds even when more failing feeds than budget are older', async () => {
    const ids = await makeOwnedFeedChain(7)
    const failingIds = ids.slice(0, 5)
    const healthyIds = ids.slice(5, 7)

    // Five due failing feeds all older than the two healthy due feeds.
    const oldFailBase = AS_OF.getTime() - 10 * 24 * 60 * 60_000
    const healthyBase = AS_OF.getTime() - TIER_FIVE_SLA_MS - 120_000
    await Promise.all([
      ...failingIds.map((id, i) => updateRssFeedFailedTiming(id, new Date(oldFailBase + i * 1000))),
      ...healthyIds.map((id, i) => updateRssFeedTiming(id, new Date(healthyBase + i * 1000))),
    ])

    const budget = 3
    const restore = overrideDynamicConfigFieldsForTest(rssFeedCrawlConfig, {
      capacity_budget: budget,
      tier5_sla_ms: TIER_FIVE_SLA_MS,
      retry_interval_ms: RETRY_INTERVAL_MS,
    })
    try {
      const dispatched: Array<{ id: string; lane: number }> = []
      let remaining = budget
      let cursor: RssFeedDispatchCursor | undefined = {
        lane: 5,
        afterLastFetchedAt: new Date(healthyBase - 10_000).toISOString(),
        afterId: uuidBefore(ids[0]!),
        throughId: ids.at(-1)!,
      }
      while (remaining > 0 && cursor && cursor.lane <= FAILING_DISPATCH_LANE) {
        const page = await getRssFeedsToFetch({
          limit: remaining,
          rawBudget: remaining + 1,
          asOf: AS_OF,
          cursor,
        })
        for (const feed of page.feeds) {
          dispatched.push({ id: feed.id, lane: feed.dispatch_lane })
        }
        remaining -= page.feeds.length
        cursor =
          page.nextCursor?.lane === FAILING_DISPATCH_LANE && cursor.lane === 5
            ? {
                lane: FAILING_DISPATCH_LANE,
                afterLastFetchedAt: new Date(oldFailBase - 10_000).toISOString(),
                afterId: uuidBefore(ids[0]!),
                throughId: ids.at(-1)!,
              }
            : page.nextCursor
      }

      expect(dispatched).toEqual([
        { id: healthyIds[0], lane: 5 },
        { id: healthyIds[1], lane: 5 },
        { id: failingIds[0], lane: FAILING_DISPATCH_LANE },
      ])
    } finally {
      restore()
    }
  })

  it('changes which healthy and failing feeds are due when dynamic config changes without DB writes', async () => {
    const [healthyMidId, healthyOldId, failingRecentId, failingOldId] = await makeOwnedFeedChain(4)
    const base = AS_OF.getTime()
    await Promise.all([
      updateRssFeedTiming(healthyMidId!, new Date(base - 30 * 60_000)),
      updateRssFeedTiming(healthyOldId!, new Date(base - 90 * 60_000)),
      updateRssFeedFailedTiming(failingRecentId!, new Date(base - 20 * 60_000)),
      updateRssFeedFailedTiming(failingOldId!, new Date(base - 80 * 60_000)),
    ])

    const healthyCursor: RssFeedDispatchCursor = {
      lane: 5,
      afterLastFetchedAt: new Date(base - 120 * 60_000).toISOString(),
      afterId: uuidBefore(healthyMidId!),
      throughId: failingOldId!,
    }
    const failingCursor: RssFeedDispatchCursor = {
      lane: FAILING_DISPATCH_LANE,
      afterLastFetchedAt: new Date(base - 120 * 60_000).toISOString(),
      afterId: uuidBefore(healthyMidId!),
      throughId: failingOldId!,
    }

    const restoreWide = overrideDynamicConfigFieldsForTest(rssFeedCrawlConfig, {
      capacity_budget: 10,
      tier5_sla_ms: 60 * 60_000,
      retry_interval_ms: 60 * 60_000,
    })
    try {
      const healthyWide = await getRssFeedsToFetch({ asOf: AS_OF, cursor: healthyCursor })
      const failingWide = await getRssFeedsToFetch({ asOf: AS_OF, cursor: failingCursor })
      expect(healthyWide.feeds.map(f => f.id)).toEqual([healthyOldId])
      expect(healthyWide.rawRowsRead).toBe(1)
      expect(failingWide.feeds.map(f => f.id)).toEqual([failingOldId])
      expect(failingWide.rawRowsRead).toBe(1)
    } finally {
      restoreWide()
    }

    // Tighten intervals in dynamic config only — zero DB writes — and both newer feeds become due.
    const restoreTight = overrideDynamicConfigFieldsForTest(rssFeedCrawlConfig, {
      capacity_budget: 10,
      tier5_sla_ms: 15 * 60_000,
      retry_interval_ms: 10 * 60_000,
    })
    try {
      const healthyTight = await getRssFeedsToFetch({ asOf: AS_OF, cursor: healthyCursor })
      const failingTight = await getRssFeedsToFetch({ asOf: AS_OF, cursor: failingCursor })
      expect(healthyTight.feeds.map(f => f.id)).toEqual([healthyOldId, healthyMidId])
      expect(healthyTight.rawRowsRead).toBe(2)
      expect(failingTight.feeds.map(f => f.id)).toEqual([failingOldId, failingRecentId])
      expect(failingTight.rawRowsRead).toBe(2)
    } finally {
      restoreTight()
    }
  })

  it('skips rate-limited hostnames in healthy and failing lanes until rate_limited_until passes', async () => {
    const [healthyId, failingId] = await makeOwnedFeedChain(2)
    const dueTime = new Date(AS_OF.getTime() - 2 * TIER_FIVE_SLA_MS)
    await Promise.all([
      updateRssFeedTiming(healthyId!, dueTime),
      updateRssFeedFailedTiming(failingId!, dueTime),
    ])
    const healthyRow = await getRssFeedByIdToFetch(healthyId!, { ttl: 0 })
    const failingRow = await getRssFeedByIdToFetch(failingId!, { ttl: 0 })

    await Promise.all([
      setTestHostnameRateLimitedUntil(healthyRow!.url_hostname_id, new Date(Date.now() + 60_000)),
      setTestHostnameRateLimitedUntil(failingRow!.url_hostname_id, new Date(Date.now() + 60_000)),
    ])
    const restore = overrideDynamicConfigFieldsForTest(rssFeedCrawlConfig, {
      capacity_budget: 10,
      tier5_sla_ms: TIER_FIVE_SLA_MS,
      retry_interval_ms: RETRY_INTERVAL_MS,
    })
    try {
      const healthyCursor: RssFeedDispatchCursor = {
        lane: 5,
        afterLastFetchedAt: new Date(dueTime.getTime() - 1000).toISOString(),
        afterId: uuidBefore(healthyId!),
        throughId: failingId!,
      }
      const failingCursor: RssFeedDispatchCursor = {
        lane: FAILING_DISPATCH_LANE,
        afterLastFetchedAt: new Date(dueTime.getTime() - 1000).toISOString(),
        afterId: uuidBefore(healthyId!),
        throughId: failingId!,
      }
      expect((await getRssFeedsToFetch({ asOf: AS_OF, cursor: healthyCursor })).feeds).toEqual([])
      expect((await getRssFeedsToFetch({ asOf: AS_OF, cursor: failingCursor })).feeds).toEqual([])

      await Promise.all([
        setTestHostnameRateLimitedUntil(healthyRow!.url_hostname_id, new Date(Date.now() - 1000)),
        setTestHostnameRateLimitedUntil(failingRow!.url_hostname_id, new Date(Date.now() - 1000)),
      ])
      expect(
        (await getRssFeedsToFetch({ asOf: AS_OF, cursor: healthyCursor })).feeds.map(f => f.id),
      ).toEqual([healthyId])
      expect(
        (await getRssFeedsToFetch({ asOf: AS_OF, cursor: failingCursor })).feeds.map(f => f.id),
      ).toEqual([failingId])
    } finally {
      restore()
    }
  })

  // no-mistakes-timeout-reason: refreshes mv_rss_feed_crawl_tiers to verify a hot tier (<5) failing feed moves out of its healthy lane into lane 6
  it(
    'moves a failing hot-tier feed out of its healthy tier lane and retries it in lane 6',
    { timeout: 15_000 },
    async () => {
      // At least five enabled feeds are required so the top feed lands at CUME_DIST <= 0.20 (tier < 5) even in a fresh database.
      const [hotId] = await makeOwnedFeedChain(5)
      await setRssFeedOwningTopicVoteScore(hotId!, 1_000_000_000, 0)
      await refreshMaterializedViewForTest('mv_rss_feed_crawl_tiers')
      onTestFinished(() => refreshMaterializedViewForTest('mv_rss_feed_crawl_tiers'))
      const hotTier = (await getRssFeedCrawlTierAssignments([hotId!])).get(hotId!)
      expect(hotTier).toBeLessThan(5)

      const failedAt = new Date(AS_OF.getTime() - 2 * RETRY_INTERVAL_MS)
      await updateRssFeedFailedTiming(hotId!, failedAt)

      const restore = overrideDynamicConfigFieldsForTest(rssFeedCrawlConfig, {
        capacity_budget: 10,
        retry_interval_ms: RETRY_INTERVAL_MS,
      })
      try {
        const hotHealthyPage = await getRssFeedsToFetch({
          asOf: AS_OF,
          cursor: { lane: hotTier!, afterId: uuidBefore(hotId!), throughId: hotId! },
        })
        expect(hotHealthyPage.feeds.map(f => f.id)).not.toContain(hotId)

        const failingPage = await getRssFeedsToFetch({
          asOf: AS_OF,
          cursor: {
            lane: FAILING_DISPATCH_LANE,
            afterLastFetchedAt: new Date(failedAt.getTime() - 1000).toISOString(),
            afterId: uuidBefore(hotId!),
            throughId: hotId!,
          },
        })
        expect(failingPage.feeds).toEqual([
          expect.objectContaining({
            id: hotId,
            crawl_tier: hotTier,
            dispatch_lane: FAILING_DISPATCH_LANE,
          }),
        ])
      } finally {
        restore()
      }
    },
  )
})

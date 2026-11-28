import { describe, expect, it, onTestFinished } from 'vitest'
import {
  deleteRssFeedsByIds,
  insertTestRssFeedDirect,
} from '@voucha/test-helpers/entities/rss-feeds'
import { updateRssFeedTiming } from '@voucha/test-helpers/entities/rss-feeds-state'
import { getRssFeedCrawlTiers } from '@voucha/test-helpers/data-stores/psql/rss-feed-crawl-tiers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { uuidAfter, uuidBefore } from '@voucha/test-helpers/uuid-before'
import { createTestUuidWindow } from '@voucha/test-helpers/uuid-window'
import { rssFeedCrawlConfig } from './crawl-config.mts'
import { persistRssFeedCrawlAndMetadata } from './crawls.mts'
import { getRssFeedsToFetch, type RssFeedDispatchCursor } from './get-to-fetch.mts'
import { updateRssFeedById } from './update.mts'

const AS_OF = new Date('2012-03-01T00:00:00.000Z')
const TIER_FIVE_SLA_MS = 24 * 60 * 60 * 1000

describe('tiered RSS feed selection', () => {
  it('caps an owned fallback page and projects feed-specific fetch settings', async () => {
    const feeds = await Promise.all([insertTestRssFeedDirect({}), insertTestRssFeedDirect({})])
    onTestFinished(() => deleteRssFeedsByIds(feeds.map(row => row.id)))
    feeds.sort((left, right) => left.id.localeCompare(right.id))
    const feed = feeds[0]!
    await expect(getRssFeedCrawlTiers(feeds.map(row => row.id))).resolves.toEqual([])
    await updateRssFeedById(feed.id, {
      declared_language: 'fr',
      should_ignore_robots_txt: false,
      unreliable_status_codes: [404, 410],
    })

    const restore = overrideDynamicConfigFieldsForTest(rssFeedCrawlConfig, { capacity_budget: 1 })
    try {
      const selected = (
        await getRssFeedsToFetch({
          limit: 2,
          asOf: AS_OF,
          cursor: { lane: 5, afterId: uuidBefore(feed.id) },
        })
      ).feeds
      expect(selected).toEqual([
        expect.objectContaining({
          id: feed.id,
          declared_language: 'fr',
          feed_ignore_robots_txt: false,
          feed_unreliable_status_codes: [404, 410],
          crawl_tier: 5,
          crawl_score: 0,
          priority_group: 1,
          dispatch_lane: 5,
        }),
      ])
    } finally {
      restore()
    }
  })

  it('seeks due tier-5 feeds oldest-fetched first without reading fresh feeds', async () => {
    const fresh = await insertTestRssFeedDirect({})
    const newerDue = await insertTestRssFeedDirect({ id: uuidAfter(fresh.id) })
    const olderDue = await insertTestRssFeedDirect({ id: uuidAfter(newerDue.id) })
    const neverFetched = await insertTestRssFeedDirect({ id: uuidAfter(olderDue.id) })
    onTestFinished(() => deleteRssFeedsByIds([fresh.id, newerDue.id, olderDue.id, neverFetched.id]))

    const olderTime = new Date(AS_OF.getTime() - TIER_FIVE_SLA_MS - 120_000)
    const newerTime = new Date(AS_OF.getTime() - TIER_FIVE_SLA_MS - 60_000)
    await Promise.all([
      updateRssFeedTiming(fresh.id, new Date(AS_OF.getTime() - 1)),
      updateRssFeedTiming(newerDue.id, newerTime),
      updateRssFeedTiming(olderDue.id, olderTime),
    ])
    const restore = overrideDynamicConfigFieldsForTest(rssFeedCrawlConfig, { capacity_budget: 10 })
    try {
      const page = await getRssFeedsToFetch({
        limit: 10,
        rawBudget: 10,
        asOf: AS_OF,
        cursor: {
          lane: 5,
          afterLastFetchedAt: null,
          afterId: uuidBefore(fresh.id),
          throughId: neverFetched.id,
        },
      })
      expect(page.feeds.map(feed => feed.id)).toEqual([neverFetched.id, olderDue.id, newerDue.id])
      expect(page.rawRowsRead).toBe(3)
      expect(page.nextCursor).toEqual({
        lane: 6,
        afterId: '00000000-0000-0000-0000-000000000000',
        throughId: neverFetched.id,
      })
    } finally {
      restore()
    }
  })

  it('neither skips nor double-dispatches when feeds are fetched mid-run', async () => {
    const { firstId, secondId, thirdId } = createTestUuidWindow()
    const fourthId = uuidAfter(thirdId)
    const ids = [firstId, secondId, thirdId, fourthId]
    await Promise.all(ids.map(id => insertTestRssFeedDirect({ id })))
    onTestFinished(() => deleteRssFeedsByIds(ids))

    const base = AS_OF.getTime() - TIER_FIVE_SLA_MS - 600_000
    await Promise.all([
      updateRssFeedTiming(firstId, new Date(base + 1000)),
      updateRssFeedTiming(secondId, new Date(base + 2000)),
      updateRssFeedTiming(thirdId, new Date(base + 3000)),
      updateRssFeedTiming(fourthId, new Date(base + 4000)),
    ])

    const restore = overrideDynamicConfigFieldsForTest(rssFeedCrawlConfig, { capacity_budget: 10 })
    try {
      const dispatched: string[] = []
      let cursor: RssFeedDispatchCursor | undefined = {
        lane: 5,
        afterLastFetchedAt: new Date(base).toISOString(),
        afterId: uuidBefore(firstId),
        throughId: fourthId,
      }

      // Page 1 dispatches firstId, then firstId is fetched before page 2 runs.
      const page1 = await getRssFeedsToFetch({ limit: 1, rawBudget: 2, asOf: AS_OF, cursor })
      dispatched.push(...page1.feeds.map(f => f.id))
      expect(page1.feeds.map(f => f.id)).toEqual([firstId])
      await persistRssFeedCrawlAndMetadata({
        rssFeedId: firstId,
        responseCode: 304,
        headers: { etag: null, lastModified: null },
      })

      // Page 2 still dispatches secondId (not skipped) and does not re-dispatch firstId.
      // Then thirdId is fetched before page 3 runs, moving it out of the due filter.
      cursor = page1.nextCursor
      const page2 = await getRssFeedsToFetch({ limit: 1, rawBudget: 2, asOf: AS_OF, cursor })
      dispatched.push(...page2.feeds.map(f => f.id))
      expect(page2.feeds.map(f => f.id)).toEqual([secondId])
      await persistRssFeedCrawlAndMetadata({
        rssFeedId: thirdId,
        responseCode: 304,
        headers: { etag: null, lastModified: null },
      })

      // Remaining pages dispatch fourthId (not skipped), skip the freshly-fetched thirdId,
      // and never emit any feed twice.
      cursor = page2.nextCursor
      while (cursor && cursor.lane === 5) {
        const next = await getRssFeedsToFetch({ limit: 1, rawBudget: 2, asOf: AS_OF, cursor })
        dispatched.push(...next.feeds.map(f => f.id))
        cursor = next.nextCursor
      }
      expect(dispatched).toEqual([firstId, secondId, fourthId])
      expect(new Set(dispatched).size).toBe(dispatched.length)
    } finally {
      restore()
    }
  })

  it.each([
    [-1, 1],
    [0, 1],
    [1, 2],
  ] as const)(
    'selects an owned fallback feed at SLA offset %i ms only in priority group %i',
    async (offsetMs, priorityGroup) => {
      const feed = await insertTestRssFeedDirect({})
      onTestFinished(() => deleteRssFeedsByIds([feed.id]))
      await expect(getRssFeedCrawlTiers([feed.id])).resolves.toEqual([])
      const fetchedAt = new Date(AS_OF.getTime() - TIER_FIVE_SLA_MS + offsetMs)
      await updateRssFeedTiming(feed.id, fetchedAt)
      const expectedLane = priorityGroup === 1 ? 5 : 10
      const otherLane = priorityGroup === 1 ? 10 : 5
      const restore = overrideDynamicConfigFieldsForTest(rssFeedCrawlConfig, {
        capacity_budget: 1,
        tier1_sla_ms: 5 * 60 * 1000,
        tier5_sla_ms: TIER_FIVE_SLA_MS,
      })
      try {
        const selected = (
          await getRssFeedsToFetch({
            asOf: AS_OF,
            cursor: {
              lane: expectedLane,
              afterLastFetchedAt: fetchedAt.toISOString(),
              afterId: uuidBefore(feed.id),
              throughId: feed.id,
            },
          })
        ).feeds
        expect(selected).toEqual([
          expect.objectContaining({
            id: feed.id,
            crawl_tier: 5,
            crawl_score: 0,
            priority_group: priorityGroup,
            dispatch_lane: expectedLane,
          }),
        ])
        const other = (
          await getRssFeedsToFetch({
            asOf: AS_OF,
            cursor: {
              lane: otherLane,
              afterLastFetchedAt: fetchedAt.toISOString(),
              afterId: uuidBefore(feed.id),
              throughId: feed.id,
            },
          })
        ).feeds
        expect(other.map(row => row.id)).not.toContain(feed.id)
      } finally {
        restore()
      }
    },
  )
})

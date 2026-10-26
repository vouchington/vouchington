import { describe, expect, it } from 'vitest'
import { insertTestRssFeedDirect } from '@voucha/test-helpers/entities/rss-feeds'
import { updateRssFeedTiming } from '@voucha/test-helpers/entities/rss-feeds-state'
import { getRssFeedCrawlTiers } from '@voucha/test-helpers/data-stores/psql/rss-feed-crawl-tiers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { uuidBefore } from '@voucha/test-helpers/uuid-before'
import { rssFeedCrawlConfig } from './crawl-config.mts'
import { getRssFeedsToFetch } from './get-to-fetch.mts'
import { updateRssFeedById } from './update.mts'

const AS_OF = new Date('2024-03-01T00:00:00.000Z')
const TIER_FIVE_SLA_MS = 24 * 60 * 60 * 1000

describe('tiered RSS feed selection', () => {
  it('caps an owned fallback page and projects feed-specific fetch settings', async () => {
    const feeds = await Promise.all([insertTestRssFeedDirect({}), insertTestRssFeedDirect({})])
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
      const selected = await getRssFeedsToFetch({
        limit: 2,
        asOf: AS_OF,
        cursor: { lane: 5, afterId: uuidBefore(feed.id) },
      })
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

  it.each([
    [-1, 1],
    [0, 1],
    [1, 2],
  ] as const)(
    'selects an owned fallback feed at SLA offset %i ms in priority group %i',
    async (offsetMs, priorityGroup) => {
      const feed = await insertTestRssFeedDirect({})
      await expect(getRssFeedCrawlTiers([feed.id])).resolves.toEqual([])
      await updateRssFeedTiming(feed.id, new Date(AS_OF.getTime() - TIER_FIVE_SLA_MS + offsetMs))
      const lane = priorityGroup === 1 ? 5 : 10
      const restore = overrideDynamicConfigFieldsForTest(rssFeedCrawlConfig, {
        capacity_budget: 1,
        tier1_sla_ms: 5 * 60 * 1000,
        tier5_sla_ms: TIER_FIVE_SLA_MS,
      })
      try {
        const selected = await getRssFeedsToFetch({
          asOf: AS_OF,
          cursor: { lane, afterId: uuidBefore(feed.id) },
        })
        expect(selected).toEqual([
          expect.objectContaining({
            id: feed.id,
            crawl_tier: 5,
            crawl_score: 0,
            priority_group: priorityGroup,
            dispatch_lane: lane,
          }),
        ])
      } finally {
        restore()
      }
    },
  )
})

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getRssFeedByIdToFetch, getRssFeedsToFetch } from './get-to-fetch.mts'
import {
  overrideDynamicConfigFieldsForTest,
  countEnabledRssFeedsForTest,
  updateUrlHostnameUnreliableStatusCodes,
  updateRssFeedTiming,
} from '@voucha/test-helpers'
import { createTestRssFeed } from '@services/rss-feeds/test-fixtures'
import { getRssFeedById } from './get.mts'
import { updateRssFeedById } from './update.mts'
import { RSS_FEED_CRAWL_MAX_VALUES, rssFeedCrawlConfig } from './crawl-config.mts'
import { refreshMaterializedViewForTest } from '@voucha/test-helpers/refresh-materialized-view'

const CRAWL_TIERS_VIEW = 'mv_rss_feed_crawl_tiers'

describe('get-to-fetch', () => {
  const TTL_MS = 60_000 // 1 minute
  // Use a high limit to ensure test feeds are always included regardless of DB accumulation
  const LIMIT = 10_000

  let neverFetchedId: string
  let staleFetchedId: string
  let recentFetchedId: string
  let disabledId: string
  let undiscoverableId: string

  beforeAll(async () => {
    await rssFeedCrawlConfig.waitForInitialization()
    // Force flat-TTL mode for the existing tests so they don't depend on MV state
    overrideDynamicConfigFieldsForTest(rssFeedCrawlConfig, { enabled: false })

    const [neverFetched, staleFetched, recentFetched, disabled, undiscoverable] = await Promise.all(
      [
        createTestRssFeed({}),
        createTestRssFeed({}),
        createTestRssFeed({}),
        createTestRssFeed({}),
        createTestRssFeed({}),
      ],
    )

    neverFetchedId = neverFetched.id
    staleFetchedId = staleFetched.id
    recentFetchedId = recentFetched.id
    disabledId = disabled.id
    undiscoverableId = undiscoverable.id

    await Promise.all([
      updateRssFeedTiming(staleFetchedId, new Date(Date.now() - 2 * TTL_MS)),
      updateRssFeedTiming(recentFetchedId, new Date(Date.now() - TTL_MS / 2)),
      updateRssFeedById(disabledId, { enabled: false }),
      updateRssFeedById(undiscoverableId, { enabled: true, discoverable: false }),
    ])
  })

  afterAll(async () => {
    overrideDynamicConfigFieldsForTest(rssFeedCrawlConfig, { enabled: true })
    await rssFeedCrawlConfig.close()
  })

  it('getRssFeedsToFetch includes feeds that have never been fetched', async () => {
    const feeds = await getRssFeedsToFetch({ ttl: TTL_MS, limit: LIMIT })
    expect(feeds.map(f => f.id)).toContain(neverFetchedId)
  })

  it('getRssFeedsToFetch includes feeds last fetched beyond the TTL', async () => {
    const feeds = await getRssFeedsToFetch({ ttl: TTL_MS, limit: LIMIT })
    expect(feeds.map(f => f.id)).toContain(staleFetchedId)
  })

  it('getRssFeedsToFetch excludes feeds last fetched within the TTL', async () => {
    const feeds = await getRssFeedsToFetch({ ttl: TTL_MS, limit: LIMIT })
    expect(feeds.map(f => f.id)).not.toContain(recentFetchedId)
  })

  it('getRssFeedsToFetch excludes disabled feeds', async () => {
    const feeds = await getRssFeedsToFetch({ ttl: TTL_MS, limit: LIMIT })
    expect(feeds.map(f => f.id)).not.toContain(disabledId)
  })

  it('getRssFeedsToFetch includes enabled feeds that are not discoverable', async () => {
    const feeds = await getRssFeedsToFetch({ ttl: TTL_MS, limit: LIMIT })
    expect(feeds.map(f => f.id)).toContain(undiscoverableId)
  })

  it('getRssFeedsToFetch with ttl=0 skips the time filter and respects limit', async () => {
    // ttl=0 disables the last_fetched_at filter; all enabled non-deleted feeds qualify
    const feeds = await getRssFeedsToFetch({ ttl: 0, limit: 1 })
    expect(feeds).toHaveLength(1)
  })

  it('getRssFeedsToFetch respects the limit', async () => {
    const feeds = await getRssFeedsToFetch({ ttl: TTL_MS, limit: 2 })
    expect(feeds.length).toBeLessThanOrEqual(2)
  })

  it('getRssFeedByIdToFetch returns feed when not recently fetched', async () => {
    const feed = await getRssFeedByIdToFetch(neverFetchedId, { ttl: TTL_MS })
    expect(feed).not.toBeNull()
    expect(feed?.id).toBe(neverFetchedId)
    expect(feed).toHaveProperty('url')
    expect(feed).toHaveProperty('feed_type')
  })

  it('getRssFeedByIdToFetch returns null when recently fetched', async () => {
    const feed = await getRssFeedByIdToFetch(recentFetchedId, { ttl: TTL_MS })
    expect(feed).toBeNull()
  })

  it('getRssFeedByIdToFetch returns null for non-existent feed', async () => {
    const feed = await getRssFeedByIdToFetch('00000000-0000-0000-0000-000000000001', {
      ttl: TTL_MS,
    })
    expect(feed).toBeNull()
  })

  it('getRssFeedByIdToFetch returns null for disabled feed', async () => {
    const feed = await getRssFeedByIdToFetch(disabledId, { ttl: TTL_MS })
    expect(feed).toBeNull()
  })

  it('getRssFeedsToFetch result includes crawl_score and crawl_tier fields', async () => {
    const feeds = await getRssFeedsToFetch({ ttl: TTL_MS, limit: LIMIT })
    const feed = feeds.find(f => f.id === neverFetchedId)
    expect(feed).toBeDefined()
    expect(typeof feed?.crawl_score).toBe('number')
    expect(typeof feed?.crawl_tier).toBe('number')
  })

  it('getRssFeedByIdToFetch returns feed_ignore_robots_txt=null by default', async () => {
    const feed = await getRssFeedByIdToFetch(neverFetchedId, { ttl: TTL_MS })
    expect(feed).not.toBeNull()
    expect(feed?.feed_ignore_robots_txt).toBeNull()
    expect(feed?.hostname_ignore_robots_txt).toBeNull()
    expect(feed?.feed_unreliable_status_codes).toBeNull()
    expect(feed?.hostname_unreliable_status_codes).toBeNull()
  })

  it('getRssFeedByIdToFetch returns feed_ignore_robots_txt when set on feed', async () => {
    await updateRssFeedById(neverFetchedId, { ignore_robots_txt: true })
    try {
      const feed = await getRssFeedByIdToFetch(neverFetchedId, { ttl: TTL_MS })
      expect(feed).not.toBeNull()
      expect(feed?.feed_ignore_robots_txt).toBe(true)
    } finally {
      await updateRssFeedById(neverFetchedId, { ignore_robots_txt: null })
    }
  })

  it('getRssFeedByIdToFetch returns feed_unreliable_status_codes when set on feed', async () => {
    await updateRssFeedById(neverFetchedId, { unreliable_status_codes: [404] })
    try {
      const feed = await getRssFeedByIdToFetch(neverFetchedId, { ttl: TTL_MS })
      expect(feed).not.toBeNull()
      expect(feed?.feed_unreliable_status_codes).toEqual([404])
    } finally {
      await updateRssFeedById(neverFetchedId, { unreliable_status_codes: null })
    }
  })

  it('getRssFeedByIdToFetch returns hostname_unreliable_status_codes when set on hostname', async () => {
    const feed = await getRssFeedById(neverFetchedId)
    const hostnameId = feed!.rss_feed_url.hostname.id as string
    await updateUrlHostnameUnreliableStatusCodes(hostnameId, [404])
    try {
      const feedToFetch = await getRssFeedByIdToFetch(neverFetchedId, { ttl: TTL_MS })
      expect(feedToFetch).not.toBeNull()
      expect(feedToFetch?.hostname_unreliable_status_codes).toEqual([404])
    } finally {
      await updateUrlHostnameUnreliableStatusCodes(hostnameId, null)
    }
  })

  describe('tiered mode', () => {
    beforeAll(async () => {
      // Refresh MV so test feeds are included in the tiered query.
      overrideDynamicConfigFieldsForTest(rssFeedCrawlConfig, { enabled: true })
      overrideDynamicConfigFieldsForTest(rssFeedCrawlConfig, {
        capacity_budget: RSS_FEED_CRAWL_MAX_VALUES.capacity_budget,
      })
      await refreshMaterializedViewForTest(CRAWL_TIERS_VIEW)
    })

    afterAll(async () => {
      overrideDynamicConfigFieldsForTest(rssFeedCrawlConfig, { capacity_budget: 100 })
      overrideDynamicConfigFieldsForTest(rssFeedCrawlConfig, { enabled: false })
    })

    it('capacity_budget caps the result count', async () => {
      overrideDynamicConfigFieldsForTest(rssFeedCrawlConfig, { capacity_budget: 2 })
      const feeds = await getRssFeedsToFetch({ limit: 10_000 })
      expect(feeds.length).toBeLessThanOrEqual(2)
      overrideDynamicConfigFieldsForTest(rssFeedCrawlConfig, {
        capacity_budget: RSS_FEED_CRAWL_MAX_VALUES.capacity_budget,
      })
    })

    it('includes feeds that have never been fetched (due bucket)', async () => {
      const feeds = await getRssFeedsToFetch({ limit: LIMIT })
      expect(feeds.map(f => f.id)).toContain(neverFetchedId)
    })

    it('result feeds have crawl_score and crawl_tier', async () => {
      const feeds = await getRssFeedsToFetch({ limit: LIMIT })
      for (const feed of feeds) {
        expect(typeof feed.crawl_score).toBe('number')
        expect(feed.crawl_tier).toBeGreaterThanOrEqual(1)
        expect(feed.crawl_tier).toBeLessThanOrEqual(5)
      }
    })

    it('returns declared_language from the tiered projection', async () => {
      await updateRssFeedById(neverFetchedId, { declared_language: 'fr' })
      try {
        const feeds = await getRssFeedsToFetch({ limit: LIMIT })
        expect(feeds.find(f => f.id === neverFetchedId)?.declared_language).toBe('fr')
      } finally {
        await updateRssFeedById(neverFetchedId, { declared_language: null })
      }
    })

    it('excludes backfill feeds fetched within the tier-1 SLA', async () => {
      const feeds = await getRssFeedsToFetch({ limit: LIMIT })
      expect(feeds.map(f => f.id)).not.toContain(recentFetchedId)
    })

    it('returns feed_ignore_robots_txt from tiered projection', async () => {
      await updateRssFeedById(neverFetchedId, { ignore_robots_txt: false })
      try {
        const feeds = await getRssFeedsToFetch({ limit: LIMIT })
        const found = feeds.find(f => f.id === neverFetchedId)
        expect(found).toBeDefined()
        expect(found?.feed_ignore_robots_txt).toBe(false)
      } finally {
        await updateRssFeedById(neverFetchedId, { ignore_robots_txt: null })
      }
    })

    it('returns feed_unreliable_status_codes from tiered projection', async () => {
      await updateRssFeedById(neverFetchedId, { unreliable_status_codes: [404, 410] })
      try {
        const feeds = await getRssFeedsToFetch({ limit: LIMIT })
        const found = feeds.find(f => f.id === neverFetchedId)
        expect(found).toBeDefined()
        expect(found?.feed_unreliable_status_codes).toEqual([404, 410])
      } finally {
        await updateRssFeedById(neverFetchedId, { unreliable_status_codes: null })
      }
    })

    it('defaults feeds not yet in the MV to tier 5 and still dispatches them', async () => {
      // A feed absent from mv_rss_feed_crawl_tiers must still be dispatched via the
      // LEFT JOIN + COALESCE(crawl_tier, 5) path (never-fetched → due), so newly
      // created feeds are never missed before the next nightly MV refresh.
      // Size the budget above the live enabled-feed count so this score-0, newest-id
      // feed (which sorts last in the due bucket) is never capped off on a dirty DB.
      const newFeed = await createTestRssFeed({})
      overrideDynamicConfigFieldsForTest(rssFeedCrawlConfig, {
        capacity_budget: (await countEnabledRssFeedsForTest()) + 100,
      })
      const feeds = await getRssFeedsToFetch({ limit: LIMIT })
      overrideDynamicConfigFieldsForTest(rssFeedCrawlConfig, {
        capacity_budget: RSS_FEED_CRAWL_MAX_VALUES.capacity_budget,
      })
      const found = feeds.find(f => f.id === newFeed.id)
      expect(found).toBeDefined()
      expect(found?.crawl_tier).toBe(5)
      expect(found?.crawl_score).toBe(0)
    })
  })
})

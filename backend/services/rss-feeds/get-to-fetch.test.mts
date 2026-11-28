import { afterAll, beforeAll, describe, expect, it, onTestFinished } from 'vitest'
import {
  FAILING_DISPATCH_LANE,
  getRssFeedByIdToFetch,
  getRssFeedsToFetch,
} from './get-to-fetch.mts'
import { updateUrlHostnameUnreliableStatusCodes, updateRssFeedTiming } from '@voucha/test-helpers'
import {
  deleteRssFeedsByIds,
  insertTestRssFeedDirect,
} from '@voucha/test-helpers/entities/rss-feeds'
import { updateRssFeedFailedTiming } from '@voucha/test-helpers/entities/rss-feeds-state'
import { setTestHostnameRateLimitedUntil } from '@voucha/test-helpers/entities/url-hostname-network-backoff'
import { uuidBefore } from '@voucha/test-helpers/uuid-before'
import { createTestRssFeed } from '@voucha/test-helpers/rss-feed-create'
import { readTestRssFeedAtTtlOffset } from '@voucha/test-helpers/rss-feed-ttl-boundary'
import { getRssFeedById } from './get.mts'
import { updateRssFeedById } from './update.mts'
import { rssFeedCrawlConfig } from './crawl-config.mts'

describe('get-to-fetch', () => {
  const TTL_MS = 60_000 // 1 minute
  let neverFetchedId: string
  let recentFetchedId: string
  let disabledId: string

  beforeAll(async () => {
    await rssFeedCrawlConfig.waitForInitialization()
    const [neverFetched, recentFetched, disabled] = await Promise.all([
      createTestRssFeed({}),
      createTestRssFeed({}),
      createTestRssFeed({}),
    ])

    neverFetchedId = neverFetched.id
    recentFetchedId = recentFetched.id
    disabledId = disabled.id
    await Promise.all([
      updateRssFeedTiming(recentFetchedId, new Date(Date.now() - TTL_MS / 2)),
      updateRssFeedById(disabledId, { is_enabled: false }),
    ])
  })

  afterAll(async () => {
    await rssFeedCrawlConfig.close()
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

  it.each([
    [-1, true],
    [0, true],
    [1, false],
  ] as const)('includes an owned feed at TTL offset %i ms: %s', async (offsetMs, due) => {
    const feed = await readTestRssFeedAtTtlOffset(neverFetchedId, TTL_MS, offsetMs)
    expect(feed?.id ?? null).toBe(due ? neverFetchedId : null)
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

  it('rejects an invalid tier scheduling instant before querying', () => {
    expect(() => getRssFeedsToFetch({ asOf: new Date(Number.NaN) })).toThrow(
      'Invalid RSS tier scheduling time',
    )
  })

  it.each([0, 11, 1.5])('rejects invalid dispatch lane %s', async lane => {
    await expect(
      getRssFeedsToFetch({
        cursor: { lane, afterId: '00000000-0000-0000-0000-000000000000' },
      }),
    ).rejects.toThrow('Invalid RSS dispatch lane')
  })

  it('rejects an invalid dispatch cursor timestamp before querying', async () => {
    await expect(
      getRssFeedsToFetch({
        cursor: {
          lane: 5,
          afterId: '00000000-0000-0000-0000-000000000000',
          afterLastSucceededAt: 'not-a-timestamp',
        },
      }),
    ).rejects.toThrow('Invalid RSS dispatch cursor timestamp')
    await expect(
      getRssFeedsToFetch({
        cursor: {
          lane: 6,
          afterId: '00000000-0000-0000-0000-000000000000',
          afterLastFailedAt: 'not-a-timestamp',
        },
      }),
    ).rejects.toThrow('Invalid RSS dispatch cursor timestamp')
  })

  it.each([0, Number.NaN, 1.5])('rejects invalid physical page budget %s', rawBudget => {
    expect(() => getRssFeedsToFetch({ rawBudget })).toThrow(
      'RSS raw budget must be a positive safe integer',
    )
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
    await updateRssFeedById(neverFetchedId, { should_ignore_robots_txt: true })
    try {
      const feed = await getRssFeedByIdToFetch(neverFetchedId, { ttl: TTL_MS })
      expect(feed).not.toBeNull()
      expect(feed?.feed_ignore_robots_txt).toBe(true)
    } finally {
      await updateRssFeedById(neverFetchedId, { should_ignore_robots_txt: null })
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

  it.each([
    { lane: 5, label: 'healthy' },
    { lane: FAILING_DISPATCH_LANE, label: 'failing' },
  ] as const)(
    'advances cursor past a blocked prefix longer than rawBudget in $label lane',
    async ({ lane }) => {
      const feeds = await Promise.all(Array.from({ length: 5 }, () => insertTestRssFeedDirect({})))
      const ids = feeds.map(feed => feed.id).toSorted()
      onTestFinished(() => deleteRssFeedsByIds(ids))
      const asOf = new Date('2012-06-01T00:00:00.000Z')
      const baseMs = asOf.getTime() - 48 * 60 * 60_000
      const stamp = lane === 5 ? updateRssFeedTiming : updateRssFeedFailedTiming
      await Promise.all(ids.map((id, i) => stamp(id, new Date(baseMs + i * 1000))))
      const blocked = ids.slice(0, 4)
      const eligibleId = ids[4]!
      const blockedRows = await Promise.all(
        blocked.map(id => getRssFeedByIdToFetch(id, { ttl: 0 })),
      )
      await Promise.all(
        blockedRows.map(row =>
          setTestHostnameRateLimitedUntil(row!.url_hostname_id, new Date(Date.now() + 60_000)),
        ),
      )

      const startTs = new Date(baseMs - 1000).toISOString()
      const startCursor =
        lane === 5
          ? {
              lane,
              afterLastSucceededAt: startTs,
              afterId: uuidBefore(ids[0]!),
              throughId: eligibleId,
            }
          : {
              lane,
              afterLastFailedAt: startTs,
              afterId: uuidBefore(ids[0]!),
              throughId: eligibleId,
            }

      const page1 = await getRssFeedsToFetch({ limit: 2, rawBudget: 2, asOf, cursor: startCursor })
      expect(page1.feeds).toEqual([])
      expect(page1.rawRowsRead).toBe(2)
      expect(page1.nextCursor?.lane).toBe(lane)
      expect(page1.nextCursor?.afterId).toBe(blocked[1])

      const page2 = await getRssFeedsToFetch({
        limit: 2,
        rawBudget: 2,
        asOf,
        cursor: page1.nextCursor,
      })
      expect(page2.feeds).toEqual([])
      expect(page2.rawRowsRead).toBe(2)
      expect(page2.nextCursor?.lane).toBe(lane)
      expect(page2.nextCursor?.afterId).toBe(blocked[3])

      const page3 = await getRssFeedsToFetch({
        limit: 2,
        rawBudget: 2,
        asOf,
        cursor: page2.nextCursor,
      })
      expect(page3.feeds.map(row => row.id)).toEqual([eligibleId])
      expect(page3.rawRowsRead).toBe(1)
    },
  )
})

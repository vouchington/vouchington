import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getRssFeedByIdToFetch, getRssFeedsToFetch } from './get-to-fetch.mts'
import { updateUrlHostnameUnreliableStatusCodes, updateRssFeedTiming } from '@voucha/test-helpers'
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
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { enqueueBulkFetchRssFeeds } from '@queues/rss-feeds/enqueues'
import type {
  getRssFeedsToFetch,
  isCrawlPrioritizationEnabled,
  getTierSlaMs,
  RssFeedToFetch,
} from '@services/rss-feeds'
import { TIER_PRIORITY } from '@queues/rss-feeds/config'
import {
  processFetchRssFeed,
  processRssFeedsDispatcher,
  processRssFeedsJob,
} from '../processors.mts'
import type { Job } from 'glide-mq'

const mockEnqueueBulkFetchRssFeeds = vi.fn<typeof enqueueBulkFetchRssFeeds>()
const mockGetRssFeedsToFetch = vi.fn<typeof getRssFeedsToFetch>()
const mockIsCrawlPrioritizationEnabled = vi.fn<typeof isCrawlPrioritizationEnabled>()
const mockGetTierSlaMs = vi.fn<typeof getTierSlaMs>()

// Default SLAs matching the config defaults
const TIER_SLA: Record<number, number> = {
  1: 5 * 60_000,
  2: 15 * 60_000,
  3: 60 * 60_000,
  4: 2 * 60 * 60_000,
  5: 24 * 60 * 60_000,
}

function makeRssFeedToFetch(overrides: {
  id?: string
  crawl_tier?: number
  crawl_score?: number
  priority_group?: 1 | 2
}): RssFeedToFetch {
  return {
    id: overrides.id ?? 'feed-id',
    url: 'https://example.com/feed.xml',
    url_hostname_id: 'hostname-id',
    declared_language: null,
    crawlable: true,
    title: 'Test Feed',
    last_modified_at: null,
    etag: null,
    last_fetched_at: null,
    feed_type: 'article' as const,
    crawl_score: overrides.crawl_score ?? 0,
    crawl_tier: overrides.crawl_tier ?? 5,
    priority_group: (overrides.priority_group ?? 1) as 1 | 2,
    feed_ignore_robots_txt: null,
    hostname_ignore_robots_txt: null,
    feed_unreliable_status_codes: null,
    hostname_unreliable_status_codes: null,
  }
}

describe('processRssFeedsDispatcher', () => {
  beforeEach(() => {
    mockEnqueueBulkFetchRssFeeds.mockResolvedValue(undefined as never)
    mockIsCrawlPrioritizationEnabled.mockReturnValue(true)
    mockGetTierSlaMs.mockImplementation((tier: number) => TIER_SLA[tier] ?? TIER_SLA[5])
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('returns { count: 0 } and does not enqueue when no feeds returned', async () => {
    mockGetRssFeedsToFetch.mockResolvedValue([])
    const result = await runDispatcher()
    expect(result).toEqual({ count: 0 })
    expect(mockEnqueueBulkFetchRssFeeds).not.toHaveBeenCalled()
  })

  it('enqueues feeds with TIER_PRIORITY[1] and tier-1 SLA for tier-1 feeds', async () => {
    const feed = makeRssFeedToFetch({ id: 'feed-tier1', crawl_tier: 1, crawl_score: 10 })
    mockGetRssFeedsToFetch.mockResolvedValue([feed])

    await runDispatcher()

    expect(mockGetRssFeedsToFetch).toHaveBeenCalledWith({ prioritized: true })
    expect(mockEnqueueBulkFetchRssFeeds).toHaveBeenCalledWith(['feed-tier1'], {
      priority: TIER_PRIORITY[1],
      ttl: TIER_SLA[1],
    })
  })

  it('enqueues feeds with TIER_PRIORITY[5] and tier-5 SLA for tier-5 feeds', async () => {
    const feed = makeRssFeedToFetch({ id: 'feed-tier5', crawl_tier: 5, crawl_score: 0 })
    mockGetRssFeedsToFetch.mockResolvedValue([feed])

    await runDispatcher()

    expect(mockEnqueueBulkFetchRssFeeds).toHaveBeenCalledWith(['feed-tier5'], {
      priority: TIER_PRIORITY[5],
      ttl: TIER_SLA[5],
    })
  })

  it('groups feeds by tier and issues one enqueue call per tier', async () => {
    const feeds = [
      makeRssFeedToFetch({ id: 'feed-a', crawl_tier: 1, crawl_score: 10 }),
      makeRssFeedToFetch({ id: 'feed-b', crawl_tier: 1, crawl_score: 8 }),
      makeRssFeedToFetch({ id: 'feed-c', crawl_tier: 3, crawl_score: 2 }),
    ]
    mockGetRssFeedsToFetch.mockResolvedValue(feeds)

    await runDispatcher()

    // Two calls: one for tier 1, one for tier 3
    expect(mockEnqueueBulkFetchRssFeeds).toHaveBeenCalledTimes(2)
    const calls = mockEnqueueBulkFetchRssFeeds.mock.calls
    const tier1Call = calls.find(c => c[1]?.priority === TIER_PRIORITY[1])
    const tier3Call = calls.find(c => c[1]?.priority === TIER_PRIORITY[3])
    expect(tier1Call?.[0]).toContain('feed-a')
    expect(tier1Call?.[0]).toContain('feed-b')
    expect(tier3Call?.[0]).toContain('feed-c')
    expect(tier1Call?.[1]?.ttl).toBe(TIER_SLA[1])
    expect(tier3Call?.[1]?.ttl).toBe(TIER_SLA[3])
  })

  it('returns total feed count', async () => {
    const feeds = [
      makeRssFeedToFetch({ id: 'x1', crawl_tier: 2 }),
      makeRssFeedToFetch({ id: 'x2', crawl_tier: 4 }),
    ]
    mockGetRssFeedsToFetch.mockResolvedValue(feeds)

    const result = await runDispatcher()
    expect(result).toEqual({ count: 2 })
  })

  it('uses flat fallback TTL when prioritization is disabled', async () => {
    mockIsCrawlPrioritizationEnabled.mockReturnValue(false)
    const feed = makeRssFeedToFetch({ id: 'feed-flat', crawl_tier: 5 })
    mockGetRssFeedsToFetch.mockResolvedValue([feed])

    await runDispatcher()

    expect(mockGetRssFeedsToFetch).toHaveBeenCalledWith({
      prioritized: false,
      ttl: 5 * 60_000,
    })
    expect(mockEnqueueBulkFetchRssFeeds).toHaveBeenCalledWith(['feed-flat'], {
      ttl: 5 * 60_000,
    })
  })

  it('omits ttl for backfill feeds so they are not blocked by the SLA dedup window', async () => {
    const feed = makeRssFeedToFetch({ id: 'feed-backfill', crawl_tier: 5, priority_group: 2 })
    mockGetRssFeedsToFetch.mockResolvedValue([feed])

    await runDispatcher()

    expect(mockEnqueueBulkFetchRssFeeds).toHaveBeenCalledWith(['feed-backfill'], {
      priority: TIER_PRIORITY[5],
      ttl: undefined,
    })
  })
})

function runDispatcher(): Promise<{ count: number }> {
  return processRssFeedsDispatcher({
    enqueueBulkFetchRssFeeds: mockEnqueueBulkFetchRssFeeds,
    getRssFeedsToFetch: mockGetRssFeedsToFetch,
    getTierSlaMs: mockGetTierSlaMs,
    isCrawlPrioritizationEnabled: mockIsCrawlPrioritizationEnabled,
  })
}

describe('processFetchRssFeed', () => {
  it('returns small fetch metadata instead of the full fetch result', async () => {
    const fetchRssFeed = vi.fn<typeof import('@services/rss-feeds').fetchRssFeed>()
    fetchRssFeed.mockResolvedValue([
      { id: 'item-1', has_embedding: false },
      { id: 'item-2', has_embedding: true },
    ])

    const result = await processFetchRssFeed('feed-1', 0, { fetchRssFeed })

    expect(fetchRssFeed).toHaveBeenCalledWith('feed-1', 0)
    expect(result).toEqual({ rss_feed_id: 'feed-1', item_count: 2 })
  })
})

describe('processRssFeedsJob', () => {
  const processFetchRssFeedMock = vi.fn<typeof processFetchRssFeed>()
  const processRssFeedsDispatcherMock = vi.fn<typeof processRssFeedsDispatcher>()

  beforeEach(() => {
    processFetchRssFeedMock.mockResolvedValue({ rss_feed_id: 'feed-1', item_count: 3 })
    processRssFeedsDispatcherMock.mockResolvedValue({ count: 4 })
  })

  function runRssFeedsJob(job: Job): Promise<unknown> {
    return processRssFeedsJob(job, {
      processFetchRssFeed: processFetchRssFeedMock,
      processRssFeedsDispatcher: processRssFeedsDispatcherMock,
    })
  }

  it('dispatches dispatcher jobs', async () => {
    await expect(
      runRssFeedsJob({
        name: 'dispatchRssFeeds',
        data: {},
        opts: { ordering: { key: 'dispatcher' } },
      } as Job),
    ).resolves.toEqual({ count: 4 })

    expect(processRssFeedsDispatcherMock).toHaveBeenCalled()
  })

  it('dispatches fetch jobs with numeric ttl', async () => {
    await expect(
      runRssFeedsJob({
        name: 'fetchRssFeed',
        data: { rssFeedId: 'feed-1', ttl: 0 },
        opts: { ordering: { key: 'fetch' } },
      } as Job),
    ).resolves.toEqual({ rss_feed_id: 'feed-1', item_count: 3 })

    expect(processFetchRssFeedMock).toHaveBeenCalledWith('feed-1', 0)
  })

  it('dispatches fetch jobs without a non-numeric ttl', async () => {
    await runRssFeedsJob({
      name: 'fetchRssFeed',
      data: { rssFeedId: 'feed-1', ttl: 'skip' },
      opts: { ordering: { key: 'fetch' } },
    } as Job)

    expect(processFetchRssFeedMock).toHaveBeenCalledWith('feed-1', undefined)
  })

  it('validates fetch job payloads before processing', async () => {
    await expect(
      runRssFeedsJob({
        name: 'fetchRssFeed',
        data: {},
        opts: { ordering: { key: 'fetch' } },
      } as Job),
    ).rejects.toThrow('RSS feed job .rssFeedId is required')
  })

  it('rejects unknown dispatcher jobs', async () => {
    await expect(
      runRssFeedsJob({
        name: 'unknown',
        data: {},
        opts: { ordering: { key: 'dispatcher' } },
      } as Job),
    ).rejects.toThrow('RSS feed dispatcher job unknown not found')
  })

  it('rejects unknown fetch jobs', async () => {
    await expect(
      runRssFeedsJob({ name: 'unknown', data: {}, opts: { ordering: { key: 'fetch' } } } as Job),
    ).rejects.toThrow('RSS feed job unknown not found')
  })

  it('rejects unknown ordering keys', async () => {
    await expect(
      runRssFeedsJob({
        name: 'fetchRssFeed',
        data: {},
        opts: { ordering: { key: 'other' } },
      } as Job),
    ).rejects.toThrow('Unknown ordering key: other')
  })
})

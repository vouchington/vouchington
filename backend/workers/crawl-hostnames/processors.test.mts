import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  processCrawlCleanup,
  processCrawlHostnamesJob,
  processRefreshHostnameCrawler,
  processRefreshHostnameCrawlerDispatcher,
  processRefreshHostnameCrawlerDispatcherJob,
} from './processors.mts'
import type { deleteOldInvalidCrawls } from '@services/crawls/cleanup'
import type { dispatchCrawlHostnames } from '@services/crawls/dispatch-crawl-hostnames'
import type { dispatchCrawlUrlsPerHostname } from '@services/crawls/dispatch-per-hostname'
import type {
  dispatchTier1CrawlUrls,
  dispatchTier2CrawlUrls,
} from '@services/crawls/dispatch-tier-urls'
import type { enqueueBulkRefreshHostnameCrawler } from '@queues/crawl-hostnames/enqueues'
import type { enqueueBulkCrawlUrls } from '@queues/crawler/enqueues'
import type { computeRateLimitForHostname } from '@services/crawls/hostname-rate-limit'
import type { refreshHostnameCrawler } from '@services/crawlers/refresh'
import type { searchHostnameIdsNeedingCrawlerRefresh } from '@services/crawlers'
import type { Job } from 'glide-mq'

const deleteOldInvalidCrawlsMock = vi.fn<typeof deleteOldInvalidCrawls>()
const dispatchCrawlHostnamesMock = vi.fn<typeof dispatchCrawlHostnames>()
const dispatchCrawlUrlsPerHostnameMock = vi.fn<typeof dispatchCrawlUrlsPerHostname>()
const dispatchTier1CrawlUrlsMock = vi.fn<typeof dispatchTier1CrawlUrls>()
const dispatchTier2CrawlUrlsMock = vi.fn<typeof dispatchTier2CrawlUrls>()
const enqueueBulkRefreshHostnameCrawlerMock = vi.fn<typeof enqueueBulkRefreshHostnameCrawler>()
const enqueueBulkCrawlUrlsMock = vi.fn<typeof enqueueBulkCrawlUrls>()
const computeRateLimitForHostnameMock = vi.fn<typeof computeRateLimitForHostname>()
const refreshHostnameCrawlerMock = vi.fn<typeof refreshHostnameCrawler>()
const searchHostnameIdsNeedingCrawlerRefreshMock =
  vi.fn<typeof searchHostnameIdsNeedingCrawlerRefresh>()

function job(name: string, data?: Record<string, unknown>): Job {
  return { name, data, opts: {} } as Job
}

function dependencies() {
  return {
    deleteOldInvalidCrawls: deleteOldInvalidCrawlsMock,
    dispatchCrawlHostnames: dispatchCrawlHostnamesMock,
    dispatchCrawlUrlsPerHostname: dispatchCrawlUrlsPerHostnameMock,
    dispatchTier1CrawlUrls: dispatchTier1CrawlUrlsMock,
    dispatchTier2CrawlUrls: dispatchTier2CrawlUrlsMock,
    enqueueBulkCrawlUrls: enqueueBulkCrawlUrlsMock,
    enqueueBulkRefreshHostnameCrawler: enqueueBulkRefreshHostnameCrawlerMock,
    computeRateLimitForHostname: computeRateLimitForHostnameMock,
    refreshHostnameCrawler: refreshHostnameCrawlerMock,
    searchHostnameIdsNeedingCrawlerRefresh: searchHostnameIdsNeedingCrawlerRefreshMock,
  }
}

describe('crawl-hostnames processors', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    deleteOldInvalidCrawlsMock.mockResolvedValue(3)
    dispatchCrawlHostnamesMock.mockResolvedValue(4)
    dispatchCrawlUrlsPerHostnameMock.mockResolvedValue(5)
    dispatchTier1CrawlUrlsMock.mockResolvedValue(6)
    dispatchTier2CrawlUrlsMock.mockResolvedValue(7)
    enqueueBulkRefreshHostnameCrawlerMock.mockResolvedValue(undefined as never)
    enqueueBulkCrawlUrlsMock.mockResolvedValue(undefined as never)
    computeRateLimitForHostnameMock.mockResolvedValue(250)
    searchHostnameIdsNeedingCrawlerRefreshMock.mockResolvedValue(['hostname-a', 'hostname-b'])
    refreshHostnameCrawlerMock.mockResolvedValue({
      hostname_id: 'hostname-a',
      crawler_id: 'crawler-a',
      urls_considered: 2,
      urls_selected_for_crawl: 2,
      url_ids_to_crawl: ['url-a', 'url-b'],
    })
  })

  it('dispatches crawl-hostnames jobs to the matching processor', async () => {
    const deps = dependencies()

    await expect(processCrawlHostnamesJob(job('crawl_hostnames_dispatcher'), deps)).resolves.toBe(4)
    await expect(
      processCrawlHostnamesJob(
        job('crawl_urls_per_hostname_dispatcher', { hostname_id: 'h1' }),
        deps,
      ),
    ).resolves.toBe(5)
    await expect(processCrawlHostnamesJob(job('crawl_tier1_dispatcher'), deps)).resolves.toBe(6)
    await expect(processCrawlHostnamesJob(job('crawl_tier2_dispatcher'), deps)).resolves.toBe(7)

    expect(dispatchCrawlHostnamesMock).toHaveBeenCalled()
    expect(dispatchCrawlUrlsPerHostnameMock).toHaveBeenCalledWith('h1')
    expect(dispatchTier1CrawlUrlsMock).toHaveBeenCalled()
    expect(dispatchTier2CrawlUrlsMock).toHaveBeenCalled()
  })

  it('runs cleanup and refresh dispatcher jobs through helper processors', async () => {
    const deps = dependencies()

    await expect(processCrawlHostnamesJob(job('crawl_cleanup'), deps)).resolves.toEqual({
      crawls_deleted_invalid: 3,
    })
    await expect(
      processCrawlHostnamesJob(job('refresh_hostname_crawler_dispatcher'), deps),
    ).resolves.toBe(2)

    expect(enqueueBulkRefreshHostnameCrawlerMock).toHaveBeenCalledWith(['hostname-a', 'hostname-b'])
  })

  it('refreshes hostnames and enqueues selected URLs with a hostname rate limit', async () => {
    const deps = dependencies()

    await expect(
      processCrawlHostnamesJob(
        job('refresh_hostname_crawler', { hostname_id: 'hostname-a' }),
        deps,
      ),
    ).resolves.toEqual({
      hostname_id: 'hostname-a',
      crawler_id: 'crawler-a',
      urls_considered: 2,
      urls_selected_for_crawl: 2,
      url_ids_to_crawl: ['url-a', 'url-b'],
    })

    expect(computeRateLimitForHostnameMock).toHaveBeenCalledWith('hostname-a')
    expect(enqueueBulkCrawlUrlsMock).toHaveBeenCalledWith(
      [{ urlId: 'url-a' }, { urlId: 'url-b' }],
      { hostnameId: 'hostname-a', rateLimitMs: 250 },
    )
  })

  it('does not enqueue crawl URLs when refresh selects no URLs', async () => {
    refreshHostnameCrawlerMock.mockResolvedValueOnce({
      hostname_id: 'hostname-a',
      crawler_id: null,
      urls_considered: 0,
      urls_selected_for_crawl: 0,
      url_ids_to_crawl: [],
    })

    await processRefreshHostnameCrawler('hostname-a', dependencies())

    expect(enqueueBulkCrawlUrlsMock).not.toHaveBeenCalled()
  })

  it('validates required job data and known job names', async () => {
    const deps = dependencies()

    await expect(
      processCrawlHostnamesJob(job('crawl_urls_per_hostname_dispatcher'), deps),
    ).rejects.toThrow('Crawl URLs per hostname dispatcher job .hostname_id is required')
    await expect(processCrawlHostnamesJob(job('refresh_hostname_crawler'), deps)).rejects.toThrow(
      'Refresh hostname crawler job .hostname_id is required',
    )
    await expect(processCrawlHostnamesJob(job('unknown_job'), deps)).rejects.toThrow(
      'Crawl hostnames job unknown_job not found',
    )
  })

  it('exposes helper processors for direct worker tests', async () => {
    const deps = dependencies()

    await expect(processCrawlCleanup(deps)).resolves.toEqual({
      crawls_deleted_invalid: 3,
    })
    await expect(processRefreshHostnameCrawlerDispatcher(deps)).resolves.toEqual([
      'hostname-a',
      'hostname-b',
    ])
    await expect(processRefreshHostnameCrawlerDispatcherJob(deps)).resolves.toBe(2)
  })
})

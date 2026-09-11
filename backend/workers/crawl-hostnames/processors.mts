import type { CrawlHostnamesJobs } from '@queues/crawl-hostnames/types'
import { deleteOldInvalidCrawls } from '@services/crawls/cleanup'
import { searchHostnameIdsNeedingCrawlerRefresh } from '@services/crawlers'
import { refreshHostnameCrawler } from '@services/crawlers/refresh'
import { dispatchCrawlHostnames } from '@services/crawls/dispatch-crawl-hostnames'
import { dispatchTier1CrawlUrls, dispatchTier2CrawlUrls } from '@services/crawls/dispatch-tier-urls'
import { dispatchCrawlUrlsPerHostname } from '@services/crawls/dispatch-per-hostname'
import { enqueueBulkRefreshHostnameCrawler } from '@queues/crawl-hostnames/enqueues'
import { enqueueBulkCrawlUrls } from '@queues/crawler/enqueues'
import { computeRateLimitForHostname } from '@services/crawls/hostname-rate-limit'
import type { Job } from 'glide-mq'

const WEEKLY_REFRESH_BATCH_SIZE = 500

type CrawlHostnamesProcessorDependencies = {
  deleteOldInvalidCrawls: typeof deleteOldInvalidCrawls
  dispatchCrawlHostnames: typeof dispatchCrawlHostnames
  dispatchCrawlUrlsPerHostname: typeof dispatchCrawlUrlsPerHostname
  dispatchTier1CrawlUrls: typeof dispatchTier1CrawlUrls
  dispatchTier2CrawlUrls: typeof dispatchTier2CrawlUrls
  enqueueBulkCrawlUrls: typeof enqueueBulkCrawlUrls
  enqueueBulkRefreshHostnameCrawler: typeof enqueueBulkRefreshHostnameCrawler
  computeRateLimitForHostname: typeof computeRateLimitForHostname
  refreshHostnameCrawler: typeof refreshHostnameCrawler
  searchHostnameIdsNeedingCrawlerRefresh: typeof searchHostnameIdsNeedingCrawlerRefresh
}

function getDependencies(
  dependencies?: Partial<CrawlHostnamesProcessorDependencies>,
): CrawlHostnamesProcessorDependencies {
  return {
    deleteOldInvalidCrawls,
    dispatchCrawlHostnames,
    dispatchCrawlUrlsPerHostname,
    dispatchTier1CrawlUrls,
    dispatchTier2CrawlUrls,
    enqueueBulkCrawlUrls,
    enqueueBulkRefreshHostnameCrawler,
    computeRateLimitForHostname,
    refreshHostnameCrawler,
    searchHostnameIdsNeedingCrawlerRefresh,
    ...dependencies,
  }
}

export const processCrawlCleanup = async (
  dependencies?: Partial<CrawlHostnamesProcessorDependencies>,
) => {
  const deps = getDependencies(dependencies)
  return {
    crawls_deleted_invalid: await deps.deleteOldInvalidCrawls(),
  }
}

export const processRefreshHostnameCrawlerDispatcher = (
  dependencies?: Partial<CrawlHostnamesProcessorDependencies>,
): Promise<string[]> => {
  const deps = getDependencies(dependencies)
  return deps.searchHostnameIdsNeedingCrawlerRefresh(WEEKLY_REFRESH_BATCH_SIZE)
}

export async function processRefreshHostnameCrawlerDispatcherJob(
  dependencies?: Partial<CrawlHostnamesProcessorDependencies>,
): Promise<number> {
  const deps = getDependencies(dependencies)
  const hostnameIds = await processRefreshHostnameCrawlerDispatcher(deps)
  await deps.enqueueBulkRefreshHostnameCrawler(hostnameIds)
  return hostnameIds.length
}

export async function processRefreshHostnameCrawler(
  hostnameId: string,
  dependencies?: Partial<CrawlHostnamesProcessorDependencies>,
) {
  const deps = getDependencies(dependencies)
  const result = await deps.refreshHostnameCrawler(hostnameId)
  if (result.url_ids_to_crawl.length > 0) {
    const rateLimitMs = await deps.computeRateLimitForHostname(hostnameId)
    await deps.enqueueBulkCrawlUrls(
      result.url_ids_to_crawl.map(urlId => ({ urlId })),
      { hostnameId, rateLimitMs },
    )
  }
  return result
}

export async function processCrawlHostnamesJob(
  job: Job,
  dependencies?: Partial<CrawlHostnamesProcessorDependencies>,
): Promise<unknown> {
  const deps = getDependencies(dependencies)
  switch (job.name as CrawlHostnamesJobs) {
    case 'crawl_hostnames_dispatcher':
      return deps.dispatchCrawlHostnames()
    case 'crawl_urls_per_hostname_dispatcher': {
      const hostnameId = job.data?.hostname_id
      if (!hostnameId)
        throw new Error('Crawl URLs per hostname dispatcher job .hostname_id is required')
      return deps.dispatchCrawlUrlsPerHostname(hostnameId)
    }
    case 'crawl_tier1_dispatcher':
      return deps.dispatchTier1CrawlUrls()
    case 'crawl_tier2_dispatcher':
      return deps.dispatchTier2CrawlUrls()
    case 'crawl_cleanup':
      return processCrawlCleanup(deps)
    case 'refresh_hostname_crawler_dispatcher':
      return processRefreshHostnameCrawlerDispatcherJob(deps)
    case 'refresh_hostname_crawler': {
      const hostnameId = job.data?.hostname_id
      if (!hostnameId) throw new Error('Refresh hostname crawler job .hostname_id is required')
      return processRefreshHostnameCrawler(hostnameId, deps)
    }
    default:
      throw new Error(`Crawl hostnames job ${job.name} not found`)
  }
}

import { processPagedDispatcher } from '@data-stores/valkey-glide-mq/paged-dispatcher'
import { backgroundCpu } from '@queues/background-cpu/queues'
import { requireBackgroundCpuJob } from '@queues/background-cpu/enqueues/registry'
import { getWeeklyHostnameRefreshLimits, getCrawlCleanupLimits } from '@services/crawls/work-limits'
import type { CrawlHostnameDispatchCursor } from '@queues/crawl-dispatch/types'
import { deleteOldInvalidCrawls, getCrawlCleanupCutoff } from '@services/crawls/cleanup'
import { searchHostnameIdsNeedingCrawlerRefresh } from '@services/crawlers'
import {
  refreshHostnameCrawler,
  type HostnameCrawlerRefreshCursor,
} from '@services/crawlers/refresh'
import { dispatchCrawlHostnames } from '@services/crawls/dispatch-crawl-hostnames'
import { dispatchTier1CrawlUrls, dispatchTier2CrawlUrls } from '@services/crawls/dispatch-tier-urls'
import { dispatchCrawlUrlsPerHostname } from '@services/crawls/dispatch-per-hostname'
import { createEnqueueFunction, processRetainedSweep } from '@data-stores/valkey-glide-mq'
import { enqueueBulkRefreshHostnameCrawler } from '@queues/crawl-dispatch/enqueues/hostnames'
import { enqueueBulkCrawlUrls } from '@queues/crawler/enqueues'
import { computeRateLimitForHostname } from '@services/crawls/hostname-rate-limit'
import { runBoundedBatches } from '@services/data-retention/run-bounded-batches'
import type { Job } from 'glide-mq'

async function processCrawlCleanup(job: Job, deleteCrawls: typeof deleteOldInvalidCrawls) {
  const cutoffId = job.data?.cutoffId ?? getCrawlCleanupCutoff()
  await job.updateData({ cutoffId })
  return processRetainedSweep(job, async () => {
    const result = await runBoundedBatches(getCrawlCleanupLimits(), async batchSize => {
      const page = await deleteCrawls({ cutoffId, limit: batchSize })
      return page.deleted
    })
    return { crawls_deleted_invalid: result.deleted, hasMore: result.hasMore }
  })
}

async function dispatchWeeklyHostnameCrawlerRefresh(
  saved: HostnameCrawlerRefreshCursor | undefined,
  saveProgress: (cursor: HostnameCrawlerRefreshCursor) => Promise<void>,
): Promise<{ count: number; hasMore: boolean }> {
  const limits = getWeeklyHostnameRefreshLimits()
  let cursor = saved ?? { sweepStartedAt: new Date().toISOString() }
  await saveProgress(cursor)
  let count = 0
  while (count < limits.maxRows) {
    const pageSize = Math.min(limits.batchSize, limits.maxRows - count)
    // no-mistakes-disable-next-line query-reached-per-item: at most weekly_refresh_max_rows_per_run rows are paged by the retained id cursor, and each page depends on the previous page's enqueue.
    const ids = await searchHostnameIdsNeedingCrawlerRefresh(pageSize, {}, undefined, cursor) // oxlint-disable-line no-await-in-loop -- each page advances the retained cursor after its enqueue succeeds
    if (ids.length === 0) return { count, hasMore: false }
    // oxlint-disable-next-line no-await-in-loop -- enqueue must commit before the retained cursor advances
    await enqueueBulkRefreshHostnameCrawler(ids)
    count += ids.length
    cursor.afterId = ids.at(-1)!
    // oxlint-disable-next-line no-await-in-loop -- retained state must survive a worker restart
    await saveProgress(cursor)
    if (ids.length < pageSize) return { count, hasMore: false }
  }
  return { count, hasMore: true }
}

async function processRefreshHostnameCrawler(hostnameId: string) {
  const result = await refreshHostnameCrawler(hostnameId)
  if (result.url_ids_to_crawl.length > 0) {
    const rateLimitMs = await computeRateLimitForHostname(hostnameId)
    await enqueueBulkCrawlUrls(
      result.url_ids_to_crawl.map(urlId => ({ urlId })),
      { hostnameId, rateLimitMs },
    )
  }
  return result
}

// The unscoped cleanup sweep would delete other tests' crawls on the shared database, so tests scope its read.
export async function processCrawlHostnamesJob(
  job: Job,
  dependencies: { deleteOldInvalidCrawls?: typeof deleteOldInvalidCrawls } = {},
): Promise<unknown> {
  switch (job.name) {
    case 'crawl.crawl_hostnames_dispatcher':
      return processPagedDispatcher<{ cursor?: CrawlHostnameDispatchCursor }, unknown>(job, {
        dispatcher: 'hostnames',
        cursorKey: 'id',
        target: backgroundCpu,
        targetName: 'background-cpu',
        readAndDispatch: async pageSize => {
          const cursor = job.data?.cursor ?? {
            sweepStartedAt: new Date().toISOString(),
            rangeLimit: pageSize,
            afterBucketDays: -32769,
          }
          if (!job.data?.cursor) await job.updateData({ cursor })
          let nextCursor = cursor
          const result = await dispatchCrawlHostnames(
            cursor,
            async next => {
              nextCursor = next
            },
            pageSize,
          )
          return { result, ...(result.hasMore ? { next: { cursor: nextCursor } } : {}) }
        },
        enqueueNext: createEnqueueFunction<
          { cursor?: CrawlHostnameDispatchCursor },
          'crawl.crawl_hostnames_dispatcher'
        >({
          queue: backgroundCpu,
          queueName: 'background-cpu',
          jobName: 'crawl.crawl_hostnames_dispatcher',
          defaults: requireBackgroundCpuJob('crawl.crawl_hostnames_dispatcher').options,
        }),
      })
    case 'crawl.crawl_urls_per_hostname_dispatcher': {
      const hostnameId = job.data?.hostname_id
      if (!hostnameId)
        throw new Error('Crawl URLs per hostname dispatcher job .hostname_id is required')
      return processRetainedSweep(job, save =>
        dispatchCrawlUrlsPerHostname(hostnameId, job.data?.cursor, cursor =>
          save({ hostname_id: hostnameId, cursor }),
        ),
      )
    }
    case 'crawl.crawl_tier1_dispatcher':
      return processRetainedSweep(job, save =>
        dispatchTier1CrawlUrls(job.data?.cursor, cursor => save({ cursor })),
      )
    case 'crawl.crawl_tier2_dispatcher':
      return processRetainedSweep(job, save =>
        dispatchTier2CrawlUrls(job.data?.cursor, cursor => save({ cursor })),
      )
    case 'crawl.crawl_cleanup':
      return processCrawlCleanup(job, dependencies.deleteOldInvalidCrawls ?? deleteOldInvalidCrawls)
    case 'crawl.refresh_hostname_crawler_dispatcher':
      return processRetainedSweep(job, save =>
        dispatchWeeklyHostnameCrawlerRefresh(
          job.data?.cursor as HostnameCrawlerRefreshCursor | undefined,
          cursor => save({ cursor }),
        ),
      )
    case 'crawl.refresh_hostname_crawler': {
      const hostnameId = job.data?.hostname_id
      if (!hostnameId) throw new Error('Refresh hostname crawler job .hostname_id is required')
      return processRefreshHostnameCrawler(hostnameId)
    }
    default:
      throw new Error(`Crawl hostnames job ${job.name} not found`)
  }
}

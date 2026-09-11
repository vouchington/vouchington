import { createBulkEnqueueFunction, createEnqueueFunction } from '@data-stores/valkey-glide-mq'
import type { EnqueueReturnType } from '@voucha/types'
import type { JobOptions } from 'glide-mq'
import { CRAWL_HOSTNAMES_QUEUE_NAME, PRIORITY_DEFAULT, PRIORITY_DISPATCHER } from './config.mts'
import { crawlHostnamesQueue } from './queues.mts'
import type { CrawlHostnamesJobs } from './types.mts'

const ONE_MINUTE_MS = 60_000
const BACKFILL_DEDUPLICATION_TTL_MS = 60 * ONE_MINUTE_MS
const CRAWL_HOSTNAME_JOB_NAME: CrawlHostnamesJobs = 'crawl_urls_per_hostname_dispatcher'
const REFRESH_HOSTNAME_JOB_NAME: CrawlHostnamesJobs = 'refresh_hostname_crawler'
type DispatcherOptions = {
  deduplicationId?: string
}

function createBulkHostnameEnqueue(jobName: CrawlHostnamesJobs, defaultPriority: number) {
  const enqueue = createBulkEnqueueFunction<string, { hostname_id: string }, CrawlHostnamesJobs>({
    queue: crawlHostnamesQueue,
    queueName: CRAWL_HOSTNAMES_QUEUE_NAME,
    jobName,
    buildJob: hostnameId => ({
      data: { hostname_id: hostnameId },
      opts: {
        deduplication: {
          id: `${jobName}__${hostnameId}`,
          mode: 'debounce',
          ttl: ONE_MINUTE_MS,
        },
      },
    }),
  })

  return (hostnameIds: string[], priority?: number): EnqueueReturnType => {
    return enqueue(hostnameIds, {
      priority: priority ?? defaultPriority,
    } satisfies Partial<JobOptions>)
  }
}

function createDispatcherEnqueue(jobName: CrawlHostnamesJobs, defaultPriority: number) {
  const enqueue = createEnqueueFunction<Record<string, never>, CrawlHostnamesJobs>({
    queue: crawlHostnamesQueue,
    queueName: CRAWL_HOSTNAMES_QUEUE_NAME,
    jobName,
  })

  return (options?: DispatcherOptions): EnqueueReturnType => {
    return enqueue(
      {},
      {
        priority: defaultPriority,
        ...(options?.deduplicationId && {
          deduplication: {
            id: options.deduplicationId,
            mode: 'throttle' as const,
            ttl: BACKFILL_DEDUPLICATION_TTL_MS,
          },
        }),
      },
    )
  }
}

export const enqueueBulkCrawlHostname = createBulkHostnameEnqueue(
  CRAWL_HOSTNAME_JOB_NAME,
  PRIORITY_DISPATCHER,
)

export const enqueueBulkRefreshHostnameCrawler = createBulkHostnameEnqueue(
  REFRESH_HOSTNAME_JOB_NAME,
  PRIORITY_DEFAULT,
)

export const enqueueCrawlHostnamesDispatcher = createDispatcherEnqueue(
  'crawl_hostnames_dispatcher',
  PRIORITY_DISPATCHER,
)

export const enqueueCrawlTier1Dispatcher = createDispatcherEnqueue(
  'crawl_tier1_dispatcher',
  PRIORITY_DISPATCHER,
)

export const enqueueCrawlTier2Dispatcher = createDispatcherEnqueue(
  'crawl_tier2_dispatcher',
  PRIORITY_DISPATCHER,
)

export const enqueueRefreshHostnameCrawlerDispatcher = createDispatcherEnqueue(
  'refresh_hostname_crawler_dispatcher',
  PRIORITY_DISPATCHER,
)

export const enqueueCrawlCleanup = createDispatcherEnqueue('crawl_cleanup', PRIORITY_DEFAULT)

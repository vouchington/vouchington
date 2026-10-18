import { pagedDispatchJobOptions } from '@data-stores/valkey-glide-mq/paged-dispatcher'
import { createBulkEnqueueFunction, createEnqueueFunction } from '@data-stores/valkey-glide-mq'
import type { EnqueueReturnType } from '@voucha/types'
import type { JobOptions } from 'glide-mq'
import { PRIORITY_DEFAULT, PRIORITY_DISPATCHER } from '../config.mts'
import { BACKGROUND_CPU_QUEUE_NAME } from '@queues/background-cpu/config'
import { requireBackgroundCpuJob } from '@queues/background-cpu/enqueues/registry'
import { backgroundCpu } from '@queues/background-cpu/queues'
import type { CrawlHostnamesJobs } from '../types.mts'

const ONE_MINUTE_MS = 60_000
const BACKFILL_DEDUPLICATION_TTL_MS = 60 * ONE_MINUTE_MS
const CRAWL_HOSTNAME_JOB_NAME: CrawlHostnamesJobs = 'crawl_urls_per_hostname_dispatcher'
const REFRESH_HOSTNAME_JOB_NAME: CrawlHostnamesJobs = 'refresh_hostname_crawler'
type DispatcherOptions = {
  deduplicationId?: string
}

function createBulkHostnameEnqueue(jobName: CrawlHostnamesJobs, defaultPriority: number) {
  const job = requireBackgroundCpuJob(`crawl.${jobName}`)
  const enqueue = createBulkEnqueueFunction({
    queue: backgroundCpu,
    queueName: BACKGROUND_CPU_QUEUE_NAME,
    jobName: job.name,
    defaults: job.options,
    buildJob: (hostnameId: string) => ({
      data: { hostname_id: hostnameId },
      opts: {
        deduplication: {
          id: `${job.name}__${hostnameId}`,
          mode: jobName === CRAWL_HOSTNAME_JOB_NAME ? ('simple' as const) : ('debounce' as const),
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
  const job = requireBackgroundCpuJob(`crawl.${jobName}`)
  const enqueue = createEnqueueFunction<Record<string, never>, string>({
    queue: backgroundCpu,
    queueName: BACKGROUND_CPU_QUEUE_NAME,
    jobName: job.name,
    defaults: job.options,
  })

  return (options?: DispatcherOptions): EnqueueReturnType => {
    return enqueue(
      {},
      {
        priority: defaultPriority,
        ...(jobName === 'crawl_hostnames_dispatcher' ? pagedDispatchJobOptions('hostnames') : {}),
        ...(jobName === 'crawl_tier1_dispatcher' ||
        jobName === 'crawl_tier2_dispatcher' ||
        jobName === 'crawl_hostnames_dispatcher'
          ? {
              deduplication: {
                id: `crawl:${options?.deduplicationId ?? jobName}`,
                mode: 'simple' as const,
              },
            }
          : options?.deduplicationId
            ? {
                deduplication: {
                  id: `crawl:${jobName}:${options.deduplicationId}`,
                  mode: 'throttle' as const,
                  ttl: BACKFILL_DEDUPLICATION_TTL_MS,
                },
              }
            : {}),
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

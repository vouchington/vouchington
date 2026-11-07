import { pagedDispatchJobOptions } from '@data-stores/valkey-glide-mq/paged-dispatcher'
import { createBulkEnqueueFunction } from '@data-stores/valkey-glide-mq'
import type { EnqueueReturnType } from '@voucha/types'
import type { JobOptions } from 'glide-mq'
import { PRIORITY_DEFAULT, PRIORITY_DISPATCHER } from '../config.mts'
import { BACKGROUND_CPU_QUEUE_NAME } from '@queues/background-cpu/config'
import { requireBackgroundCpuJob } from '@queues/background-cpu/enqueues/registry'
import { backgroundCpu } from '@queues/background-cpu/queues'
import { createBackgroundCpuEnqueueFunction } from '@queues/background-cpu/enqueues/typed-job'
import type { BackgroundCpuJobPayloads } from '@queues/background-cpu/types'
import type { CrawlHostnamesJobs } from '../types.mts'

const ONE_MINUTE_MS = 60_000
const BACKFILL_DEDUPLICATION_TTL_MS = 60 * ONE_MINUTE_MS
const CRAWL_HOSTNAME_JOB_NAME = 'crawl_urls_per_hostname_dispatcher' satisfies CrawlHostnamesJobs
const REFRESH_HOSTNAME_JOB_NAME = 'refresh_hostname_crawler' satisfies CrawlHostnamesJobs
type DispatcherOptions = {
  deduplicationId?: string
}

function createBulkHostnameEnqueue(
  jobName: typeof CRAWL_HOSTNAME_JOB_NAME | typeof REFRESH_HOSTNAME_JOB_NAME,
  defaultPriority: number,
) {
  const job = requireBackgroundCpuJob(`crawl.${jobName}`)
  const enqueue = createBulkEnqueueFunction({
    queue: backgroundCpu,
    queueName: BACKGROUND_CPU_QUEUE_NAME,
    jobName: job.name,
    defaults: job.options,
    buildJob: (hostnameId: string) => ({
      data: {
        hostname_id: hostnameId,
      } satisfies BackgroundCpuJobPayloads[`crawl.${typeof jobName}`],
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

type DispatcherJobName = Extract<
  CrawlHostnamesJobs,
  | 'crawl_hostnames_dispatcher'
  | 'crawl_tier1_dispatcher'
  | 'crawl_tier2_dispatcher'
  | 'refresh_hostname_crawler_dispatcher'
  | 'crawl_cleanup'
>
function createDispatcherEnqueue(jobName: DispatcherJobName, defaultPriority: number) {
  const enqueue = createBackgroundCpuEnqueueFunction(`crawl.${jobName}`)

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

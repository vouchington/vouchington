import { createBulkEnqueueFunction } from '@data-stores/valkey-glide-mq'
import { BACKGROUND_CPU_QUEUE_NAME, PRIORITY_TASK } from '@queues/background-cpu/config'
import { getBackgroundCpuJob } from '@queues/background-cpu/enqueues/registry'
import { backgroundCpu } from '@queues/background-cpu/queues'
import type { EnqueueCrawlerJobOptions, EnqueueCrawlUrlEntry } from './types.mts'

type CrawlUrlBulkInput = EnqueueCrawlUrlEntry & {
  jobDelay?: number
  priority?: number
  hostnameId?: string
  rateLimitMs: number
}

const JOB_NAME = 'crawl.crawl_url'
const job = getBackgroundCpuJob(JOB_NAME)!

const enqueueBulkCrawlUrlJobs = createBulkEnqueueFunction<
  CrawlUrlBulkInput,
  {
    ensure_crawler_for_redirects?: boolean
    should_ignore_robots_txt?: boolean
    max_response_size_bytes?: number
    preserve_http_redirects?: boolean
    skip_canonical_url?: boolean
    skip_created_events_for_redirects?: boolean
    url_id: string
    crawl_timeout_ms?: number
    rate_limit_retry_count?: number
    skip_chunks?: boolean
    skip_embed_resolution?: boolean
    import_row_id?: string
    import_discovery_generation?: string
  },
  string
>({
  queue: backgroundCpu,
  queueName: BACKGROUND_CPU_QUEUE_NAME,
  jobName: JOB_NAME,
  defaults: job.options,
  buildJob: ({
    urlId,
    options,
    rateLimitRetryCount,
    jobDelay,
    priority,
    hostnameId,
    rateLimitMs,
  }) => {
    const delay = options?.delay ?? jobDelay ?? 0
    return {
      data: {
        url_id: urlId,
        ...(options?.crawlTimeoutMs != null ? { crawl_timeout_ms: options.crawlTimeoutMs } : {}),
        ...(options?.ensureCrawlerForRedirects === true
          ? { ensure_crawler_for_redirects: true }
          : {}),
        ...(options?.ignoreRobotsTxt === true ? { should_ignore_robots_txt: true } : {}),
        ...(options?.maxResponseSizeBytes != null
          ? { max_response_size_bytes: options.maxResponseSizeBytes }
          : {}),
        ...(options?.preserveHttpRedirects === true ? { preserve_http_redirects: true } : {}),
        ...(rateLimitRetryCount != null ? { rate_limit_retry_count: rateLimitRetryCount } : {}),
        ...(options?.skipCanonicalUrl === true ? { skip_canonical_url: true } : {}),
        ...(options?.skipChunks === true ? { skip_chunks: true } : {}),
        ...(options?.skipEmbedResolution === true ? { skip_embed_resolution: true } : {}),
        ...(options?.skipCreatedEventsForRedirects === true
          ? { skip_created_events_for_redirects: true }
          : {}),
        ...(options?.importRowId ? { import_row_id: options.importRowId } : {}),
        ...(options?.importDiscoveryGeneration
          ? { import_discovery_generation: options.importDiscoveryGeneration }
          : {}),
      },
      opts: {
        priority: priority ?? PRIORITY_TASK,
        deduplication: {
          // A replacement is enqueued from inside the previous replacement while that job still
          // holds its dedup id, so each retry count needs its own id or the add is skipped.
          id:
            rateLimitRetryCount != null
              ? `${JOB_NAME}_ratelimit__${urlId}${options?.importRowId ? `__${options.importRowId}__${options.importDiscoveryGeneration}` : ''}__${rateLimitRetryCount}`
              : `${JOB_NAME}__${urlId}${options?.importRowId ? `__${options.importRowId}__${options.importDiscoveryGeneration}` : ''}`,
          mode: 'debounce',
          ttl: Math.max(rateLimitMs, delay),
        },
        ...(delay > 0 ? { delay } : {}),
        ...(hostnameId
          ? {
              ordering: {
                key: `crawl:${hostnameId}`,
                concurrency: 1,
                rateLimit: { max: 1, duration: rateLimitMs },
              },
            }
          : {}),
      },
    }
  },
})

export const enqueueBulkCrawlUrls = (
  entries: EnqueueCrawlUrlEntry[],
  options?: EnqueueCrawlerJobOptions,
) => {
  const { delay: jobDelay, priority, hostnameId, rateLimitMs = 1_000 } = options ?? {}
  return enqueueBulkCrawlUrlJobs(
    entries.map(entry => ({ ...entry, jobDelay, priority, hostnameId, rateLimitMs })),
  )
}

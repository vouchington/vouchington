import { createBulkEnqueueFunction } from '@data-stores/valkey-glide-mq'
import { CRAWL_URLS_QUEUE_NAME, PRIORITY_DEFAULT } from './config.mts'
import { waitForCrawlUrlJobResult } from './enqueues/crawl-url-job-results.mts'
import { crawlUrls } from './queues.mts'
import type { CrawlerJobs, EnqueueCrawlerJobOptions, EnqueueCrawlUrlEntry } from './types.mts'

type CrawlUrlBulkInput = EnqueueCrawlUrlEntry & {
  jobDelay?: number
  priority?: number
  hostnameId?: string
  rateLimitMs: number
}

const JOB_NAME: CrawlerJobs = 'crawl_url'
const CRAWL_URL_JOB_RETRY_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000, jitter: 0.5 },
}
const PRIORITY_HIGHEST = 0
const CRAWL_URL_WAIT_TIMEOUT_MS = 30_000
const CRAWL_URL_WAIT_COMPLETED_RETENTION = { age: 60, count: 100 }

export type CrawlUrlJobResult = {
  url_id: string
  crawl_id: string
  response_status_code: number
}

const enqueueBulkCrawlUrlJobs = createBulkEnqueueFunction<
  CrawlUrlBulkInput,
  {
    ensure_crawler_for_redirects?: boolean
    ignore_robots_txt?: boolean
    max_response_size_bytes?: number
    preserve_http_redirects?: boolean
    skip_canonical_url?: boolean
    skip_created_events_for_redirects?: boolean
    url_id: string
    crawl_timeout_ms?: number
    rate_limit_retry_count?: number
    skip_chunks?: boolean
    skip_embed_resolution?: boolean
    wait_for_result?: boolean
  },
  CrawlerJobs
>({
  queue: crawlUrls,
  queueName: CRAWL_URLS_QUEUE_NAME,
  jobName: JOB_NAME,
  defaults: {
    ...CRAWL_URL_JOB_RETRY_OPTIONS,
    removeOnComplete: 100,
    removeOnFail: 100,
  },
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
        ...(options?.ignoreRobotsTxt === true ? { ignore_robots_txt: true } : {}),
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
        ...(options?.waitForResult === true ? { wait_for_result: true } : {}),
      },
      opts: {
        ...(options?.waitForResult === true
          ? { removeOnComplete: CRAWL_URL_WAIT_COMPLETED_RETENTION }
          : {}),
        priority: priority ?? PRIORITY_DEFAULT,
        deduplication: {
          id:
            rateLimitRetryCount != null
              ? `${JOB_NAME}_ratelimit__${urlId}`
              : `${JOB_NAME}__${urlId}`,
          mode: 'debounce',
          ttl: Math.max(rateLimitMs, delay),
        },
        ...(delay > 0 ? { delay } : {}),
        ...(hostnameId
          ? { ordering: { key: hostnameId, rateLimit: { max: 1, duration: rateLimitMs } } }
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

export async function enqueueCrawlUrlAndWait(
  entry: EnqueueCrawlUrlEntry,
  options: EnqueueCrawlerJobOptions & { waitTimeoutMs?: number } = {},
): Promise<CrawlUrlJobResult | null> {
  const {
    crawlTimeoutMs = entry.options?.crawlTimeoutMs,
    delay = entry.options?.delay ?? 0,
    ensureCrawlerForRedirects = entry.options?.ensureCrawlerForRedirects,
    hostnameId = entry.options?.hostnameId,
    ignoreRobotsTxt = entry.options?.ignoreRobotsTxt,
    maxResponseSizeBytes = entry.options?.maxResponseSizeBytes,
    preserveHttpRedirects = entry.options?.preserveHttpRedirects,
    priority = entry.options?.priority ?? PRIORITY_HIGHEST,
    rateLimitMs = entry.options?.rateLimitMs ?? 1_000,
    skipCanonicalUrl = entry.options?.skipCanonicalUrl,
    skipChunks = entry.options?.skipChunks,
    skipEmbedResolution = entry.options?.skipEmbedResolution,
    skipCreatedEventsForRedirects = entry.options?.skipCreatedEventsForRedirects,
    waitTimeoutMs = CRAWL_URL_WAIT_TIMEOUT_MS,
  } = options
  const job = await crawlUrls.add(
    JOB_NAME,
    {
      url_id: entry.urlId,
      ...(crawlTimeoutMs != null ? { crawl_timeout_ms: crawlTimeoutMs } : {}),
      ...(ensureCrawlerForRedirects === true ? { ensure_crawler_for_redirects: true } : {}),
      ...(ignoreRobotsTxt === true ? { ignore_robots_txt: true } : {}),
      ...(maxResponseSizeBytes != null ? { max_response_size_bytes: maxResponseSizeBytes } : {}),
      ...(preserveHttpRedirects === true ? { preserve_http_redirects: true } : {}),
      ...(entry.rateLimitRetryCount != null
        ? { rate_limit_retry_count: entry.rateLimitRetryCount }
        : {}),
      ...(skipCanonicalUrl === true ? { skip_canonical_url: true } : {}),
      ...(skipChunks === true ? { skip_chunks: true } : {}),
      ...(skipEmbedResolution === true ? { skip_embed_resolution: true } : {}),
      ...(skipCreatedEventsForRedirects === true
        ? { skip_created_events_for_redirects: true }
        : {}),
      wait_for_result: true,
    },
    {
      ...CRAWL_URL_JOB_RETRY_OPTIONS,
      removeOnComplete: CRAWL_URL_WAIT_COMPLETED_RETENTION,
      removeOnFail: 100,
      priority,
      ...(delay > 0 ? { delay } : {}),
      ...(hostnameId
        ? { ordering: { key: hostnameId, rateLimit: { max: 1, duration: rateLimitMs } } }
        : {}),
    },
  )
  if (!job || !job.id) return null
  return waitForCrawlUrlJobResult(job.id, waitTimeoutMs)
}

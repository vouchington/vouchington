import type { CrawlerJobs } from '@queues/crawler/types'
import {
  getRetryCrawlUrlCandidates,
  shouldEnqueueRetryCrawlUrlCandidates,
} from '@services/crawls/retry-candidates'
import type { CrawlUrlOptions } from '@services/crawls/crawl-url/types'
import { computeRateLimitForHostname } from '@services/crawls/hostname-rate-limit'
import { crawlUrl } from '@services/crawls/crawl-url'
import type { CrawlBasic } from '@services/crawls/types'
import { getUrlById } from '@services/urls/get'
import { enqueueBulkCrawlUrls } from '@queues/crawler/enqueues'
import { type Job } from 'glide-mq'
import { CrawlerRateLimitError } from '@modules/on-error/errors'

const MAX_RATE_LIMIT_RETRIES = 3

export async function processCrawlerJob(job: Job): Promise<unknown> {
  switch (job.name as CrawlerJobs) {
    case 'crawl_url': {
      const urlId = job.data?.url_id
      if (!urlId) throw new Error('Crawl URL job .url_id is required')
      const rateLimitRetryCount = job.data?.rate_limit_retry_count ?? 0
      const crawlTimeoutMs =
        typeof job.data?.crawl_timeout_ms === 'number' ? job.data.crawl_timeout_ms : undefined
      const ensureCrawlerForRedirects = job.data?.ensure_crawler_for_redirects === true
      const ignoreRobotsTxt = job.data?.ignore_robots_txt === true
      const maxResponseSizeBytes =
        typeof job.data?.max_response_size_bytes === 'number'
          ? job.data.max_response_size_bytes
          : undefined
      const preserveHttpRedirects = job.data?.preserve_http_redirects === true
      const skipCanonicalUrl = job.data?.skip_canonical_url === true
      const skipChunks = job.data?.skip_chunks === true
      const skipEmbedResolution = job.data?.skip_embed_resolution === true
      const skipCreatedEventsForRedirects = job.data?.skip_created_events_for_redirects === true
      const waitForResult = job.data?.wait_for_result === true
      const priority = typeof job.opts?.priority === 'number' ? job.opts.priority : undefined
      const crawlOptions: CrawlUrlOptions | undefined =
        crawlTimeoutMs != null ||
        ensureCrawlerForRedirects ||
        ignoreRobotsTxt ||
        maxResponseSizeBytes != null ||
        preserveHttpRedirects ||
        skipCanonicalUrl ||
        skipChunks ||
        skipEmbedResolution ||
        skipCreatedEventsForRedirects
          ? {
              ensureCrawlerForRedirects,
              ignoreRobotsTxt,
              preserveHttpRedirects,
              skipCanonicalUrl,
              skipChunks,
              skipEmbedResolution,
              skipCreatedEventsForRedirects,
              ...(crawlTimeoutMs != null ? { timeoutMs: crawlTimeoutMs } : {}),
              ...(maxResponseSizeBytes != null ? { maxResponseSizeBytes } : {}),
            }
          : undefined
      try {
        const crawlResult = await crawlUrl(urlId, 0, new Set(), crawlOptions)
        if (!crawlResult) return null

        /* v8 ignore next -- successful network crawls are covered in crawl-url tests; buildCrawlerJobResult covers worker result shaping. */
        return buildCrawlerJobResult(crawlResult)
      } catch (error) {
        return await handleCrawlerProcessorError(urlId, rateLimitRetryCount, error, {
          crawlTimeoutMs,
          ensureCrawlerForRedirects,
          ignoreRobotsTxt,
          maxResponseSizeBytes,
          preserveHttpRedirects,
          priority,
          skipCanonicalUrl,
          skipChunks,
          skipEmbedResolution,
          skipCreatedEventsForRedirects,
          waitForResult,
        })
      }
    }
    default:
      throw new Error(`Crawler job ${job.name} not found`)
  }
}

export async function handleCrawlerProcessorError(
  urlId: string,
  rateLimitRetryCount: number,
  error: unknown,
  options: {
    crawlTimeoutMs?: number
    ensureCrawlerForRedirects?: boolean
    ignoreRobotsTxt?: boolean
    maxResponseSizeBytes?: number
    preserveHttpRedirects?: boolean
    priority?: number
    skipCanonicalUrl?: boolean
    skipChunks?: boolean
    skipEmbedResolution?: boolean
    skipCreatedEventsForRedirects?: boolean
    waitForResult?: boolean
  } = {},
): Promise<unknown> {
  // Rate-limit errors: never flood the domain with replacement jobs
  if (error instanceof CrawlerRateLimitError) {
    if (error.retryAfterMs != null && rateLimitRetryCount < MAX_RATE_LIMIT_RETRIES) {
      // Re-enqueue original URL with the server-specified delay (circuit-breaker: up to MAX_RATE_LIMIT_RETRIES times)
      const rateLimitedUrl = await getUrlById(urlId)
      if (!rateLimitedUrl) throw error
      const rateLimitMs = await computeRateLimitForHostname(rateLimitedUrl.hostname.id)
      const replacementJobs = await enqueueBulkCrawlUrls(
        [
          {
            urlId,
            options: {
              delay: error.retryAfterMs,
              ...(options.crawlTimeoutMs != null ? { crawlTimeoutMs: options.crawlTimeoutMs } : {}),
              ensureCrawlerForRedirects: options.ensureCrawlerForRedirects,
              ignoreRobotsTxt: options.ignoreRobotsTxt,
              ...(options.maxResponseSizeBytes != null
                ? { maxResponseSizeBytes: options.maxResponseSizeBytes }
                : {}),
              preserveHttpRedirects: options.preserveHttpRedirects,
              skipCanonicalUrl: options.skipCanonicalUrl,
              skipChunks: options.skipChunks,
              skipEmbedResolution: options.skipEmbedResolution,
              skipCreatedEventsForRedirects: options.skipCreatedEventsForRedirects,
              waitForResult: options.waitForResult,
            },
            rateLimitRetryCount: rateLimitRetryCount + 1,
          },
        ],
        {
          hostnameId: rateLimitedUrl.hostname.id,
          ...(options.priority != null ? { priority: options.priority } : {}),
          rateLimitMs,
        },
      )
      const replacementJobId = replacementJobs[0]?.id
      return replacementJobId ? { replacement_job_id: replacementJobId } : undefined
    }
    // No Retry-After or circuit breaker tripped: Valkey lock is already set; let glide-mq retry.
    throw error
  }
  if (shouldEnqueueRetryCrawlUrlCandidates(error)) {
    const retryCandidates = await getRetryCrawlUrlCandidates(urlId)
    if (retryCandidates) {
      await enqueueBulkCrawlUrls(
        retryCandidates.urlIds.map(id => ({ urlId: id })),
        {
          hostnameId: retryCandidates.hostnameId,
          rateLimitMs: retryCandidates.rateLimitMs,
        },
      )
    }
  }
  throw error
}

export function buildCrawlerJobResult(crawlResult: CrawlBasic): {
  url_id: string
  crawl_id: string
  response_status_code: number
} {
  return {
    url_id: crawlResult.url_id,
    crawl_id: crawlResult.id,
    response_status_code: crawlResult.response_status_code,
  }
}

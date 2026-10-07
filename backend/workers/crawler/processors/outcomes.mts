import {
  getRetryCrawlUrlCandidates,
  shouldEnqueueRetryCrawlUrlCandidates,
} from '@services/crawls/retry-candidates'
import { computeRateLimitForHostname } from '@services/crawls/hostname-rate-limit'
import { getUrlById } from '@services/urls/get'
import { enqueueBulkCrawlUrls } from '@queues/crawler/enqueues'
import { CrawlerRateLimitError } from '@modules/on-error/errors'
import type { CrawlBasic } from '@services/crawls/types'

const MAX_RATE_LIMIT_RETRIES = 3

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

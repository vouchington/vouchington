import { searchCrawlerRefreshUrlCandidatesByHostnameId } from '@services/crawlers/refresh'
import { getUrlById } from '@services/urls/get'
import { computeRateLimitForHostname } from './hostname-rate-limit.mts'
import { HttpNoBodyError } from '@vouchington/sentry'
import {
  CrawlerNetworkError,
  CrawlerResponseSizeExceededError,
  CrawlerServerError,
  CrawlerTimeoutError,
} from '@modules/on-error/errors'

import { getRetryCrawlUrlCount } from '@services/crawlers/refresh-limits'

type RetryCrawlUrlsResult = {
  hostnameId: string
  urlIds: string[]
  rateLimitMs: number | undefined
}

/**
 * Find retry candidate URLs from the same hostname as a failed URL.
 * Returns null if no candidates found.
 */
export async function getRetryCrawlUrlCandidates(
  urlId: string,
): Promise<RetryCrawlUrlsResult | null> {
  const url = await getUrlById(urlId)
  if (!url) return null

  const newCandidates = await searchCrawlerRefreshUrlCandidatesByHostnameId(
    url.hostname.id,
    getRetryCrawlUrlCount(),
    {},
    [urlId],
  )
  if (newCandidates.length === 0) return null

  const rateLimitMs = await computeRateLimitForHostname(url.hostname.id)

  return {
    hostnameId: url.hostname.id,
    urlIds: newCandidates.map(c => c.id),
    rateLimitMs,
  }
}

export function shouldEnqueueRetryCrawlUrlCandidates(error: unknown): boolean {
  return (
    error instanceof CrawlerTimeoutError ||
    error instanceof CrawlerNetworkError ||
    error instanceof CrawlerServerError ||
    error instanceof CrawlerResponseSizeExceededError ||
    error instanceof HttpNoBodyError
  )
}

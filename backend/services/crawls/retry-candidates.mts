import { searchCrawlerRefreshUrlCandidatesByHostnameId } from '@services/crawlers/refresh'
import { getUrlById } from '@services/urls/get'
import { computeRateLimitForHostname } from './hostname-rate-limit.mts'
import {
  CrawlerNetworkError,
  CrawlerResponseSizeExceededError,
  CrawlerServerError,
  CrawlerTimeoutError,
  HttpNoBodyError,
} from '@modules/on-error/errors'

const RETRY_CRAWL_URL_COUNT = 3

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
    RETRY_CRAWL_URL_COUNT,
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

import { updateReferralLinkAfterCrawl } from '@services/crawler-referral-links'
import { isCsrEmptyShell } from '@services/crawls/csr-detection'
import type { CrawlBasic } from '@services/crawls/types'
import {
  CrawlerHttpClientError,
  CrawlerRateLimitError,
  CrawlerServerError,
  CrawlerTimeoutError,
  CrawlerNetworkError,
  CrawlerResponseSizeExceededError,
  CrawlerSsrfError,
  HttpNoBodyError,
  CrawlerInvalidContentTypeError,
} from '@modules/on-error/errors'
import onError from '@modules/on-error'
import { enqueueCrawlBrowser } from '@queues/crawl-browser/enqueues'

export async function handleCrawlReferralLinkError(linkId: string, error: unknown): Promise<void> {
  if (error instanceof CrawlerRateLimitError) {
    throw error
  }
  if (error instanceof CrawlerHttpClientError && (error.status === 404 || error.status === 410)) {
    await updateReferralLinkAfterCrawl(linkId, {
      success: false,
      immediateDeactivation: true,
    })
    return
  }

  const isCrawlHealthFailure =
    error instanceof CrawlerHttpClientError ||
    error instanceof CrawlerServerError ||
    error instanceof CrawlerTimeoutError ||
    error instanceof CrawlerNetworkError ||
    error instanceof CrawlerResponseSizeExceededError ||
    error instanceof CrawlerSsrfError ||
    error instanceof CrawlerInvalidContentTypeError ||
    error instanceof HttpNoBodyError
  if (isCrawlHealthFailure) {
    await updateReferralLinkAfterCrawl(linkId, { success: false })
  }
  onError(error instanceof Error ? error : new Error(String(error)))
  if (!isCrawlHealthFailure) throw error
}

export async function handleCrawlReferralLinkResult(
  linkId: string,
  urlId: string,
  crawlerId: string,
  crawlResult: CrawlBasic,
): Promise<void> {
  if (isCsrEmptyShell(crawlResult)) {
    await enqueueCrawlBrowser({ linkId, urlId, crawlerId })
    return
  }

  await updateReferralLinkAfterCrawl(linkId, {
    success: true,
    crawlId: crawlResult.id,
  })
}

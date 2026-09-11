import {
  CrawlerConnectError,
  CrawlerHttpClientError,
  CrawlerInvalidContentTypeError,
  CrawlerNetworkError,
  CrawlerRateLimitError,
  CrawlerResponseSizeExceededError,
  CrawlerServerError,
  CrawlerSsrfError,
  CrawlerTimeoutError,
  HttpNoBodyError,
} from './errors.mts'

export function isExpectedCrawlerOperationalError(error: unknown): boolean {
  return (
    error instanceof CrawlerTimeoutError ||
    error instanceof CrawlerNetworkError ||
    error instanceof CrawlerConnectError ||
    error instanceof CrawlerRateLimitError ||
    error instanceof CrawlerServerError ||
    error instanceof CrawlerResponseSizeExceededError ||
    error instanceof CrawlerHttpClientError ||
    error instanceof CrawlerInvalidContentTypeError ||
    error instanceof CrawlerSsrfError ||
    error instanceof HttpNoBodyError
  )
}

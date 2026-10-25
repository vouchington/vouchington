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
} from './errors.mts'
import { HttpNoBodyError } from '@vouchington/sentry'

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

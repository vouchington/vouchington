import { HttpNoBodyError } from '@vouchington/sentry'
import {
  CrawlerConnectError,
  CrawlerHttpClientError,
  CrawlerNetworkError,
  CrawlerRateLimitError,
  CrawlerResponseSizeExceededError,
  CrawlerServerError,
  CrawlerSsrfError,
  CrawlerTimeoutError,
  isCrawlerNetworkDnsError,
} from '@modules/on-error/errors'

/** Map a failed crawl to its durable status without applying hostname side effects. */
export function getCrawlErrorState(error: unknown): {
  response_status_code: number
  network_error: 'timeout' | 'dns' | 'ssrf' | null
} {
  const known =
    error instanceof CrawlerConnectError ||
    error instanceof CrawlerRateLimitError ||
    error instanceof CrawlerTimeoutError ||
    error instanceof CrawlerNetworkError ||
    error instanceof CrawlerServerError ||
    error instanceof CrawlerResponseSizeExceededError ||
    error instanceof CrawlerHttpClientError ||
    error instanceof CrawlerSsrfError ||
    error instanceof HttpNoBodyError
  let networkError: 'timeout' | 'dns' | 'ssrf' | null = null
  if (error instanceof CrawlerTimeoutError) networkError = 'timeout'
  else if (error instanceof CrawlerNetworkError && isCrawlerNetworkDnsError(error))
    networkError = 'dns'
  else if (error instanceof CrawlerSsrfError) networkError = 'ssrf'
  return { response_status_code: known ? error.status : 500, network_error: networkError }
}

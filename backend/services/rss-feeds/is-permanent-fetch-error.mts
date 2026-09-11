import { CrawlerInvalidContentTypeError, CrawlerHttpClientError } from '@modules/on-error/errors'

/**
 * True when the error indicates the RSS feed URL is permanently broken
 * and should be soft-deleted instead of retried. False for transient
 * errors (5xx, rate limit, timeout, network) which glide-mq will retry.
 */
export function isPermanentRssFetchError(
  error: unknown,
  options: { unreliableStatusCodes?: readonly number[] } = {},
): boolean {
  if (error instanceof CrawlerInvalidContentTypeError) return true
  if (error instanceof CrawlerHttpClientError) {
    return (
      isPermanentHttpStatus(error.status) && !options.unreliableStatusCodes?.includes(error.status)
    )
  }
  // @services/crawler-rss tags parse failures with { tags: { operation: 'parseFeed' } }
  if (isRssParseFeedError(error)) {
    return true
  }
  return false
}

export function isRssParseFeedError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error as { tags?: { operation?: string } }).tags?.operation === 'parseFeed'
  )
}

function isPermanentHttpStatus(status: number): boolean {
  // 408 Request Timeout and 429 Too Many Requests are transient
  if (status === 408 || status === 429) return false
  return status >= 400 && status < 500
}

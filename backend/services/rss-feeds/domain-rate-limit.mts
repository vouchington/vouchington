import { trackDomainRateLimitDeferred, trackDomainRateLimitLocked } from '@services/analytics'
import {
  getDomainRateLimitRemainingMs,
  setDomainRateLimited,
} from '@services/crawls/domain-rate-limit'
import onError from '@modules/on-error'
import { CrawlerRateLimitError } from '@modules/on-error/errors'

export async function assertRssFetchHostnameNotRateLimited(hostnameId: string, feedUrl: string) {
  const remainingMs = await getDomainRateLimitRemainingMs(hostnameId)
  if (remainingMs === null) return

  trackDomainRateLimitDeferred('rss', getFeedUrlHostnameForAnalytics(feedUrl), remainingMs)
  throw new CrawlerRateLimitError(feedUrl, 429, 0, remainingMs)
}

export async function lockRssFetchHostnameOnRateLimit(
  error: unknown,
  hostnameId: string,
  feedUrl: string,
) {
  if (!(error instanceof CrawlerRateLimitError)) return

  try {
    const lockMs = await setDomainRateLimited(hostnameId, error.retryAfterMs ?? undefined)
    trackDomainRateLimitLocked('rss', getFeedUrlHostnameForAnalytics(feedUrl), lockMs)
  } catch (err) {
    /* v8 ignore next 2 -- Valkey remains real in tests; forced client failures would destabilize shared test state. */
    onError(err instanceof Error ? err : new Error(String(err)))
  }
}

function getFeedUrlHostnameForAnalytics(feedUrl: string) {
  try {
    return new URL(feedUrl).hostname
  } catch {
    return feedUrl
  }
}

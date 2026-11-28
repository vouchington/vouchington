import { trackDomainRateLimitDeferred, trackDomainRateLimitLocked } from '@services/analytics'
import {
  getDomainRateLimitRemainingMs,
  normalizeDomainRateLimitMs,
  setDomainRateLimited,
} from '@services/crawls/domain-rate-limit'
import { recordHostnameRateLimitUntil } from '@services/urls-hostnames/rate-limit'
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
): Promise<number | null> {
  if (!(error instanceof CrawlerRateLimitError)) return null

  const fallbackMs = normalizeDomainRateLimitMs(error.retryAfterMs ?? undefined)
  try {
    const lockMs = await setDomainRateLimited(hostnameId, error.retryAfterMs ?? undefined)
    trackDomainRateLimitLocked('rss', getFeedUrlHostnameForAnalytics(feedUrl), lockMs)
    return lockMs
  } catch (err) {
    /* v8 ignore next 2 -- Valkey remains real in tests; forced client failures would destabilize shared test state. */
    onError(err instanceof Error ? err : new Error(String(err)))
    return fallbackMs
  }
}

export async function persistRssFetchHostnameRateLimit(
  hostnameId: string,
  lockMs: number,
): Promise<void> {
  await recordHostnameRateLimitUntil(hostnameId, lockMs).catch(onError)
}

export async function recordDeferredRssFetchRateLimit(
  error: CrawlerRateLimitError,
  hostnameId: string,
): Promise<void> {
  const lockMs = normalizeDomainRateLimitMs(error.retryAfterMs ?? undefined)
  await persistRssFetchHostnameRateLimit(hostnameId, lockMs)
}

function getFeedUrlHostnameForAnalytics(feedUrl: string) {
  try {
    return new URL(feedUrl).hostname
  } catch {
    return feedUrl
  }
}

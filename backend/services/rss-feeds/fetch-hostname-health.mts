import onError from '@modules/on-error'
import { CrawlerNetworkError, CrawlerRateLimitError } from '@modules/on-error/errors'
import { isDnsLookupError, isTlsHostnameMismatchError } from '@vouchington/http-transport/fetch'
import { getUrlHostnameCrawlerDetailsById } from '@services/urls-hostnames'
import {
  recordHostnameConfigurationFailure,
  recordHostnameDnsFailure,
} from '@services/urls-hostnames/dns-failures'
import {
  isHostnameAnsweredError,
  isHostnameNetworkBackoffOpen,
  isHostnameUnreachableError,
  isOutsideHostnameNetworkBackoff,
  recordHostnameNetworkFailure,
  resetHostnameFailures,
} from '@services/urls-hostnames/network-backoff'
import { isRssParseFeedError } from './is-permanent-fetch-error.mts'
import * as rssRateLimit from './domain-rate-limit.mts'
import { resolveFetchOutcomeAction } from '@services/crawls/fetch-outcome'

/**
 * Loads the fetch hostname's network backoff. `isOpen` is a read-only skip check; `claimProbe`
 * claims an expired backoff's single probe and runs only once the feed would actually be fetched.
 */
export async function loadRssFetchHostnameNetworkBackoff(fetchHostnameId: string) {
  const hostname = await getUrlHostnameCrawlerDetailsById(fetchHostnameId)
  return {
    isOpen: hostname ? isHostnameNetworkBackoffOpen(hostname) : false,
    claimProbe: async () => !hostname || (await isOutsideHostnameNetworkBackoff(hostname)),
  }
}

/** A fetched feed proves the hostname resolves and answers. */
export async function recordRssFetchHostnameSuccess(fetchHostnameId: string) {
  await resetHostnameFailures(fetchHostnameId, { crawlerType: 'rss', includeDns: true }).catch(
    onError,
  )
}

/** Records a 429 rate-limit window on the hostname and closes network backoff since the host answered. */
export async function handleRssFetchRateLimitError(
  failure: unknown,
  fetchHostnameId: string,
  feedUrl: string,
): Promise<boolean> {
  if (!(failure instanceof CrawlerRateLimitError)) return false
  const lockMs = await rssRateLimit.lockRssFetchHostnameOnRateLimit(
    failure,
    fetchHostnameId,
    feedUrl,
  )
  const action = resolveFetchOutcomeAction({ kind: 'rate_limited' })
  if (action.recordHostnameRateLimit && lockMs !== null) {
    await Promise.all([
      rssRateLimit.persistRssFetchHostnameRateLimit(fetchHostnameId, lockMs),
      resetHostnameFailures(fetchHostnameId, { crawlerType: 'rss', includeDns: false }).catch(
        onError,
      ),
    ])
  }
  return !action.rethrow
}

/** Preflight rate-limit + network-backoff load; returns null when the Valkey lock defers the job cleanly. */
export async function loadRssFetchPreflightHealth(fetchHostnameId: string, feedUrl: string) {
  try {
    const [, backoff] = await Promise.all([
      rssRateLimit.assertRssFetchHostnameNotRateLimited(fetchHostnameId, feedUrl),
      loadRssFetchHostnameNetworkBackoff(fetchHostnameId),
    ])
    return backoff
  } catch (err) {
    if (err instanceof CrawlerRateLimitError) {
      const action = resolveFetchOutcomeAction({ kind: 'rate_limited' })
      if (action.recordHostnameRateLimit) {
        await rssRateLimit.recordDeferredRssFetchRateLimit(err, fetchHostnameId)
      }
      if (!action.rethrow) return null
    }
    throw err
  }
}

/** Routes a failed fetch to the hostname's DNS/configuration latch or network backoff. */
export async function recordRssFetchHostnameFailure(
  failure: unknown,
  fetchHostnameId: string,
  resolveDnsCanary: (() => Promise<void>) | undefined,
) {
  if (failure instanceof CrawlerNetworkError && isDnsLookupError(failure)) {
    await recordHostnameDnsFailure(fetchHostnameId, resolveDnsCanary).catch(onError)
  }
  if (failure instanceof CrawlerNetworkError && isTlsHostnameMismatchError(failure)) {
    await recordHostnameConfigurationFailure(fetchHostnameId).catch(onError)
  }
  if (isHostnameUnreachableError(failure)) {
    await recordHostnameNetworkFailure(fetchHostnameId, 'rss').catch(onError)
  }
  if (isRssParseFeedError(failure) || isHostnameAnsweredError(failure)) {
    // The hostname answered; a parse failure also proves DNS resolved.
    const includeDns = isRssParseFeedError(failure)
    await resetHostnameFailures(fetchHostnameId, { crawlerType: 'rss', includeDns }).catch(onError)
  }
}

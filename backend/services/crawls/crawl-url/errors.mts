import { HttpNoBodyError } from '@vouchington/sentry'
import {
  CrawlerHttpClientError,
  CrawlerNetworkError,
  CrawlerRateLimitError,
  CrawlerResponseSizeExceededError,
  CrawlerServerError,
  CrawlerSsrfError,
  CrawlerTimeoutError,
  isCrawlerNetworkDnsError,
} from '@modules/on-error/errors'
import onError from '@modules/on-error'
import { trackDomainRateLimitLocked } from '@services/analytics'
import { recordHostnameDnsFailure } from '@services/urls-hostnames/dns-failures'
import {
  isHostnameAnsweredError,
  isHostnameUnreachableError,
  recordHostnameNetworkFailure,
  resetHostnameFailures,
} from '@services/urls-hostnames/network-backoff'
import { updateCrawl } from '../update.mts'
import { getCrawlById } from '../get.mts'
import { safeHostname } from '../crawl-url-utils.mts'
import { setDomainRateLimited } from '../domain-rate-limit.mts'
import type { CrawlHostnameRecord, CrawlUrlDependencies } from './types.mts'

export async function recordCrawlError(params: {
  crawlId: string
  crawlStatusRecorded: boolean
  dependencies?: Partial<CrawlUrlDependencies>
  error: unknown
  hostname: CrawlHostnameRecord
  urlId: string
}) {
  const { crawlId, crawlStatusRecorded, dependencies = {}, error, hostname, urlId } = params
  await lockRateLimitedHostname(error, hostname)
  trackDnsFailure(error, hostname.id, dependencies.resolveDnsCanary)
  await trackNetworkReachability(error, hostname)

  if (!crawlStatusRecorded) {
    const crawl = await getCrawlById(crawlId, urlId)
    if (crawl?.completed_at) return

    await updateCrawl(crawlId, urlId, {
      completed_at: new Date(),
      response_status_code: isCrawlerError(error) ? error.status : 500,
      network_error: getNetworkError(error),
    })
  }
}

async function lockRateLimitedHostname(error: unknown, hostname: CrawlHostnameRecord) {
  if (!(error instanceof CrawlerRateLimitError)) return

  const errorHostname = safeHostname(error.url)
  if (errorHostname && errorHostname !== hostname.hostname) return

  const retryAfterMs = error.retryAfterMs ?? undefined
  try {
    const lockMs = await setDomainRateLimited(hostname.id, retryAfterMs)
    trackDomainRateLimitLocked('html', hostname.hostname, lockMs)
  } catch (err) {
    /* v8 ignore next 2 -- Valkey remains real in tests; forced client failures would destabilize shared test state. */
    const lockWriteError = err instanceof Error ? err : new Error(String(err))
    onError(lockWriteError)
  }
}

function trackDnsFailure(
  error: unknown,
  hostnameId: string,
  resolveCanary: (() => Promise<void>) | undefined,
) {
  if (error instanceof CrawlerNetworkError && isCrawlerNetworkDnsError(error)) {
    // Deliberately not awaited by recordCrawlError: this is a best-effort tracking side effect,
    // not part of the crawl-error recording flow, so it isolates its own errors via `.catch`
    // rather than propagating a promise the (synchronous, fire-and-forget) caller would await.
    // oxlint-disable-next-line promise/no-promise-in-callback
    recordHostnameDnsFailure(hostnameId, resolveCanary).catch(onError)
  }
}

// Awaited so the backoff state is settled before the job retries; failures stay best-effort.
async function trackNetworkReachability(error: unknown, hostname: CrawlHostnameRecord) {
  try {
    if (isHostnameAnsweredError(error)) {
      await resetHostnameFailures(hostname.id, { crawlerType: 'html', includeDns: false })
      return
    }
    if (!isHostnameUnreachableError(error)) return
    // A failure on a redirect target says nothing about the source hostname.
    const errorHostname = safeHostname(error.url)
    if (errorHostname && errorHostname !== hostname.hostname) return
    await recordHostnameNetworkFailure(hostname.id, 'html')
  } catch (err) {
    onError(err instanceof Error ? err : new Error(String(err)))
  }
}

function isCrawlerError(error: unknown) {
  return (
    error instanceof CrawlerRateLimitError ||
    error instanceof CrawlerTimeoutError ||
    error instanceof CrawlerNetworkError ||
    error instanceof CrawlerServerError ||
    error instanceof CrawlerResponseSizeExceededError ||
    error instanceof CrawlerHttpClientError ||
    error instanceof CrawlerSsrfError ||
    error instanceof HttpNoBodyError
  )
}

function getNetworkError(error: unknown) {
  if (error instanceof CrawlerTimeoutError) return 'timeout'
  if (error instanceof CrawlerNetworkError && isCrawlerNetworkDnsError(error)) return 'dns'
  if (error instanceof CrawlerSsrfError) return 'ssrf'
  return null
}

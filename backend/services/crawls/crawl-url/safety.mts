import { validateUrl, UnsafeUrlError, type ResolvedSafeAddress } from 'ssrf-guard/node'
import {
  CrawlerNetworkError,
  CrawlerSsrfError,
  CrawlerTimeoutError,
} from '@modules/on-error/errors'
import { isTimeoutError } from '@modules/utils/http'

// ssrf-guard@1.0.0's validateUrl short-circuits to no timeout when both `signal` and `timeoutMs`
// are undefined, so a caller that passes no `timeoutMs` must still get a bounded DNS/SSRF
// resolution phase — hence a default applied here, not a raw pass-through of `options?.timeoutMs`.
const DEFAULT_DNS_TIMEOUT_MS = 5000

type ResolveSafeCrawlerAddressesDependencies = {
  validateUrl: typeof validateUrl
  unsafeUrlError: typeof UnsafeUrlError
}

const defaultDependencies: ResolveSafeCrawlerAddressesDependencies = {
  validateUrl,
  unsafeUrlError: UnsafeUrlError,
}

export interface ResolveSafeCrawlerAddressesOptions {
  /** DNS/SSRF resolution timeout in milliseconds. Default: 5000 (5 seconds). */
  timeoutMs?: number
  dependencies?: Partial<ResolveSafeCrawlerAddressesDependencies>
}

/** Resolves and SSRF-validates a URL's addresses under a bounded DNS-resolution timeout. */
export async function resolveSafeCrawlerAddresses(
  url: string,
  options?: ResolveSafeCrawlerAddressesOptions,
): Promise<ResolvedSafeAddress[]> {
  const dependencies = { ...defaultDependencies, ...options?.dependencies }
  const timeoutMs = options?.timeoutMs ?? DEFAULT_DNS_TIMEOUT_MS
  const startedAt = Date.now()
  try {
    return await dependencies.validateUrl(url, { timeoutMs })
  } catch (ssrfError) {
    const duration = Date.now() - startedAt
    if (ssrfError instanceof dependencies.unsafeUrlError) {
      throw new CrawlerSsrfError(url, ssrfError.reason)
    }
    // ssrf-guard rejects a DNS timeout with an Error named `AbortError` whose message is "DNS
    // lookup for … timed out after Nms" — it contains no ENOTFOUND/getaddrinfo/DNS_NULL_ROUTE
    // substring, so the generic CrawlerNetworkError fallback below would misrecord it as
    // network_error: null instead of 'timeout'. Must be checked before that fallback.
    if (isTimeoutError(ssrfError)) {
      throw new CrawlerTimeoutError(url, timeoutMs, duration, ssrfError)
    }
    throw new CrawlerNetworkError(
      url,
      duration,
      ssrfError instanceof Error ? ssrfError : new Error(String(ssrfError)),
    )
  }
}

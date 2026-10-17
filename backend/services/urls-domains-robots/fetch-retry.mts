import { setTimeout as delay } from 'node:timers/promises'
import {
  cancelResponseBody,
  fetchWithTimeout,
  fetchWithTimeoutSimple,
  isNetworkError,
  isRetryableError,
  readResponseBody,
} from '@modules/utils/http'
import { HttpResponseSizeError } from '@modules/on-error/errors'
import { UnsafeUrlError, validateUrl } from 'ssrf-guard/node'
import { checkDomainBlacklisted } from './check-domain-blacklisted.mts'
import {
  fetchPinnedRobotsTxt,
  RobotsUnsafeTargetError,
  type PinnedRobotsFetchDependencies,
} from './fetch-pinned.mts'

export const DISALLOW_ROBOTS_TXT = 'User-agent: *\nDisallow: /'
const ALLOW_ROBOTS_TXT = 'User-agent: *\nAllow: /'
const FETCH_TIMEOUT_MS = 10000 // 10 seconds
const MAX_ROBOTS_TXT_BYTES = 512 * 1024
const MAX_RETRIES = 3
const RETRY_DELAY_MS = 1000 // 1 second

/** `rules` and `unavailable` are cacheable decisions. `unreachable` must not use that cache. */
export type RobotsFetchKind = 'rules' | 'unavailable' | 'unreachable'

export type RobotsFetchOutcome = {
  body: string
  kind: RobotsFetchKind
}

export type RobotsDependencies = PinnedRobotsFetchDependencies & {
  fetchWithTimeoutSimple: typeof fetchWithTimeoutSimple
  readResponseBody: typeof readResponseBody
  isNetworkError: typeof isNetworkError
  isRetryableError: typeof isRetryableError
  checkDomainBlacklisted: typeof checkDomainBlacklisted
  retryDelayMs: number
}

export const defaultRobotsDependencies: RobotsDependencies = {
  fetchWithTimeoutSimple,
  readResponseBody,
  isNetworkError,
  isRetryableError,
  checkDomainBlacklisted,
  validateUrl,
  fetchWithTimeout,
  unsafeUrlError: UnsafeUrlError,
  cancelResponseBody,
  retryDelayMs: RETRY_DELAY_MS,
}

export async function fetchRobotsTxtOutcome(
  domain: string,
  dependencyOverrides: Partial<RobotsDependencies> = {},
): Promise<RobotsFetchOutcome> {
  const dependencies = { ...defaultRobotsDependencies, ...dependencyOverrides }
  if (await dependencies.checkDomainBlacklisted(domain)) {
    return robotsOutcome('rules', DISALLOW_ROBOTS_TXT)
  }
  return fetchRobotsTxtWithRetryOutcome(domain, dependencies)
}

/** @internal Body-only retry entrypoint for transport tests. */
export async function fetchRobotsTxtWithRetry(
  domain: string,
  dependencies: RobotsDependencies,
): Promise<string> {
  const outcome = await fetchRobotsTxtWithRetryOutcome(domain, dependencies)
  return outcome.body
}

export async function fetchRobotsTxtWithRetryOutcome(
  domain: string,
  dependencies: RobotsDependencies,
): Promise<RobotsFetchOutcome> {
  const url = `https://${domain}/robots.txt`
  let lastStatus: number | undefined

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- each retry request waits for the previous attempt's outcome
      const fetched = await fetchRobotsResponse(url, dependencies)
      const response = fetched.response
      const bodySignal = fetched.bodySignal
      lastStatus = response.status

      if (response.status >= 200 && response.status < 300) {
        if (!response.body) return robotsOutcome('rules', ALLOW_ROBOTS_TXT)
        try {
          // oxlint-disable-next-line no-await-in-loop -- body consumption belongs to the current retry response
          const body = await dependencies.readResponseBody({
            response,
            url,
            maxSizeBytes: MAX_ROBOTS_TXT_BYTES,
            signal: bodySignal,
          })
          return robotsOutcome('rules', body)
        } catch (err) {
          if (err instanceof HttpResponseSizeError) return robotsOutcome('rules', ALLOW_ROBOTS_TXT)
          throw err
        }
      }

      // Status fallbacks do not read the body. Cancel it first: bodySignal reaches Undici only
      // through readResponseBody, and an ignored body would hold the pinned connection until the
      // dispatcher body timeout.
      releaseUnreadRobotsBody(response, dependencies)
      if (response.status >= 400 && response.status < 500) {
        // RFC 9309 unavailable, including 429: the crawler may access the resources.
        return robotsOutcome('unavailable', ALLOW_ROBOTS_TXT)
      }

      if (response.status >= 500 && response.status < 600) {
        if (attempt < MAX_RETRIES) {
          // oxlint-disable-next-line no-await-in-loop -- server retry backoff must finish before the next request
          await delay(dependencies.retryDelayMs)
          continue
        }
        break
      }
      const status = response.status ?? lastStatus ?? 'unknown'
      const statusText = response.statusText || ''
      throw new Error(
        `Failed to fetch robots.txt for ${domain}: ${status}${statusText ? ` ${statusText}` : ''}`,
      )
    } catch (err) {
      if (err instanceof RobotsUnsafeTargetError) return robotsOutcome('rules', DISALLOW_ROBOTS_TXT)

      if (dependencies.isNetworkError(err)) {
        if (attempt < MAX_RETRIES) {
          // oxlint-disable-next-line no-await-in-loop -- network retry backoff must finish before the next request
          await delay(dependencies.retryDelayMs)
          continue
        }
        // RFC 9309 unreachable: a network failure is complete disallow, not an allow-all.
        return robotsOutcome('unreachable', DISALLOW_ROBOTS_TXT)
      }

      if (dependencies.isRetryableError(err, lastStatus) && attempt < MAX_RETRIES) {
        // oxlint-disable-next-line no-await-in-loop -- retryable-error backoff must finish before the next request
        await delay(dependencies.retryDelayMs)
        continue
      }

      throw err
    }
  }

  // RFC 9309 unreachable: exhausted HTTP 5xx is complete disallow, not an allow-all.
  return robotsOutcome('unreachable', DISALLOW_ROBOTS_TXT)
}

function robotsOutcome(kind: RobotsFetchKind, body: string): RobotsFetchOutcome {
  return { body, kind }
}

function fetchRobotsResponse(
  url: string,
  dependencies: RobotsDependencies,
): Promise<{ response: Response; bodySignal?: AbortSignal }> {
  if (dependencies.fetchWithTimeoutSimple !== defaultRobotsDependencies.fetchWithTimeoutSimple) {
    return plainRobotsResponse(dependencies.fetchWithTimeoutSimple(url, FETCH_TIMEOUT_MS))
  }
  // Crawl tests replace this integration fetch and then select dirty-database hostnames.
  // Pinning behind that replacement resolves those names for real. A Vitest mock carries
  // `mock.calls`; the production function does not, so a rename still pins.
  if (integrationFetchWasReplaced(fetchWithTimeoutSimple)) {
    return plainRobotsResponse(fetchWithTimeoutSimple(url, FETCH_TIMEOUT_MS))
  }
  return fetchPinnedRobotsTxt(url, FETCH_TIMEOUT_MS, dependencies)
}

function releaseUnreadRobotsBody(response: Response, dependencies: RobotsDependencies): void {
  dependencies.cancelResponseBody(response)
}

function plainRobotsResponse(
  pending: Promise<Response>,
): Promise<{ response: Response; bodySignal?: AbortSignal }> {
  return pending.then(response => ({ response }))
}

function integrationFetchWasReplaced(fetchImpl: unknown): boolean {
  if (typeof fetchImpl !== 'function' || !('mock' in fetchImpl)) return false
  const mockState = fetchImpl.mock
  return typeof mockState === 'object' && mockState !== null && 'calls' in mockState
}

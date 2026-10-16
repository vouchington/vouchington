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

export type RobotsDependencies = PinnedRobotsFetchDependencies & {
  fetchWithTimeoutSimple: typeof fetchWithTimeoutSimple
  readResponseBody: typeof readResponseBody
  isNetworkError: typeof isNetworkError
  isRetryableError: typeof isRetryableError
  checkDomainBlacklisted: typeof checkDomainBlacklisted
}

export const defaultRobotsDependencies: RobotsDependencies = {
  fetchWithTimeoutSimple: (url, timeoutMs) =>
    fetchPinnedRobotsTxt(url, timeoutMs, defaultRobotsDependencies),
  readResponseBody,
  isNetworkError,
  isRetryableError,
  checkDomainBlacklisted,
  validateUrl,
  fetchWithTimeout,
  unsafeUrlError: UnsafeUrlError,
  cancelResponseBody,
}

export async function fetchRobotsTxtWithRetry(
  domain: string,
  dependencies: RobotsDependencies,
): Promise<string> {
  const url = `https://${domain}/robots.txt`
  let lastStatus: number | undefined

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- each retry request waits for the previous attempt's outcome
      const response = await fetchRobotsResponse(url, dependencies)
      lastStatus = response.status

      if (response.status >= 200 && response.status < 300) {
        if (!response.body) return ALLOW_ROBOTS_TXT
        try {
          // oxlint-disable-next-line no-await-in-loop -- body consumption belongs to the current retry response
          return await dependencies.readResponseBody({
            response,
            url,
            maxSizeBytes: MAX_ROBOTS_TXT_BYTES,
          })
        } catch (err) {
          if (err instanceof HttpResponseSizeError) return ALLOW_ROBOTS_TXT
          throw err
        }
      }

      if (response.status >= 400 && response.status < 500) {
        return ALLOW_ROBOTS_TXT
      }

      if (response.status >= 500 && response.status < 600) {
        if (attempt < MAX_RETRIES) {
          // oxlint-disable-next-line no-await-in-loop -- server retry backoff must finish before the next request
          await delay(RETRY_DELAY_MS)
          continue
        }
        return ALLOW_ROBOTS_TXT
      }
      const status = response.status ?? lastStatus ?? 'unknown'
      const statusText = response.statusText || ''
      throw new Error(
        `Failed to fetch robots.txt for ${domain}: ${status}${statusText ? ` ${statusText}` : ''}`,
      )
    } catch (err) {
      if (err instanceof RobotsUnsafeTargetError) return DISALLOW_ROBOTS_TXT

      if (dependencies.isNetworkError(err)) {
        if (attempt < MAX_RETRIES) {
          // oxlint-disable-next-line no-await-in-loop -- network retry backoff must finish before the next request
          await delay(RETRY_DELAY_MS)
          continue
        }
        return ALLOW_ROBOTS_TXT
      }

      if (dependencies.isRetryableError(err, lastStatus) && attempt < MAX_RETRIES) {
        // oxlint-disable-next-line no-await-in-loop -- retryable-error backoff must finish before the next request
        await delay(RETRY_DELAY_MS)
        continue
      }

      throw err
    }
  }

  return ALLOW_ROBOTS_TXT
}

function fetchRobotsResponse(url: string, dependencies: RobotsDependencies): Promise<Response> {
  if (dependencies.fetchWithTimeoutSimple === defaultRobotsDependencies.fetchWithTimeoutSimple) {
    return fetchPinnedRobotsTxt(url, FETCH_TIMEOUT_MS, dependencies)
  }
  return dependencies.fetchWithTimeoutSimple(url, FETCH_TIMEOUT_MS)
}

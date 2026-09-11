import { ValkeyCache } from '@data-stores/valkey/cache'
import { setTimeout as delay } from 'node:timers/promises'
import {
  isNetworkError,
  isRetryableError,
  fetchWithTimeoutSimple,
  readResponseBody,
} from '@modules/utils/http'
import { HttpResponseSizeError } from '@modules/on-error/errors'
import { parseRobotsTxt } from '@vouchington/robots'
import { checkDomainBlacklisted } from './check-domain-blacklisted.mts'

export { checkDomainBlacklisted }

const cache = new ValkeyCache({
  prefix: 'urls-domains-robots',
  ttlSeconds: 60 * 60 * 24,
})

const DISALLOW_ROBOTS_TXT = 'User-agent: *\nDisallow: /'
const ALLOW_ROBOTS_TXT = 'User-agent: *\nAllow: /'
const FETCH_TIMEOUT_MS = 10000 // 10 seconds
const MAX_ROBOTS_TXT_BYTES = 512 * 1024
const MAX_RETRIES = 3
const RETRY_DELAY_MS = 1000 // 1 second

type RobotsDependencies = {
  fetchWithTimeoutSimple: typeof fetchWithTimeoutSimple
  readResponseBody: typeof readResponseBody
  isNetworkError: typeof isNetworkError
  isRetryableError: typeof isRetryableError
}

const defaultDependencies: RobotsDependencies = {
  fetchWithTimeoutSimple,
  readResponseBody,
  isNetworkError,
  isRetryableError,
}

const fetchRobotsTxtWithRetry = async (
  domain: string,
  dependencies: RobotsDependencies,
): Promise<string> => {
  const url = `https://${domain}/robots.txt`
  let lastStatus: number | undefined

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- each retry request waits for the previous attempt's outcome
      const response = await dependencies.fetchWithTimeoutSimple(url, FETCH_TIMEOUT_MS)
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
        } catch (error) {
          if (error instanceof HttpResponseSizeError) return ALLOW_ROBOTS_TXT
          throw error
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
    } catch (error) {
      if (dependencies.isNetworkError(error)) {
        if (attempt < MAX_RETRIES) {
          // oxlint-disable-next-line no-await-in-loop -- network retry backoff must finish before the next request
          await delay(RETRY_DELAY_MS)
          continue
        }
        return ALLOW_ROBOTS_TXT
      }

      if (dependencies.isRetryableError(error, lastStatus) && attempt < MAX_RETRIES) {
        // oxlint-disable-next-line no-await-in-loop -- retryable-error backoff must finish before the next request
        await delay(RETRY_DELAY_MS)
        continue
      }

      throw error
    }
  }

  return ALLOW_ROBOTS_TXT
}

export const fetchRobotsTxt = async (
  domain: string,
  dependencyOverrides: Partial<RobotsDependencies> = {},
): Promise<string> => {
  const dependencies = { ...defaultDependencies, ...dependencyOverrides }
  const isBlacklisted = await checkDomainBlacklisted(domain)

  if (isBlacklisted) {
    return DISALLOW_ROBOTS_TXT
  }

  return await fetchRobotsTxtWithRetry(domain, dependencies)
}

export const fetchRobotsTxtCached = cache.cacheGetByAny(fetchRobotsTxt)

async function getParsedRobots(
  domain: string,
  dependencyOverrides: Partial<RobotsDependencies> = {},
) {
  const robotsTxtUrl = `https://${domain}/robots.txt`
  const robotsTxt =
    Object.keys(dependencyOverrides).length > 0
      ? await fetchRobotsTxt(domain, dependencyOverrides)
      : await fetchRobotsTxtCached(domain)
  return parseRobotsTxt(robotsTxtUrl, robotsTxt)
}

export const isUrlCrawlable = async (
  url: string,
  userAgent: string,
  options?: { ignoreRobotsRules?: boolean; dependencies?: Partial<RobotsDependencies> },
): Promise<boolean> => {
  const domain = new URL(url).hostname
  if (options?.ignoreRobotsRules) {
    // Skip robots.txt allow/disallow rules but still enforce operator hard-blocks
    return !(await checkDomainBlacklisted(domain))
  }
  const parser = await getParsedRobots(domain, options?.dependencies)
  return parser.isAllowed(url, userAgent) ?? false
}

export async function computeHostnameRateLimitMs(
  hostname: string,
  requestsPerSecondLimit: number | null,
  userAgent: string,
  dependencyOverrides: Partial<RobotsDependencies> = {},
): Promise<number> {
  const rpsDelay =
    requestsPerSecondLimit != null && requestsPerSecondLimit > 0
      ? Math.ceil(1000 / requestsPerSecondLimit)
      : 1_000
  const crawlDelayMs = await getCrawlDelayMs(hostname, userAgent, dependencyOverrides)
  const MAX_RATE_LIMIT_MS = 60_000
  return Math.min(MAX_RATE_LIMIT_MS, Math.max(rpsDelay, crawlDelayMs ?? 0))
}

async function getCrawlDelayMs(
  domain: string,
  userAgent: string,
  dependencyOverrides: Partial<RobotsDependencies>,
): Promise<number | null> {
  const parser = await getParsedRobots(domain, dependencyOverrides)
  const crawlDelay = parser.getCrawlDelay(userAgent)
  return crawlDelay != null ? Math.ceil(crawlDelay * 1000) : null
}

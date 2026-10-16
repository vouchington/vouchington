import { ValkeyCache } from '@data-stores/valkey/cache'
import { parseRobotsTxt } from '@vouchington/robots'
import { checkDomainBlacklisted } from './check-domain-blacklisted.mts'
import {
  defaultRobotsDependencies,
  DISALLOW_ROBOTS_TXT,
  fetchRobotsTxtWithRetry,
  type RobotsDependencies,
} from './fetch-retry.mts'

export { checkDomainBlacklisted }

const cache = new ValkeyCache({
  prefix: 'urls-domains-robots',
  ttlSeconds: 60 * 60 * 24,
})

export const fetchRobotsTxt = async (
  domain: string,
  dependencyOverrides: Partial<RobotsDependencies> = {},
): Promise<string> => {
  const dependencies = { ...defaultRobotsDependencies, ...dependencyOverrides }
  const isBlacklisted = await dependencies.checkDomainBlacklisted(domain)

  if (isBlacklisted) {
    return DISALLOW_ROBOTS_TXT
  }

  return fetchRobotsTxtWithRetry(domain, dependencies)
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
  return parser.isAllowed(url, robotsUserAgentToken(userAgent)) ?? false
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
  const crawlDelay = parser.getCrawlDelay(robotsUserAgentToken(userAgent))
  return crawlDelay != null ? Math.ceil(crawlDelay * 1000) : null
}

/** RFC 9309 product token: the first User-Agent token, without a `/version` suffix. */
function robotsUserAgentToken(userAgent: string): string {
  const firstToken = userAgent.trim().split(/[ \t]+/, 1)[0] ?? ''
  const slashIndex = firstToken.indexOf('/')
  const token = (slashIndex === -1 ? firstToken : firstToken.slice(0, slashIndex)).trim()
  return token || '*'
}

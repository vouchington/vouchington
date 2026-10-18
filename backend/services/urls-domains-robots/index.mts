import {
  parseRobotsTxt,
  robotsProductToken,
  computeCrawlIntervalMs,
  getCrawlDelayMilliseconds,
} from '@vouchington/robots'
import { checkDomainBlacklisted } from './check-domain-blacklisted.mts'
import { fetchRobotsTxtCached } from './fetch-cache.mts'
import { fetchRobotsTxtOutcome, type RobotsDependencies } from './fetch-retry.mts'

export { checkDomainBlacklisted }
export { fetchRobotsTxtCached }
/** @internal Cache identities exposed for real-Valkey tests. */
export {
  ROBOTS_RULES_CACHE_PREFIX,
  ROBOTS_UNREACHABLE_CACHE_PREFIX,
  ROBOTS_UNREACHABLE_MARKER,
} from './fetch-cache.mts'

export const fetchRobotsTxt = async (
  domain: string,
  dependencyOverrides: Partial<RobotsDependencies> = {},
): Promise<string> => {
  const outcome = await fetchRobotsTxtOutcome(domain, dependencyOverrides)
  return outcome.body
}

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
  return parser.isAllowed(url, robotsProductToken(userAgent)) ?? false
}

export async function computeHostnameRateLimitMs(
  hostname: string,
  requestsPerSecondLimit: number | null,
  userAgent: string,
  dependencyOverrides: Partial<RobotsDependencies> = {},
): Promise<number> {
  return computeCrawlIntervalMs({
    requestsPerSecond: requestsPerSecondLimit,
    crawlDelayMs: await getCrawlDelayMs(hostname, userAgent, dependencyOverrides),
    defaultIntervalMs: 1_000,
    maxIntervalMs: 60_000,
  })
}

async function getCrawlDelayMs(
  domain: string,
  userAgent: string,
  dependencyOverrides: Partial<RobotsDependencies>,
): Promise<number | null> {
  const parser = await getParsedRobots(domain, dependencyOverrides)
  const crawlDelay = parser.getCrawlDelay(robotsProductToken(userAgent))
  return getCrawlDelayMilliseconds(crawlDelay)
}

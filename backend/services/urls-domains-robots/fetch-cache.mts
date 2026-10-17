import { ValkeyCache } from '@data-stores/valkey/cache'
import onError from '@modules/on-error'
import {
  DISALLOW_ROBOTS_TXT,
  fetchRobotsTxtOutcome,
  type RobotsDependencies,
} from './fetch-retry.mts'

export const ROBOTS_RULES_CACHE_PREFIX = 'urls-domains-robots'
export const ROBOTS_UNREACHABLE_CACHE_PREFIX = 'urls-domains-robots-unreachable'
export const ROBOTS_UNREACHABLE_MARKER = 'unreachable'
const RULES_TTL_SECONDS = 60 * 60 * 24
const UNREACHABLE_TTL_SECONDS = 15 * 60

const rulesCache = new ValkeyCache({
  prefix: ROBOTS_RULES_CACHE_PREFIX,
  ttlSeconds: RULES_TTL_SECONDS,
})

const unreachableCache = new ValkeyCache({
  prefix: ROBOTS_UNREACHABLE_CACHE_PREFIX,
  ttlSeconds: UNREACHABLE_TTL_SECONDS,
})

export async function fetchRobotsTxtCached(
  domain: string,
  dependencyOverrides: Partial<RobotsDependencies> = {},
): Promise<string> {
  const cachedRules = await readRobotsCache(rulesCache, domain)
  if (typeof cachedRules === 'string') return cachedRules
  if ((await readRobotsCache(unreachableCache, domain)) === ROBOTS_UNREACHABLE_MARKER) {
    return DISALLOW_ROBOTS_TXT
  }

  const outcome = await fetchRobotsTxtOutcome(domain, dependencyOverrides)
  if (outcome.kind !== 'unreachable') {
    await rulesCache.set(domain, outcome.body)
    return outcome.body
  }

  // A peer may have stored a real robots.txt body while this fetch was retrying.
  const racedRules = await readRobotsCache(rulesCache, domain)
  if (typeof racedRules === 'string') return racedRules
  await unreachableCache.set(domain, ROBOTS_UNREACHABLE_MARKER, UNREACHABLE_TTL_SECONDS)
  return outcome.body
}

async function readRobotsCache(cache: ValkeyCache, domain: string): Promise<unknown> {
  try {
    return await cache.get(domain)
  } catch (err) {
    onError(err instanceof Error ? err : new Error(String(err)))
    return null
  }
}

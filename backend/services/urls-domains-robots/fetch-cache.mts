import { multiCacheGetByAnyBatch, ValkeyCache } from '@data-stores/valkey/cache'
import onError from '@modules/on-error'
import {
  DISALLOW_ROBOTS_TXT,
  fetchRobotsTxtOutcome,
  type RobotsDependencies,
} from './fetch-retry.mts'

const ROBOTS_RULES_CACHE_PREFIX = 'urls-domains-robots'
const ROBOTS_UNREACHABLE_CACHE_PREFIX = 'urls-domains-robots-unreachable'
const ROBOTS_UNREACHABLE_MARKER = 'unreachable'
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
  const cached = await readRobotsCaches(domain)
  if (typeof cached.rules === 'string') return cached.rules
  if (cached.unreachable === ROBOTS_UNREACHABLE_MARKER) return DISALLOW_ROBOTS_TXT

  const outcome = await fetchRobotsTxtOutcome(domain, dependencyOverrides)
  if (outcome.kind !== 'unreachable') {
    await rulesCache.set(domain, outcome.body)
    return outcome.body
  }

  // A peer may have stored a real robots.txt body while this fetch was retrying.
  const raced = await readRobotsCaches(domain)
  if (typeof raced.rules === 'string') return raced.rules
  await unreachableCache.set(domain, ROBOTS_UNREACHABLE_MARKER, UNREACHABLE_TTL_SECONDS)
  return outcome.body
}

// Both keys hash on `{domain}`, so one MGET stays in a single cluster slot and returns the
// rules body together with the unreachable marker.
async function readRobotsCaches(domain: string): Promise<{ rules: unknown; unreachable: unknown }> {
  try {
    const [rules, unreachable] = await multiCacheGetByAnyBatch([
      { cache: rulesCache, keys: [domain] },
      { cache: unreachableCache, keys: [domain] },
    ])
    return { rules: rules[0], unreachable: unreachable[0] }
  } catch (err) {
    onError(err instanceof Error ? err : new Error(String(err)))
    return { rules: null, unreachable: null }
  }
}

import { DynamicConfig } from '@data-stores/valkey'
import type { RouteRateLimitCategory, RouteRateLimitEntry } from './types.mts'
import { ROUTE_REGISTRY } from './registry.mts'

export { ROUTE_REGISTRY } from './registry.mts'

export const ANON_ROUTE_RATE_LIMIT_DEFAULTS = {
  thresholds: {
    read: 180,
    write: 15,
    sensitive: 5,
    oauth_callback: 300,
  } satisfies Record<RouteRateLimitCategory, number>,
  ttlSeconds: 60,
  attestedMultiplier: 1,
} as const

/**
 * Runtime-tunable configuration for per-route rate limiting.
 * Use the Dynamic Config admin API namespace route-rate-limit-config to update these fields at runtime.
 * Changes take effect immediately via Valkey pub/sub — no deploy required.
 */
export const ROUTE_RATE_LIMIT_CONFIG_KEY = 'route-rate-limit-config'
export const ROUTE_RATE_LIMIT_ENABLED_DEFAULT = true
export const ACTIVITYPUB_INBOX_LIMITS = {
  attemptMaxRequests: { min: 1, max: 10_000 },
  attemptWindowSeconds: { min: 1, max: 3_600 },
  maxRequests: { min: 1, max: 10_000 },
  windowSeconds: { min: 1, max: 3_600 },
} as const
const ATTESTED_MULTIPLIER_LIMITS = { min: 1, max: 100 } as const

export const routeRateLimitConfig = new DynamicConfig({
  key: ROUTE_RATE_LIMIT_CONFIG_KEY,
  fieldTypes: {
    enabled: 'boolean',
    // Anonymous thresholds per category
    anon_read: 'number',
    anon_write: 'number',
    anon_sensitive: 'number',
    anon_oauth_callback: 'number',
    // Anonymous TTLs per category (seconds)
    anon_read_ttl: 'number',
    anon_write_ttl: 'number',
    anon_sensitive_ttl: 'number',
    anon_oauth_callback_ttl: 'number',
    // Attested device multiplier
    attested_multiplier: 'number',
    // ActivityPub inbox attempts per source IP, before signature verification
    activitypub_inbox_attempt_max_requests: 'number',
    activitypub_inbox_attempt_window_seconds: 'number',
    // Signature-authenticated ActivityPub inbox deliveries per sender hostname
    activitypub_inbox_max_requests: 'number',
    activitypub_inbox_window_seconds: 'number',
  },
  defaultFields: {
    enabled: ROUTE_RATE_LIMIT_ENABLED_DEFAULT,
    anon_read: ANON_ROUTE_RATE_LIMIT_DEFAULTS.thresholds.read,
    anon_write: ANON_ROUTE_RATE_LIMIT_DEFAULTS.thresholds.write,
    anon_sensitive: ANON_ROUTE_RATE_LIMIT_DEFAULTS.thresholds.sensitive,
    anon_oauth_callback: ANON_ROUTE_RATE_LIMIT_DEFAULTS.thresholds.oauth_callback,
    anon_read_ttl: ANON_ROUTE_RATE_LIMIT_DEFAULTS.ttlSeconds,
    anon_write_ttl: ANON_ROUTE_RATE_LIMIT_DEFAULTS.ttlSeconds,
    anon_sensitive_ttl: ANON_ROUTE_RATE_LIMIT_DEFAULTS.ttlSeconds,
    anon_oauth_callback_ttl: ANON_ROUTE_RATE_LIMIT_DEFAULTS.ttlSeconds,
    attested_multiplier: ANON_ROUTE_RATE_LIMIT_DEFAULTS.attestedMultiplier,
    activitypub_inbox_attempt_max_requests: 300,
    activitypub_inbox_attempt_window_seconds: 60,
    activitypub_inbox_max_requests: 60,
    activitypub_inbox_window_seconds: 60,
  },
})

export function getRouteConfig(routeKey: string): RouteRateLimitEntry {
  if (routeKey in ROUTE_REGISTRY) {
    return ROUTE_REGISTRY[routeKey]
  }

  // Infer category from HTTP method
  const method = routeKey.split(':')[0] ?? 'GET'
  const category: RouteRateLimitCategory =
    method === 'GET' || method === 'HEAD' || method === 'OPTIONS' ? 'read' : 'write'
  return { category }
}

/**
 * Get anonymous threshold for a category from DynamicConfig.
 */
export function getAnonThreshold(category: RouteRateLimitCategory): number {
  const key = `anon_${category}`
  const value = routeRateLimitConfig.getFields()[key]
  return isPositiveSafeInteger(value) ? value : ANON_ROUTE_RATE_LIMIT_DEFAULTS.thresholds[category]
}

/**
 * Get anonymous TTL for a category from DynamicConfig.
 */
export function getAnonTtl(category: RouteRateLimitCategory): number {
  const key = `anon_${category}_ttl`
  const value = routeRateLimitConfig.getFields()[key]
  return isPositiveSafeInteger(value) ? value : ANON_ROUTE_RATE_LIMIT_DEFAULTS.ttlSeconds
}

/**
 * Get the rate limit threshold multiplier applied to attested (Apple App Attest) devices.
 */
export function getAttestedMultiplier(): number {
  const value = routeRateLimitConfig.getFields().attested_multiplier
  return isFiniteNumberInRange(value, ATTESTED_MULTIPLIER_LIMITS)
    ? value
    : ANON_ROUTE_RATE_LIMIT_DEFAULTS.attestedMultiplier
}

export function isRouteRateLimitEnabled(): boolean {
  // Playwright tests set PLAYWRIGHT_TEST=true on the backend process — skip rate limiting
  // to avoid 429s from parallel workers before pub/sub propagation completes.
  if (process.env.PLAYWRIGHT_TEST === 'true') return false
  const value = routeRateLimitConfig.getFields().enabled
  return typeof value === 'boolean' ? value : ROUTE_RATE_LIMIT_ENABLED_DEFAULT
}

export function getActivityPubInboxAttemptMaxRequests(): number {
  const value = routeRateLimitConfig.getFields().activitypub_inbox_attempt_max_requests
  return isSafeIntegerInRange(value, ACTIVITYPUB_INBOX_LIMITS.attemptMaxRequests) ? value : 300
}

export function getActivityPubInboxAttemptWindowSeconds(): number {
  const value = routeRateLimitConfig.getFields().activitypub_inbox_attempt_window_seconds
  return isSafeIntegerInRange(value, ACTIVITYPUB_INBOX_LIMITS.attemptWindowSeconds) ? value : 60
}

export function getActivityPubInboxMaxRequests(): number {
  const value = routeRateLimitConfig.getFields().activitypub_inbox_max_requests
  return isSafeIntegerInRange(value, ACTIVITYPUB_INBOX_LIMITS.maxRequests) ? value : 60
}

export function getActivityPubInboxWindowSeconds(): number {
  const value = routeRateLimitConfig.getFields().activitypub_inbox_window_seconds
  return isSafeIntegerInRange(value, ACTIVITYPUB_INBOX_LIMITS.windowSeconds) ? value : 60
}

function isSafeIntegerInRange(
  value: unknown,
  range: Readonly<{ min: number; max: number }>,
): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= range.min &&
    value <= range.max
  )
}

function isFiniteNumberInRange(
  value: unknown,
  range: Readonly<{ min: number; max: number }>,
): value is number {
  return (
    typeof value === 'number' && Number.isFinite(value) && value >= range.min && value <= range.max
  )
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

import { rateLimiterValkeyClient } from '@data-stores/valkey/clients'
import { loadScript, registerScript } from '@data-stores/valkey/scripts'
import onError from '@modules/on-error'

const KEY_PREFIX = 'crawler:domain-rate-limit'
const setDomainRateLimitScript = registerScript(
  loadScript('set-domain-rate-limit.lua', import.meta.url),
)

const DEFAULT_RATE_LIMIT_MS = 60_000 // 1 minute fallback when no Retry-After header
export const IMMEDIATE_RETRY_RATE_LIMIT_MS = 1_000

function key(hostnameId: string) {
  return `${KEY_PREFIX}:{${hostnameId}}`
}

/**
 * Returns the remaining rate-limit duration in milliseconds for the given hostname,
 * or null if the hostname is not currently rate-limited.
 */
export async function getDomainRateLimitRemainingMs(hostnameId: string): Promise<number | null> {
  const ttl = await rateLimiterValkeyClient.pttl(key(hostnameId))
  // pttl returns -2 if key doesn't exist, -1 if key exists but has no TTL
  return ttl > 0 ? ttl : null
}

/**
 * Records that a domain is rate-limited until the given duration elapses.
 * All subsequent crawl jobs for this hostname will be deferred until the lock expires.
 * Retry-After: 0 still gets a short positive lock so queued jobs for the same
 * hostname serialize before retrying. Valkey SET PX 0 is invalid.
 */
export async function setDomainRateLimited(
  hostnameId: string,
  retryAfterMs?: number,
): Promise<number> {
  const lockMs = normalizeDomainRateLimitMs(retryAfterMs)
  const effectiveLockMs = await rateLimiterValkeyClient.invokeScript(setDomainRateLimitScript, {
    keys: [key(hostnameId)],
    args: [String(lockMs)],
  })
  return normalizeDomainRateLimitScriptResult(effectiveLockMs)
}

/**
 * Fire-and-forget wrapper — safe to call from catch blocks that cannot await.
 */
export function setDomainRateLimitedBackground(hostnameId: string, retryAfterMs?: number): void {
  setDomainRateLimited(hostnameId, retryAfterMs).catch(onError)
}

export function normalizeDomainRateLimitMs(retryAfterMs?: number): number {
  if (retryAfterMs === undefined) return DEFAULT_RATE_LIMIT_MS

  return retryAfterMs > 0 ? retryAfterMs : IMMEDIATE_RETRY_RATE_LIMIT_MS
}

export function normalizeDomainRateLimitScriptResult(result: unknown): number {
  const lockMs = Number(String(result))
  if (!Number.isFinite(lockMs)) {
    throw new Error(`set-domain-rate-limit returned invalid TTL: ${String(result)}`)
  }

  return lockMs
}

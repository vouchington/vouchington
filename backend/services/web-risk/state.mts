import crypto from 'node:crypto'
import { RateLimiter, type RateLimiterWindow } from '@data-stores/valkey-rate-limiter'
import { rateLimiterValkeyClient } from '@data-stores/valkey/clients'
import { TimeUnit } from '@valkey/valkey-glide'
import { getRetryAfterDurationMs } from '@modules/utils/http'
import onError from '@modules/on-error'

const CLEAN_CACHE_TTL_SECONDS = 7 * 24 * 60 * 60
const DEFAULT_COOLDOWN_SECONDS = 60
const MINUTE_LIMIT_TTL_SECONDS = 60
const MONTH_LIMIT_TTL_SECONDS = 31 * 24 * 60 * 60
const MINUTE_LIMIT_THRESHOLD = 5_001
const MONTH_LIMIT_THRESHOLD = 90_001

type WebRiskStateOptions = {
  namespace?: string
  now?: () => number
  minuteThreshold?: number
  monthThreshold?: number
}

export type WebRiskState = ReturnType<typeof createWebRiskState>

/** Owns one Web Risk policy/key scope; persistent budgets remain owned by Valkey, not teardown. */
export function createWebRiskState({
  namespace = 'web-risk',
  now = () => Date.now(),
  minuteThreshold = MINUTE_LIMIT_THRESHOLD,
  monthThreshold = MONTH_LIMIT_THRESHOLD,
}: WebRiskStateOptions = {}) {
  const cooldownKey = `${namespace}:cooldown`

  async function isLocallyRateLimited(): Promise<boolean> {
    try {
      const { limited } = await RateLimiter.addAndCheckWindows(buildLocalRateLimitWindows(), {
        mode: 'stop-on-limited',
      })
      return limited
    } catch (err) {
      onError(err instanceof Error ? err : new Error(String(err)))
      return false
    }
  }

  async function isProviderCoolingDown(): Promise<boolean> {
    const ttl = await rateLimiterValkeyClient.pttl(cooldownKey)
    return ttl > 0
  }

  async function setProviderCooldownFromResponse(response: Response): Promise<void> {
    const retryAfterMs = getRetryAfterDurationMs(response.headers.get('retry-after'), now())
    const seconds = Math.max(1, Math.ceil((retryAfterMs ?? DEFAULT_COOLDOWN_SECONDS * 1000) / 1000))
    await setProviderCooldown(seconds)
  }

  async function setProviderCooldown(seconds: number): Promise<void> {
    await rateLimiterValkeyClient.set(cooldownKey, '1', {
      expiry: { type: TimeUnit.Seconds, count: seconds },
    })
  }

  async function hasCleanCachedVerdict(url: URL): Promise<boolean> {
    return (await rateLimiterValkeyClient.get(cleanCacheKey(url))) === '1'
  }

  async function cacheCleanVerdict(url: URL): Promise<void> {
    await rateLimiterValkeyClient.set(cleanCacheKey(url), '1', {
      expiry: { type: TimeUnit.Seconds, count: CLEAN_CACHE_TTL_SECONDS },
    })
  }

  function cleanCacheKey(url: URL): string {
    const hash = crypto.createHash('sha256').update(url.toString()).digest('hex')
    return `${namespace}:clean:${hash}`
  }

  function buildLocalRateLimitWindows(): RateLimiterWindow[] {
    const date = new Date(now())
    const monthBucket = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
    return [
      {
        prefix: `${namespace}-minute`,
        id: 'global',
        hashTag: monthBucket,
        ttlSeconds: MINUTE_LIMIT_TTL_SECONDS,
        threshold: minuteThreshold,
      },
      {
        prefix: `${namespace}-month`,
        id: '',
        hashTag: monthBucket,
        ttlSeconds: MONTH_LIMIT_TTL_SECONDS,
        threshold: monthThreshold,
        skipWriteWhenLimited: true,
      },
    ]
  }

  return {
    isLocallyRateLimited,
    isProviderCoolingDown,
    setProviderCooldownFromResponse,
    setProviderCooldown,
    hasCleanCachedVerdict,
    cacheCleanVerdict,
  }
}

import crypto from 'node:crypto'
import { RateLimiter, type RateLimiterWindow } from '@data-stores/valkey-rate-limiter'
import { rateLimiterValkeyClient } from '@data-stores/valkey/clients'
import { TimeUnit } from '@valkey/valkey-glide'
import { getRetryAfterDurationMs } from '@modules/utils/http'
import onError from '@modules/on-error'

const CLEAN_CACHE_TTL_SECONDS = 7 * 24 * 60 * 60
const DEFAULT_COOLDOWN_SECONDS = 60
const COOLDOWN_KEY = 'web-risk:cooldown'
const CLEAN_CACHE_PREFIX = 'web-risk:clean'
const MINUTE_LIMITER_PREFIX = 'web-risk-minute'
const MONTH_LIMITER_PREFIX = 'web-risk-month'
const MINUTE_LIMIT_TTL_SECONDS = 60
const MONTH_LIMIT_TTL_SECONDS = 31 * 24 * 60 * 60
const MINUTE_LIMIT_THRESHOLD = 5_001
const MONTH_LIMIT_THRESHOLD = 90_001

type LocalRateLimitOptions = {
  minuteThreshold: number
  monthThreshold: number
  monthBucket: string
}

type WebRiskStateTestOptions = {
  bypassLocalRateLimits?: boolean
  minuteThreshold?: number
  monthThreshold?: number
}

type WebRiskTestState = {
  bypassLocalRateLimits: boolean
  localRateLimitOptions: LocalRateLimitOptions
}

let webRiskTestState: WebRiskTestState | undefined

export function configureWebRiskStateForTest(options: WebRiskStateTestOptions = {}): {
  monthBucket: string
} {
  const monthBucket = webRiskTestState?.localRateLimitOptions.monthBucket ?? makeTestMonthBucket()
  webRiskTestState = {
    bypassLocalRateLimits: options.bypassLocalRateLimits ?? false,
    localRateLimitOptions: {
      minuteThreshold: options.minuteThreshold ?? MINUTE_LIMIT_THRESHOLD,
      monthThreshold: options.monthThreshold ?? MONTH_LIMIT_THRESHOLD,
      monthBucket,
    },
  }
  return { monthBucket }
}

export async function resetWebRiskStateForTest(): Promise<void> {
  const activeTestState = webRiskTestState
  try {
    if (!activeTestState) return
    const keys = [
      ...buildLocalRateLimitWindows(activeTestState.localRateLimitOptions).map(window =>
        RateLimiter.getWindowKey(window),
      ),
      getProviderCooldownKey(activeTestState),
    ]
    await rateLimiterValkeyClient.unlink(keys)
  } finally {
    webRiskTestState = undefined
  }
}

export async function isLocallyRateLimited(): Promise<boolean> {
  if (webRiskTestState?.bypassLocalRateLimits) return false
  try {
    const options = webRiskTestState?.localRateLimitOptions ?? getProductionLocalRateLimitOptions()
    const { limited } = await RateLimiter.addAndCheckWindows(buildLocalRateLimitWindows(options), {
      mode: 'stop-on-limited',
    })
    return limited
  } catch (error) {
    onError(error instanceof Error ? error : new Error(String(error)))
    return false
  }
}

export async function isProviderCoolingDown(): Promise<boolean> {
  const ttl = await rateLimiterValkeyClient.pttl(getProviderCooldownKey())
  return ttl > 0
}

export async function setProviderCooldownFromResponse(response: Response): Promise<void> {
  const retryAfterMs = getRetryAfterDurationMs(response.headers.get('retry-after'))
  const seconds = Math.max(1, Math.ceil((retryAfterMs ?? DEFAULT_COOLDOWN_SECONDS * 1000) / 1000))
  await setProviderCooldown(seconds)
}

export async function setProviderCooldown(seconds: number): Promise<void> {
  await rateLimiterValkeyClient.set(getProviderCooldownKey(), '1', {
    expiry: { type: TimeUnit.Seconds, count: seconds },
  })
}

export async function hasCleanCachedVerdict(url: URL): Promise<boolean> {
  return (await rateLimiterValkeyClient.get(cleanCacheKey(url))) === '1'
}

export async function cacheCleanVerdict(url: URL): Promise<void> {
  await rateLimiterValkeyClient.set(cleanCacheKey(url), '1', {
    expiry: { type: TimeUnit.Seconds, count: CLEAN_CACHE_TTL_SECONDS },
  })
}

function cleanCacheKey(url: URL): string {
  const hash = crypto.createHash('sha256').update(url.toString()).digest('hex')
  return `${CLEAN_CACHE_PREFIX}:${hash}`
}

function buildLocalRateLimitWindows(options: LocalRateLimitOptions): RateLimiterWindow[] {
  return [
    {
      prefix: MINUTE_LIMITER_PREFIX,
      id: 'global',
      hashTag: options.monthBucket,
      ttlSeconds: MINUTE_LIMIT_TTL_SECONDS,
      threshold: options.minuteThreshold,
    },
    {
      prefix: MONTH_LIMITER_PREFIX,
      id: '',
      hashTag: options.monthBucket,
      ttlSeconds: MONTH_LIMIT_TTL_SECONDS,
      threshold: options.monthThreshold,
      skipWriteWhenLimited: true,
    },
  ]
}

function getProviderCooldownKey(
  testState: WebRiskTestState | undefined = webRiskTestState,
): string {
  return testState
    ? `${COOLDOWN_KEY}:{${testState.localRateLimitOptions.monthBucket}}`
    : COOLDOWN_KEY
}

function getProductionLocalRateLimitOptions(): LocalRateLimitOptions {
  return {
    minuteThreshold: MINUTE_LIMIT_THRESHOLD,
    monthThreshold: MONTH_LIMIT_THRESHOLD,
    monthBucket: getMonthBucket(),
  }
}

function makeTestMonthBucket(): string {
  return `test-${crypto.randomUUID()}`
}

function getMonthBucket(date: Date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

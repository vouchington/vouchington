import { describe, expect, it, onTestFinished } from 'vitest'
import { overrideUncheckedDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import {
  ACTIVITYPUB_INBOX_LIMITS,
  ANON_ROUTE_RATE_LIMIT_DEFAULTS,
  getActivityPubInboxAttemptMaxRequests,
  getActivityPubInboxAttemptWindowSeconds,
  getActivityPubInboxMaxRequests,
  getActivityPubInboxWindowSeconds,
  getAnonThreshold,
  getAnonTtl,
  getAttestedMultiplier,
  isRouteRateLimitEnabled,
  routeRateLimitConfig,
} from './config.mts'

describe('route rate-limit config values', () => {
  it('keeps route limiting enabled when the kill-switch value is malformed', () => {
    for (const value of [null, 0, 'false']) {
      const restore = overrideUncheckedDynamicConfigFieldsForTest(routeRateLimitConfig, {
        enabled: value,
      })
      expect(isRouteRateLimitEnabled()).toBe(true)
      restore()
    }
  })

  it('uses bounded callback-specific threshold and window values', () => {
    const restore = overrideUncheckedDynamicConfigFieldsForTest(routeRateLimitConfig, {
      anon_oauth_callback: 600,
      anon_oauth_callback_ttl: 120,
    })
    onTestFinished(restore)

    expect(getAnonThreshold('oauth_callback')).toBe(600)
    expect(getAnonTtl('oauth_callback')).toBe(120)

    for (const value of [0, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53]) {
      const restoreInvalidThreshold = overrideUncheckedDynamicConfigFieldsForTest(
        routeRateLimitConfig,
        { anon_oauth_callback: value },
      )
      expect(getAnonThreshold('oauth_callback')).toBe(300)
      restoreInvalidThreshold()

      const restoreInvalidTtl = overrideUncheckedDynamicConfigFieldsForTest(routeRateLimitConfig, {
        anon_oauth_callback_ttl: value,
      })
      expect(getAnonTtl('oauth_callback')).toBe(60)
      restoreInvalidTtl()
    }
  })

  it.each([
    ['read', 'anon_read', ANON_ROUTE_RATE_LIMIT_DEFAULTS.thresholds.read],
    ['write', 'anon_write', ANON_ROUTE_RATE_LIMIT_DEFAULTS.thresholds.write],
    ['sensitive', 'anon_sensitive', ANON_ROUTE_RATE_LIMIT_DEFAULTS.thresholds.sensitive],
  ] as const)(
    'falls back unless anonymous %s thresholds are positive safe integers',
    (category, field, fallback) => {
      const invalidValues = [1.5, 0, -1, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53]
      for (const value of invalidValues) {
        const restore = overrideUncheckedDynamicConfigFieldsForTest(routeRateLimitConfig, {
          [field]: value,
        })
        expect(getAnonThreshold(category)).toBe(fallback)
        restore()
      }
    },
  )

  it.each([
    ['read', 'anon_read_ttl'],
    ['write', 'anon_write_ttl'],
    ['sensitive', 'anon_sensitive_ttl'],
  ] as const)(
    'falls back unless anonymous %s TTLs are positive safe integers',
    (category, field) => {
      const invalidValues = [1.5, 0, -1, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53]
      for (const value of invalidValues) {
        const restore = overrideUncheckedDynamicConfigFieldsForTest(routeRateLimitConfig, {
          [field]: value,
        })
        expect(getAnonTtl(category)).toBe(ANON_ROUTE_RATE_LIMIT_DEFAULTS.ttlSeconds)
        restore()
      }
    },
  )

  it('falls back unless the attested multiplier is a positive finite number', () => {
    const invalidValues = [0, -1, Number.NaN, Number.POSITIVE_INFINITY, 100.1]
    for (const value of invalidValues) {
      const restore = overrideUncheckedDynamicConfigFieldsForTest(routeRateLimitConfig, {
        attested_multiplier: value,
      })
      expect(getAttestedMultiplier()).toBe(ANON_ROUTE_RATE_LIMIT_DEFAULTS.attestedMultiplier)
      restore()
    }
  })

  it.each([
    [
      ACTIVITYPUB_INBOX_LIMITS.attemptMaxRequests.min,
      ACTIVITYPUB_INBOX_LIMITS.attemptWindowSeconds.min,
    ],
    [600, 90],
    [
      ACTIVITYPUB_INBOX_LIMITS.attemptMaxRequests.max,
      ACTIVITYPUB_INBOX_LIMITS.attemptWindowSeconds.max,
    ],
  ])('returns valid configured ActivityPub attempt values', (maxRequests, windowSeconds) => {
    onTestFinished(
      overrideUncheckedDynamicConfigFieldsForTest(routeRateLimitConfig, {
        activitypub_inbox_attempt_max_requests: maxRequests,
        activitypub_inbox_attempt_window_seconds: windowSeconds,
      }),
    )

    expect(getActivityPubInboxAttemptMaxRequests()).toBe(maxRequests)
    expect(getActivityPubInboxAttemptWindowSeconds()).toBe(windowSeconds)
  })

  it('falls back unless ActivityPub attempt values are bounded safe integers', () => {
    const invalidValues = [1.5, 0, -1, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53]
    for (const value of [...invalidValues, ACTIVITYPUB_INBOX_LIMITS.attemptMaxRequests.max + 1]) {
      const restore = overrideUncheckedDynamicConfigFieldsForTest(routeRateLimitConfig, {
        activitypub_inbox_attempt_max_requests: value,
      })
      expect(getActivityPubInboxAttemptMaxRequests()).toBe(300)
      restore()
    }

    for (const value of [...invalidValues, ACTIVITYPUB_INBOX_LIMITS.attemptWindowSeconds.max + 1]) {
      const restore = overrideUncheckedDynamicConfigFieldsForTest(routeRateLimitConfig, {
        activitypub_inbox_attempt_window_seconds: value,
      })
      expect(getActivityPubInboxAttemptWindowSeconds()).toBe(60)
      restore()
    }
  })

  it.each([
    [ACTIVITYPUB_INBOX_LIMITS.maxRequests.min, ACTIVITYPUB_INBOX_LIMITS.windowSeconds.min],
    [120, 90],
    [ACTIVITYPUB_INBOX_LIMITS.maxRequests.max, ACTIVITYPUB_INBOX_LIMITS.windowSeconds.max],
  ])('returns valid configured ActivityPub values', (maxRequests, windowSeconds) => {
    onTestFinished(
      overrideUncheckedDynamicConfigFieldsForTest(routeRateLimitConfig, {
        activitypub_inbox_max_requests: maxRequests,
        activitypub_inbox_window_seconds: windowSeconds,
      }),
    )

    expect(getActivityPubInboxMaxRequests()).toBe(maxRequests)
    expect(getActivityPubInboxWindowSeconds()).toBe(windowSeconds)
  })

  it('falls back unless ActivityPub count and window values are bounded safe integers', () => {
    const invalidValues = [1.5, 0, -1, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53]
    for (const value of [...invalidValues, ACTIVITYPUB_INBOX_LIMITS.maxRequests.max + 1]) {
      const restore = overrideUncheckedDynamicConfigFieldsForTest(routeRateLimitConfig, {
        activitypub_inbox_max_requests: value,
      })
      expect(getActivityPubInboxMaxRequests()).toBe(60)
      restore()
    }

    for (const value of [...invalidValues, ACTIVITYPUB_INBOX_LIMITS.windowSeconds.max + 1]) {
      const restore = overrideUncheckedDynamicConfigFieldsForTest(routeRateLimitConfig, {
        activitypub_inbox_window_seconds: value,
      })
      expect(getActivityPubInboxWindowSeconds()).toBe(60)
      restore()
    }
  })
})

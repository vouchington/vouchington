import { describe, expect, it } from 'vitest'
import { parseFeatureFlagCookie, getFeatureFlags, getFeatureFlagsWithOverrides } from './index.mts'

const originalFeatureFlagCookieMaxLength = process.env.FEATURE_FLAG_COOKIE_MAX_LENGTH

function restoreFeatureFlagCookieMaxLength(): void {
  if (originalFeatureFlagCookieMaxLength === undefined) {
    delete process.env.FEATURE_FLAG_COOKIE_MAX_LENGTH
  } else {
    process.env.FEATURE_FLAG_COOKIE_MAX_LENGTH = originalFeatureFlagCookieMaxLength
  }
}

describe('parseFeatureFlagCookie', () => {
  it('parses a valid base64-encoded JSON cookie', () => {
    const cookie = Buffer.from(JSON.stringify({ memberships: true })).toString('base64')
    expect(parseFeatureFlagCookie(cookie)).toEqual({ memberships: true })
  })

  it('returns empty object when the cookie exceeds FEATURE_FLAG_COOKIE_MAX_LENGTH', () => {
    const cookie = Buffer.from(JSON.stringify({ memberships: true })).toString('base64')
    try {
      process.env.FEATURE_FLAG_COOKIE_MAX_LENGTH = String(cookie.length - 1)

      expect(parseFeatureFlagCookie(cookie)).toEqual({})
    } finally {
      restoreFeatureFlagCookieMaxLength()
    }
  })

  it('uses the default length limit when FEATURE_FLAG_COOKIE_MAX_LENGTH is invalid', () => {
    const cookie = Buffer.from(JSON.stringify({ memberships: true })).toString('base64')
    try {
      process.env.FEATURE_FLAG_COOKIE_MAX_LENGTH = 'not-a-number'

      expect(parseFeatureFlagCookie(cookie)).toEqual({ memberships: true })
    } finally {
      restoreFeatureFlagCookieMaxLength()
    }
  })
})

describe('getFeatureFlags', () => {
  it('returns boolean fields from config', () => {
    const flags = getFeatureFlags()
    expect(typeof flags.memberships).toBe('boolean')
    expect(flags.membershipAppleBilling).toBe(false)
    expect(flags.membershipGoogleBilling).toBe(false)
    expect(flags.membershipMicrosoftBilling).toBe(false)
    expect(flags.fediverse).toBe(false)
  })
})

describe('getFeatureFlagsWithOverrides', () => {
  it('overrides matching keys', () => {
    const flags = getFeatureFlagsWithOverrides({ memberships: true })
    expect(flags.memberships).toBe(true)
  })

  it('ignores unknown keys in overrides', () => {
    const flags = getFeatureFlagsWithOverrides({ unknownFlag: true })
    expect(flags).not.toHaveProperty('unknownFlag')
  })

  it('ignores prototype property names in overrides', () => {
    const flags = getFeatureFlagsWithOverrides({ toString: true })
    expect(Object.hasOwn(flags, 'toString')).toBe(false)
  })

  it('returns global values when no overrides match', () => {
    const global = getFeatureFlags()
    const merged = getFeatureFlagsWithOverrides({})
    expect(merged).toEqual(global)
  })
})

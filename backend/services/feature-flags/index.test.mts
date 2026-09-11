import { describe, expect, it } from 'vitest'
import {
  parseFeatureFlagCookie,
  encodeFeatureFlagCookie,
  getFeatureFlags,
  getFeatureFlagsWithOverrides,
} from './index.mts'

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

  it('returns empty object for empty string', () => {
    expect(parseFeatureFlagCookie('')).toEqual({})
  })

  it('returns empty object for invalid base64', () => {
    expect(parseFeatureFlagCookie('not-valid-base64!!!')).toEqual({})
  })

  it('returns empty object for non-object JSON', () => {
    const cookie = Buffer.from('"hello"').toString('base64')
    expect(parseFeatureFlagCookie(cookie)).toEqual({})
  })

  it('returns empty object for array JSON', () => {
    const cookie = Buffer.from('[1,2,3]').toString('base64')
    expect(parseFeatureFlagCookie(cookie)).toEqual({})
  })

  it('filters out non-boolean values', () => {
    const cookie = Buffer.from(JSON.stringify({ a: true, b: 'string', c: 123, d: false })).toString(
      'base64',
    )
    expect(parseFeatureFlagCookie(cookie)).toEqual({ a: true, d: false })
  })

  it('returns empty object for malformed JSON', () => {
    const cookie = Buffer.from('{bad json').toString('base64')
    expect(parseFeatureFlagCookie(cookie)).toEqual({})
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

describe('encodeFeatureFlagCookie', () => {
  it('round-trips with parseFeatureFlagCookie', () => {
    const overrides = { memberships: true, someFlag: false }
    const encoded = encodeFeatureFlagCookie(overrides)
    expect(parseFeatureFlagCookie(encoded)).toEqual(overrides)
  })

  it('encodes empty object', () => {
    const encoded = encodeFeatureFlagCookie({})
    expect(parseFeatureFlagCookie(encoded)).toEqual({})
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

import { Buffer } from 'node:buffer'
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_FEATURE_FLAG_COOKIE_MAX_LENGTH,
  FF_COOKIE,
  encodeFeatureFlagCookie,
  extractBooleanFeatureFlags,
  parseFeatureFlagCookieMaxLength,
  parseFeatureFlagCookie,
  safeFeatureFlagCookiePart,
  type FeatureFlagCookieCodec,
} from './index.mts'

const codec: FeatureFlagCookieCodec = {
  encodeBase64: value => Buffer.from(value, 'utf8').toString('base64'),
  decodeBase64: value => Buffer.from(value, 'base64').toString('utf8'),
}

describe('parseFeatureFlagCookie', () => {
  it('parses a valid base64-encoded JSON cookie', () => {
    const cookie = codec.encodeBase64(JSON.stringify({ memberships: true }))
    expect(parseFeatureFlagCookie(cookie, codec)).toEqual({ memberships: true })
  })

  it('returns an empty object for an empty string', () => {
    expect(parseFeatureFlagCookie('', codec)).toEqual({})
  })

  it('returns an empty object when the codec rejects decoding', () => {
    const throwingCodec: FeatureFlagCookieCodec = {
      ...codec,
      decodeBase64: () => {
        throw new Error('Decode failed')
      },
    }

    expect(parseFeatureFlagCookie('abcd', throwingCodec)).toEqual({})
  })

  it('returns an empty object without decoding when the cookie is not base64', () => {
    const throwingCodec: FeatureFlagCookieCodec = {
      ...codec,
      decodeBase64: () => {
        throw new Error('should not decode malformed base64 cookies')
      },
    }

    expect(parseFeatureFlagCookie('not-valid-base64!!!', throwingCodec)).toEqual({})
  })

  it('returns an empty object for non-object JSON', () => {
    const cookie = codec.encodeBase64('"hello"')
    expect(parseFeatureFlagCookie(cookie, codec)).toEqual({})
  })

  it('returns an empty object for array JSON', () => {
    const cookie = codec.encodeBase64('[1,2,3]')
    expect(parseFeatureFlagCookie(cookie, codec)).toEqual({})
  })

  it('filters out non-boolean values', () => {
    const cookie = codec.encodeBase64(JSON.stringify({ a: true, b: 'string', c: 123, d: false }))

    expect(parseFeatureFlagCookie(cookie, codec)).toEqual({ a: true, d: false })
  })

  it('returns an empty object for malformed JSON', () => {
    const cookie = codec.encodeBase64('{bad json')
    expect(parseFeatureFlagCookie(cookie, codec)).toEqual({})
  })

  it('returns an empty object without decoding when the cookie exceeds the length limit', () => {
    const throwingCodec: FeatureFlagCookieCodec = {
      ...codec,
      decodeBase64: () => {
        throw new Error('should not decode oversized cookies')
      },
    }

    expect(parseFeatureFlagCookie('abcd', throwingCodec, { maxCookieLength: 3 })).toEqual({})
  })
})

describe('encodeFeatureFlagCookie', () => {
  it('round-trips with parseFeatureFlagCookie', () => {
    const overrides = { memberships: true, someFlag: false }
    const encoded = encodeFeatureFlagCookie(overrides, codec)

    expect(parseFeatureFlagCookie(encoded, codec)).toEqual(overrides)
  })

  it('encodes an empty object', () => {
    const encoded = encodeFeatureFlagCookie({}, codec)

    expect(parseFeatureFlagCookie(encoded, codec)).toEqual({})
  })
})

describe('extractBooleanFeatureFlags', () => {
  it('keeps only boolean entries', () => {
    expect(extractBooleanFeatureFlags({ enabled: true, disabled: false, text: 'yes' })).toEqual({
      enabled: true,
      disabled: false,
    })
  })
})

describe('safeFeatureFlagCookiePart', () => {
  it('returns a cookie part for valid base64 values', () => {
    expect(safeFeatureFlagCookiePart('eyJmb28iOnRydWV9')).toBe(`${FF_COOKIE}=eyJmb28iOnRydWV9`)
  })

  it('returns null for values that exceed the length limit', () => {
    expect(safeFeatureFlagCookiePart('eyJmb28iOnRydWV9', { maxCookieLength: 3 })).toBeNull()
  })

  it('returns null for missing, empty, and invalid values', () => {
    expect(safeFeatureFlagCookiePart(undefined)).toBeNull()
    expect(safeFeatureFlagCookiePart('')).toBeNull()
    expect(safeFeatureFlagCookiePart('not-valid-base64!!!')).toBeNull()
  })
})

describe('parseFeatureFlagCookieMaxLength', () => {
  it('parses a positive integer override', () => {
    expect(parseFeatureFlagCookieMaxLength('128')).toBe(128)
  })

  it('falls back to the default for missing, invalid, and non-positive values', () => {
    expect(parseFeatureFlagCookieMaxLength(undefined)).toBe(DEFAULT_FEATURE_FLAG_COOKIE_MAX_LENGTH)
    expect(parseFeatureFlagCookieMaxLength('not-a-number')).toBe(
      DEFAULT_FEATURE_FLAG_COOKIE_MAX_LENGTH,
    )
    expect(parseFeatureFlagCookieMaxLength('0')).toBe(DEFAULT_FEATURE_FLAG_COOKIE_MAX_LENGTH)
    expect(parseFeatureFlagCookieMaxLength('-1')).toBe(DEFAULT_FEATURE_FLAG_COOKIE_MAX_LENGTH)
  })
})

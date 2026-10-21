import { describe, expect, it } from 'vitest'
import { FF_COOKIE, safeFeatureFlagCookiePart } from './index.mts'

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

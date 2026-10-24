/* eslint-disable no-underscore-dangle -- tests seed the runtime public config bootstrap global. */

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  encodeFeatureFlagCookie,
  parseFeatureFlagCookie,
  safeFeatureFlagCookiePart,
} from './shared'

describe('feature flag cookie helpers', () => {
  afterEach(() => {
    if (typeof window !== 'undefined') delete window.__VOUCHA_PUBLIC_CONFIG__
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('round-trips non-ASCII feature flag names with the browser base64 codec', () => {
    const overrides = { 'mémé🚀': true }
    const encoded = encodeFeatureFlagCookie(overrides)

    expect(parseFeatureFlagCookie(encoded)).toEqual(overrides)
  })

  it("parses non-ASCII cookie bytes emitted by Node's Buffer base64 codec", () => {
    expect(parseFeatureFlagCookie('eyJtw6ltw6nwn5qAIjp0cnVlfQ==')).toEqual({ 'mémé🚀': true })
  })

  it('returns empty overrides when the cookie exceeds the runtime public max length', () => {
    const encoded = encodeFeatureFlagCookie({ memberships: true })
    window.__VOUCHA_PUBLIC_CONFIG__ = { featureFlagCookieMaxLength: encoded.length - 1 }

    expect(parseFeatureFlagCookie(encoded)).toEqual({})
  })

  it('uses the default max length when the bootstrap config is unavailable', () => {
    const encoded = encodeFeatureFlagCookie({ memberships: true })
    vi.stubEnv('NEXT_PUBLIC_FEATURE_FLAG_COOKIE_MAX_LENGTH', String(encoded.length - 1))

    expect(parseFeatureFlagCookie(encoded)).toEqual({ memberships: true })
  })

  it('uses the runtime public env fallback on server paths', () => {
    const encoded = encodeFeatureFlagCookie({ memberships: true })
    vi.stubGlobal('window', undefined)
    vi.stubEnv('NEXT_PUBLIC_FEATURE_FLAG_COOKIE_MAX_LENGTH', String(encoded.length - 1))

    expect(parseFeatureFlagCookie(encoded)).toEqual({})
  })

  it('uses the runtime feature-flag length when the public length is an SSM placeholder', () => {
    const encoded = encodeFeatureFlagCookie({ memberships: true })
    vi.stubGlobal('window', undefined)
    vi.stubEnv('NEXT_PUBLIC_FEATURE_FLAG_COOKIE_MAX_LENGTH', 'PLACEHOLDER')
    vi.stubEnv('FEATURE_FLAG_COOKIE_MAX_LENGTH', String(encoded.length - 1))

    expect(parseFeatureFlagCookie(encoded)).toEqual({})
    expect(safeFeatureFlagCookiePart(encoded)).toBeNull()
  })
})

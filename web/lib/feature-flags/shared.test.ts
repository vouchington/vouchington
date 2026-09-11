/* eslint-disable no-underscore-dangle -- tests seed the runtime public config bootstrap global. */

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  FF_COOKIE,
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

  it('round-trips feature flag overrides with the browser base64 codec', () => {
    const overrides = { memberships: true, betaDashboard: false }
    const encoded = encodeFeatureFlagCookie(overrides)

    expect(parseFeatureFlagCookie(encoded)).toEqual(overrides)
  })

  it('round-trips non-ASCII feature flag names with the browser base64 codec', () => {
    const overrides = { 'mémé🚀': true }
    const encoded = encodeFeatureFlagCookie(overrides)

    expect(parseFeatureFlagCookie(encoded)).toEqual(overrides)
  })

  it("parses non-ASCII cookie bytes emitted by Node's Buffer base64 codec", () => {
    expect(parseFeatureFlagCookie('eyJtw6ltw6nwn5qAIjp0cnVlfQ==')).toEqual({ 'mémé🚀': true })
  })

  it('filters non-boolean parsed values', () => {
    const encoded = btoa(JSON.stringify({ enabled: true, text: 'yes', count: 1 }))

    expect(parseFeatureFlagCookie(encoded)).toEqual({ enabled: true })
  })

  it('returns empty overrides for invalid input', () => {
    expect(parseFeatureFlagCookie('not-valid-base64!!!')).toEqual({})
    expect(parseFeatureFlagCookie(btoa('[true]'))).toEqual({})
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

  it('builds only safe ff cookie parts', () => {
    const encoded = encodeFeatureFlagCookie({ memberships: true })

    expect(safeFeatureFlagCookiePart(encoded)).toBe(`${FF_COOKIE}=${encoded}`)
    expect(safeFeatureFlagCookiePart(undefined)).toBeNull()
    expect(safeFeatureFlagCookiePart('not-valid-base64!!!')).toBeNull()
  })

  it('drops safe ff cookie parts when the cookie exceeds the runtime public max length', () => {
    const encoded = encodeFeatureFlagCookie({ memberships: true })
    window.__VOUCHA_PUBLIC_CONFIG__ = { featureFlagCookieMaxLength: encoded.length - 1 }

    expect(safeFeatureFlagCookiePart(encoded)).toBeNull()
  })
})

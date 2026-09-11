import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  clearAllFeatureFlagOverrides,
  EMPTY_FEATURE_FLAGS,
  getFeatureFlagOverrides,
  getFeatureFlagServerSnapshot,
  getFeatureFlagSnapshot,
  removeFeatureFlagOverride,
  setFeatureFlagOverride,
} from './cookies'
import { encodeFeatureFlagCookie, FF_COOKIE } from './shared'

/**
 * In-memory stand-in for `document.cookie`, modelling only what `cookies.ts` itself reads and
 * writes (not full browser cookie semantics). jsdom's real cookie jar isn't used here because it
 * silently drops `Secure`-flagged cookies set from this test's non-https origin, and there is no
 * way to give this test an `https:` origin instead — jsdom's `window.location` is
 * `[LegacyUnforgeable]`, so neither `Object.defineProperty` nor `vi.stubGlobal` can override it.
 *
 * `set()` mirrors `writeCookie`/`deleteCookie`'s wire format: a `name=value` pair followed by
 * `; `-joined attributes. It deletes the jar entry when the written `expires` attribute is
 * already in the past, so calling the real `deleteCookie` through this stub behaves like a real
 * deletion.
 */
function installCookieJarStub() {
  const jar = new Map<string, string>()
  let lastWrite = ''

  Object.defineProperty(document, 'cookie', {
    configurable: true,
    get(): string {
      return [...jar].map(([name, value]) => `${name}=${value}`).join('; ')
    },
    set(rawCookie: string) {
      lastWrite = rawCookie
      const [pair = '', ...attributes] = rawCookie.split('; ')
      const separatorIndex = pair.indexOf('=')
      const name = separatorIndex === -1 ? pair : pair.slice(0, separatorIndex)
      const value = separatorIndex === -1 ? '' : pair.slice(separatorIndex + 1)

      const expiresAttribute = attributes.find(attribute => attribute.startsWith('expires='))
      if (expiresAttribute && Date.parse(expiresAttribute.slice('expires='.length)) <= Date.now()) {
        jar.delete(name)
        return
      }
      jar.set(name, value)
    },
  })

  return {
    /** Seed the jar directly, bypassing the setter — the values under test are already-encoded strings. */
    setRaw: (name: string, value: string) => jar.set(name, value),
    deleteRaw: (name: string) => jar.delete(name),
    get lastWrite() {
      return lastWrite
    },
  }
}

describe('cookies', () => {
  let cookieJar: ReturnType<typeof installCookieJarStub>

  beforeEach(() => {
    cookieJar = installCookieJarStub()
  })

  afterEach(() => {
    Reflect.deleteProperty(document, 'cookie')
  })

  describe('getFeatureFlagSnapshot', () => {
    it('returns parsed flags when a cookie is set', () => {
      cookieJar.setRaw(FF_COOKIE, encodeFeatureFlagCookie({ memberships: true }))
      expect(getFeatureFlagSnapshot()).toEqual({ memberships: true })
    })

    it('returns {} once the cookie has been removed', () => {
      cookieJar.setRaw(FF_COOKIE, encodeFeatureFlagCookie({ memberships: true }))
      expect(getFeatureFlagSnapshot()).toEqual({ memberships: true })

      cookieJar.deleteRaw(FF_COOKIE)
      expect(getFeatureFlagSnapshot()).toEqual({})
    })

    it('returns the same object reference when the cookie value has not changed', () => {
      cookieJar.setRaw(FF_COOKIE, encodeFeatureFlagCookie({ beta: false }))
      const first = getFeatureFlagSnapshot()
      const second = getFeatureFlagSnapshot()
      expect(first).toBe(second)
    })

    it('returns a new object reference when the cookie value changes', () => {
      cookieJar.setRaw(FF_COOKIE, encodeFeatureFlagCookie({ beta: false }))
      const first = getFeatureFlagSnapshot()
      cookieJar.setRaw(FF_COOKIE, encodeFeatureFlagCookie({ beta: true }))
      const second = getFeatureFlagSnapshot()
      expect(first).not.toBe(second)
      expect(second).toEqual({ beta: true })
    })

    it('skips other cookies in the jar when reading', () => {
      cookieJar.setRaw('a', '1')
      cookieJar.setRaw(FF_COOKIE, encodeFeatureFlagCookie({ memberships: true }))
      cookieJar.setRaw('z', '2')
      expect(getFeatureFlagSnapshot()).toEqual({ memberships: true })
    })
  })

  describe('EMPTY_FEATURE_FLAGS', () => {
    it('is an empty object', () => {
      expect(EMPTY_FEATURE_FLAGS).toEqual({})
    })
  })

  describe('getFeatureFlagServerSnapshot', () => {
    it('returns EMPTY_FEATURE_FLAGS', () => {
      expect(getFeatureFlagServerSnapshot()).toBe(EMPTY_FEATURE_FLAGS)
    })
  })

  describe('getFeatureFlagOverrides', () => {
    it('returns {} when no cookie is set', () => {
      expect(getFeatureFlagOverrides()).toEqual({})
    })

    it('returns parsed overrides when the cookie is set', () => {
      cookieJar.setRaw(FF_COOKIE, encodeFeatureFlagCookie({ a: true, b: false }))
      expect(getFeatureFlagOverrides()).toEqual({ a: true, b: false })
    })
  })

  describe('setFeatureFlagOverride', () => {
    it('writes a cookie with the encoded overrides and the expected attributes', () => {
      setFeatureFlagOverride('memberships', true)

      const raw = cookieJar.lastWrite
      expect(
        raw.startsWith(`${FF_COOKIE}=${encodeFeatureFlagCookie({ memberships: true })}; `),
      ).toBe(true)
      expect(raw).toContain('path=/')
      expect(raw).toContain('sameSite=lax')
      // A numeric `expires` must serialize to an `Expires` date string, not `Max-Age` — the two
      // are equivalent in effect but are different attributes on the wire.
      expect(raw).toMatch(/expires=\w{3}, \d{2} \w{3} \d{4}/)
      expect(raw).not.toContain('max-age=')

      expect(getFeatureFlagOverrides()).toEqual({ memberships: true })
    })

    it('merges with existing overrides rather than replacing them', () => {
      cookieJar.setRaw(FF_COOKIE, encodeFeatureFlagCookie({ existing: true }))
      setFeatureFlagOverride('newFlag', false)
      expect(getFeatureFlagOverrides()).toEqual({ existing: true, newFlag: false })
    })
  })

  describe('removeFeatureFlagOverride', () => {
    it('re-writes the cookie with the remaining overrides when others are left', () => {
      cookieJar.setRaw(FF_COOKIE, encodeFeatureFlagCookie({ a: true, b: false }))
      removeFeatureFlagOverride('a')
      expect(getFeatureFlagOverrides()).toEqual({ b: false })
    })

    it('deletes the cookie when no overrides are left', () => {
      cookieJar.setRaw(FF_COOKIE, encodeFeatureFlagCookie({ a: true }))
      removeFeatureFlagOverride('a')
      expect(getFeatureFlagOverrides()).toEqual({})
    })
  })

  describe('clearAllFeatureFlagOverrides', () => {
    it('deletes the cookie', () => {
      cookieJar.setRaw(FF_COOKIE, encodeFeatureFlagCookie({ a: true }))
      clearAllFeatureFlagOverrides()
      expect(getFeatureFlagOverrides()).toEqual({})
    })
  })
})

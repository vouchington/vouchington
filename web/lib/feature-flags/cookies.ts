'use client'

import {
  FF_COOKIE,
  parseFeatureFlagCookie,
  encodeFeatureFlagCookie,
  type FeatureFlags,
} from './shared'

const COOKIE_PATH = '/'
const COOKIE_MAX_AGE_DAYS = 365
const MS_PER_DAY = 86_400_000
// Evaluated once at module load, matching the prior js-cookie-based `COOKIE_OPTIONS.secure`, which
// was also a static value computed at import time rather than recomputed per call.
const COOKIE_SECURE = typeof window !== 'undefined' && window.location.protocol === 'https:'

// Matches js-cookie 3.x's `defaultConverter.write`: encodeURIComponent() escapes every
// non-alphanumeric character except `- _ . ! ~ * ' ( )`, and this un-escapes a further set of
// octets RFC 6265 allows unquoted in a cookie value. That keeps values — notably the base64
// payloads `encodeFeatureFlagCookie` produces, which lean on `+ / =` — byte-identical to what
// js-cookie would have written, so a cookie set by a prior js-cookie-based build still round-trips.
const COOKIE_VALUE_UNESCAPE_REGEX = /%(2[346BF]|3[AC-F]|40|5[BDE]|60|7[BCD])/g

function encodeCookieValue(value: string): string {
  return encodeURIComponent(value).replace(COOKIE_VALUE_UNESCAPE_REGEX, decodeURIComponent)
}

// Matches js-cookie's `defaultConverter.read`: strips one pair of wrapping quotes (some servers
// quote cookie values) and decodes every percent-escape — including ones this module never writes
// itself — so a value written by a prior js-cookie-based build still reads back correctly. A
// malformed percent-escape (e.g. a lone `%C3`) throws here, same as js-cookie — not a regression.
function decodeCookieValue(value: string): string {
  const unquoted = value[0] === '"' ? value.slice(1, -1) : value
  return unquoted.replace(/(%[\dA-F]{2})+/gi, decodeURIComponent)
}

/**
 * Read a single cookie's decoded value, or `undefined` if it is absent — the same contract as
 * js-cookie's `Cookies.get(name)`. `getFeatureFlagSnapshot`'s reference-stability cache compares
 * `raw === snapshotRaw`, so this must return `undefined` (not `''`) when the cookie is missing.
 *
 * `name` is always the literal `FF_COOKIE` constant here, so unlike js-cookie's generic `get()`
 * this intentionally skips cookie-*name* percent-encoding — there is no special character in
 * `FF_COOKIE` for it to matter, and encoding it would be untestable dead code.
 */
function readCookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined

  for (const pair of document.cookie ? document.cookie.split('; ') : []) {
    const separatorIndex = pair.indexOf('=')
    const rawName = separatorIndex === -1 ? pair : pair.slice(0, separatorIndex)
    const rawValue = separatorIndex === -1 ? '' : pair.slice(separatorIndex + 1)
    try {
      if (decodeURIComponent(rawName) !== name) continue
    } catch {
      // Malformed percent-encoding in the cookie name: skip it. js-cookie never decodes
      // names (only values), so there's no js-cookie behavior to match here — this is
      // purely a defensive parse guard.
      continue
    }
    return decodeCookieValue(rawValue)
  }
  return undefined
}

/**
 * Write a cookie with a fixed 365-day expiry. Emits `Expires` (a UTC date string), matching
 * js-cookie's handling of a numeric `expires` — not `Max-Age`, which would be equivalent in effect
 * but is a different serialized attribute.
 */
function writeCookie(name: string, value: string): void {
  if (typeof document === 'undefined') return

  const expires = new Date(Date.now() + COOKIE_MAX_AGE_DAYS * MS_PER_DAY).toUTCString()
  const attributes = [`path=${COOKIE_PATH}`, `expires=${expires}`, 'sameSite=lax']
  if (COOKIE_SECURE) attributes.push('secure')
  document.cookie = `${name}=${encodeCookieValue(value)}; ${attributes.join('; ')}`
}

/** Delete a cookie by writing an empty value with an already-past expiry. */
function deleteCookie(name: string): void {
  if (typeof document === 'undefined') return

  const expired = new Date(Date.now() - MS_PER_DAY).toUTCString()
  const attributes = [`path=${COOKIE_PATH}`, `expires=${expired}`]
  if (COOKIE_SECURE) attributes.push('secure')
  document.cookie = `${name}=; ${attributes.join('; ')}`
}

/**
 * Read feature-flag overrides from the `ff` cookie.
 *
 * **SSR safety**: This function calls `readCookie()` which reads `document.cookie`.
 * It must only be called from client-side code. Any component that uses it must be
 * wrapped in `dynamic(() => import(...), { ssr: false })` at the call site, or defer
 * the call to a `useEffect`. Calling during SSR will throw or produce a hydration mismatch.
 */
export function getFeatureFlagOverrides(): FeatureFlags {
  const value = readCookie(FF_COOKIE)
  if (!value) return {}
  return parseFeatureFlagCookie(value)
}

/** Stable empty-flags sentinel for use as `getServerSnapshot` in `useSyncExternalStore`. */
export const EMPTY_FEATURE_FLAGS: FeatureFlags = {}

/** Server-side snapshot for `useSyncExternalStore` — always returns the stable empty sentinel. */
export function getFeatureFlagServerSnapshot(): FeatureFlags {
  return EMPTY_FEATURE_FLAGS
}

let snapshotRaw: string | undefined
let snapshotCache: FeatureFlags = EMPTY_FEATURE_FLAGS

/**
 * Stable snapshot function for use with `useSyncExternalStore`.
 *
 * Returns the same object reference as long as the raw cookie value has not changed,
 * satisfying React's requirement that getSnapshot returns a cached/stable reference.
 * Server-side (where `document.cookie` is unavailable), returns the cached empty object.
 */
export function getFeatureFlagSnapshot(): FeatureFlags {
  const raw = readCookie(FF_COOKIE)
  if (raw === snapshotRaw) return snapshotCache
  snapshotRaw = raw
  snapshotCache = raw ? parseFeatureFlagCookie(raw) : {}
  return snapshotCache
}

/** Set a single feature-flag override in the `ff` cookie. Client-only — see {@link getFeatureFlagOverrides}. */
export function setFeatureFlagOverride(name: string, value: boolean): void {
  const overrides = getFeatureFlagOverrides()
  overrides[name] = value
  writeCookie(FF_COOKIE, encodeFeatureFlagCookie(overrides))
}

/** Remove a single feature-flag override from the `ff` cookie. Client-only — see {@link getFeatureFlagOverrides}. */
export function removeFeatureFlagOverride(name: string): void {
  const overrides = getFeatureFlagOverrides()
  const { [name]: _, ...rest } = overrides
  if (Object.keys(rest).length === 0) {
    deleteCookie(FF_COOKIE)
  } else {
    writeCookie(FF_COOKIE, encodeFeatureFlagCookie(rest))
  }
}

/** Remove all feature-flag overrides by deleting the `ff` cookie. Client-only — see {@link getFeatureFlagOverrides}. */
export function clearAllFeatureFlagOverrides(): void {
  deleteCookie(FF_COOKIE)
}

import 'server-only'

import { Buffer } from 'node:buffer'
import { cookies } from 'next/headers'
import {
  DEFAULT_FEATURE_FLAG_COOKIE_MAX_LENGTH,
  FF_COOKIE,
  parseFeatureFlagCookie as parseSharedFeatureFlagCookie,
  parseFeatureFlagCookieMaxLength,
  type FeatureFlagCookieCodec,
  type FeatureFlags,
} from '@ts-shared/feature-flags'
import { getFeatureFlags } from '@/lib/api/server/feature-flags'

const featureFlagCookieCodec: FeatureFlagCookieCodec = {
  encodeBase64: value => Buffer.from(value, 'utf8').toString('base64'),
  decodeBase64: value => Buffer.from(value, 'base64').toString('utf8'),
}

export async function getServerFeatureFlagOverrides(): Promise<FeatureFlags> {
  const cookieStore = await cookies()
  const raw = cookieStore.get(FF_COOKIE)?.value
  if (!raw) return {}

  return parseSharedFeatureFlagCookie(raw, featureFlagCookieCodec, {
    maxCookieLength: parseFeatureFlagCookieMaxLength(
      process.env.NEXT_PUBLIC_FEATURE_FLAG_COOKIE_MAX_LENGTH ??
        process.env.FEATURE_FLAG_COOKIE_MAX_LENGTH,
      DEFAULT_FEATURE_FLAG_COOKIE_MAX_LENGTH,
    ),
  })
}

export async function getEffectiveServerFeatureFlags(): Promise<FeatureFlags> {
  const overrides = await getServerFeatureFlagOverrides()
  return { ...(await getGlobalServerFeatureFlags()), ...overrides }
}

export interface GlobalFeatureFlagsFetchSuccess {
  ok: true
  flags: FeatureFlags
}

export interface GlobalFeatureFlagsFetchFailure {
  ok: false
  error: unknown
}

export type GlobalFeatureFlagsFetchResult =
  | GlobalFeatureFlagsFetchSuccess
  | GlobalFeatureFlagsFetchFailure

/**
 * Reads the cookie-less (global) flag set and reports success or failure as a discriminated
 * union instead of coercing a failed fetch into an empty flag set. A rejected fetch — a non-2xx,
 * a mid-deploy restart, a network blip, a timeout — is structurally distinct from "the backend
 * returned zero enabled flags", so callers are forced to name which case they are in rather than
 * silently treating "unreadable" as "off".
 */
export async function fetchGlobalServerFeatureFlags(): Promise<GlobalFeatureFlagsFetchResult> {
  try {
    const response = await getFeatureFlags({ headers: { Cookie: '' } })
    return { ok: true, flags: response.flags }
  } catch (error) {
    return { ok: false, error }
  }
}

export async function getGlobalServerFeatureFlags(): Promise<FeatureFlags> {
  const result = await fetchGlobalServerFeatureFlags()
  if (!result.ok) {
    // Pages must keep rendering with flags reading as "off" rather than 500ing, so this is not
    // rethrown — but a swallowed failure with no trace is exactly the bug this replaces, so it is
    // logged once, here, at the only place the distinction is discarded.
    console.error('getGlobalServerFeatureFlags: failed to read global feature flags', result.error)
    return {}
  }
  return result.flags
}

export async function getEffectiveServerFeatureFlag(name: string): Promise<boolean> {
  const flags = await getEffectiveServerFeatureFlags()
  return flags[name] === true
}

import {
  FF_COOKIE,
  safeFeatureFlagCookiePart as safeSharedFeatureFlagCookiePart,
} from '@ts-shared/feature-flags'
import {
  DEFAULT_FEATURE_FLAG_COOKIE_MAX_LENGTH,
  encodeFeatureFlagCookie as encodeSharedFeatureFlagCookie,
  parseFeatureFlagCookie as parseSharedFeatureFlagCookie,
  parseFeatureFlagCookieMaxLength,
  type FeatureFlagCookieCodec,
  type FeatureFlagCookieOptions,
  type FeatureFlags,
} from '@vouchington/utils/feature-flags'
import { getBrowserRuntimePublicConfig } from '@/lib/runtime-public-config'
import { featureFlagCookieMaxLengthFromEnv } from './cookie-max-length'

const featureFlagCookieCodec: FeatureFlagCookieCodec = {
  encodeBase64: value => btoa(String.fromCodePoint(...new TextEncoder().encode(value))),
  decodeBase64: value =>
    new TextDecoder().decode(Uint8Array.from(atob(value), c => c.codePointAt(0)!)),
}

function getFeatureFlagCookieOptions(): FeatureFlagCookieOptions {
  const runtimePublicConfig = getBrowserRuntimePublicConfig()
  if (runtimePublicConfig.featureFlagCookieMaxLength !== undefined) {
    return {
      maxCookieLength: parseFeatureFlagCookieMaxLength(
        String(runtimePublicConfig.featureFlagCookieMaxLength),
        DEFAULT_FEATURE_FLAG_COOKIE_MAX_LENGTH,
      ),
    }
  }
  // Browser reads keep the default until the runtime-public bootstrap arrives. Server
  // reads, including safe cookie forwarding, use the same resolution as that bootstrap.
  if (typeof window === 'undefined') {
    return { maxCookieLength: featureFlagCookieMaxLengthFromEnv() }
  }
  return { maxCookieLength: DEFAULT_FEATURE_FLAG_COOKIE_MAX_LENGTH }
}

export { FF_COOKIE, type FeatureFlags }

/**
 * Merges cookie overrides onto a loaded global catalog.
 *
 * Only keys present in that catalog can change, matching backend
 * `getFeatureFlagsWithOverrides`. An empty catalog means the global read failed,
 * so parsed boolean overrides stay in effect and every other flag stays off.
 */
export function mergeFeatureFlagOverrides(
  globalFlags: FeatureFlags,
  overrides: FeatureFlags,
): FeatureFlags {
  if (Object.keys(globalFlags).length === 0) return { ...overrides }

  const flags = { ...globalFlags }
  for (const [key, value] of Object.entries(overrides)) {
    if (Object.hasOwn(flags, key) && typeof value === 'boolean') flags[key] = value
  }
  return flags
}

export function parseFeatureFlagCookie(value: string): FeatureFlags {
  return parseSharedFeatureFlagCookie(value, featureFlagCookieCodec, getFeatureFlagCookieOptions())
}

export function encodeFeatureFlagCookie(overrides: FeatureFlags): string {
  return encodeSharedFeatureFlagCookie(overrides, featureFlagCookieCodec)
}

export function safeFeatureFlagCookiePart(cookieValue: string | undefined): string | null {
  return safeSharedFeatureFlagCookiePart(cookieValue, getFeatureFlagCookieOptions())
}

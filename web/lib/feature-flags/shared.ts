import {
  DEFAULT_FEATURE_FLAG_COOKIE_MAX_LENGTH,
  FF_COOKIE,
  encodeFeatureFlagCookie as encodeSharedFeatureFlagCookie,
  parseFeatureFlagCookie as parseSharedFeatureFlagCookie,
  parseFeatureFlagCookieMaxLength,
  safeFeatureFlagCookiePart as safeSharedFeatureFlagCookiePart,
  type FeatureFlagCookieCodec,
  type FeatureFlagCookieOptions,
  type FeatureFlags,
} from '@ts-shared/feature-flags'
import { getBrowserRuntimePublicConfig } from '@/lib/runtime-public-config'

const featureFlagCookieCodec: FeatureFlagCookieCodec = {
  encodeBase64: value => btoa(String.fromCodePoint(...new TextEncoder().encode(value))),
  decodeBase64: value =>
    new TextDecoder().decode(Uint8Array.from(atob(value), c => c.codePointAt(0)!)),
}

function getFeatureFlagCookieOptions(): FeatureFlagCookieOptions {
  const runtimePublicConfig = getBrowserRuntimePublicConfig()
  const fallbackMaxCookieLength =
    typeof window === 'undefined'
      ? (process.env.NEXT_PUBLIC_FEATURE_FLAG_COOKIE_MAX_LENGTH ??
        process.env.FEATURE_FLAG_COOKIE_MAX_LENGTH)
      : undefined
  return {
    maxCookieLength: parseFeatureFlagCookieMaxLength(
      runtimePublicConfig.featureFlagCookieMaxLength === undefined
        ? fallbackMaxCookieLength
        : String(runtimePublicConfig.featureFlagCookieMaxLength),
      DEFAULT_FEATURE_FLAG_COOKIE_MAX_LENGTH,
    ),
  }
}

export { FF_COOKIE, type FeatureFlags }

export function parseFeatureFlagCookie(value: string): FeatureFlags {
  return parseSharedFeatureFlagCookie(value, featureFlagCookieCodec, getFeatureFlagCookieOptions())
}

export function encodeFeatureFlagCookie(overrides: FeatureFlags): string {
  return encodeSharedFeatureFlagCookie(overrides, featureFlagCookieCodec)
}

export function safeFeatureFlagCookiePart(cookieValue: string | undefined): string | null {
  return safeSharedFeatureFlagCookiePart(cookieValue, getFeatureFlagCookieOptions())
}

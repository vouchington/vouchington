import {
  DEFAULT_FEATURE_FLAG_COOKIE_MAX_LENGTH,
  encodeFeatureFlagCookie,
  extractBooleanFeatureFlags,
  parseFeatureFlagCookie,
  parseFeatureFlagCookieMaxLength,
  safeFeatureFlagCookiePart as createSafeFeatureFlagCookiePart,
} from '@vouchington/utils/feature-flags'

export type {
  FeatureFlagCookieCodec,
  FeatureFlagCookieOptions,
  FeatureFlags,
} from '@vouchington/utils/feature-flags'

export {
  DEFAULT_FEATURE_FLAG_COOKIE_MAX_LENGTH,
  encodeFeatureFlagCookie,
  extractBooleanFeatureFlags,
  parseFeatureFlagCookie,
  parseFeatureFlagCookieMaxLength,
}

export const FF_COOKIE = 'ff'

export function safeFeatureFlagCookiePart(
  cookieValue: string | undefined,
  options: import('@vouchington/utils/feature-flags').FeatureFlagCookieOptions = {},
): string | null {
  return createSafeFeatureFlagCookiePart(FF_COOKIE, cookieValue, options)
}

import {
  safeFeatureFlagCookiePart as createSafeFeatureFlagCookiePart,
  type FeatureFlagCookieOptions,
} from '@vouchington/utils/feature-flags'

export const FF_COOKIE = 'ff'

export function safeFeatureFlagCookiePart(
  cookieValue: string | undefined,
  options: FeatureFlagCookieOptions = {},
): string | null {
  return createSafeFeatureFlagCookiePart(FF_COOKIE, cookieValue, options)
}

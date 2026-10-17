import {
  DEFAULT_FEATURE_FLAG_COOKIE_MAX_LENGTH,
  parseFeatureFlagCookieMaxLength,
} from '@ts-shared/feature-flags'

function cleanRuntimeEnv(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  // SSM injects PLACEHOLDER for an unset runtime-public value. Treat that, and a blank
  // value, as missing so the non-public feature-flag length can apply.
  if (trimmed === 'PLACEHOLDER') return undefined
  return trimmed ? trimmed : undefined
}

export function featureFlagCookieMaxLengthFromEnv(
  env: Record<string, string | undefined> = process.env,
): number {
  return parseFeatureFlagCookieMaxLength(
    cleanRuntimeEnv(env.NEXT_PUBLIC_FEATURE_FLAG_COOKIE_MAX_LENGTH) ??
      cleanRuntimeEnv(env.FEATURE_FLAG_COOKIE_MAX_LENGTH),
    DEFAULT_FEATURE_FLAG_COOKIE_MAX_LENGTH,
  )
}

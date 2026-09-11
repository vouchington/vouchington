import { Buffer } from 'node:buffer'
import {
  DEFAULT_FEATURE_FLAG_COOKIE_MAX_LENGTH,
  encodeFeatureFlagCookie as encodeSharedFeatureFlagCookie,
  extractBooleanFeatureFlags,
  parseFeatureFlagCookieMaxLength,
  parseFeatureFlagCookie as parseSharedFeatureFlagCookie,
  type FeatureFlagCookieCodec,
  type FeatureFlagCookieOptions,
  type FeatureFlags,
} from '@ts-shared/feature-flags'
import { featureFlagsConfig } from './config.mts'

export type { FeatureFlags } from '@ts-shared/feature-flags'

const featureFlagCookieCodec: FeatureFlagCookieCodec = {
  encodeBase64: value => Buffer.from(value, 'utf8').toString('base64'),
  decodeBase64: value => Buffer.from(value, 'base64').toString('utf8'),
}

function getFeatureFlagCookieOptions(): FeatureFlagCookieOptions {
  return {
    maxCookieLength: parseFeatureFlagCookieMaxLength(
      process.env.FEATURE_FLAG_COOKIE_MAX_LENGTH,
      DEFAULT_FEATURE_FLAG_COOKIE_MAX_LENGTH,
    ),
  }
}

export function getFeatureFlags(): FeatureFlags {
  return {
    ...extractBooleanFeatureFlags(featureFlagsConfig.defaultFields),
    ...extractBooleanFeatureFlags(featureFlagsConfig.getFields()),
  }
}

export function getFeatureFlagsWithOverrides(overrides: FeatureFlags): FeatureFlags {
  const flags = getFeatureFlags()
  for (const [key, value] of Object.entries(overrides)) {
    if (Object.hasOwn(flags, key) && typeof value === 'boolean') {
      flags[key] = value
    }
  }
  return flags
}

export function parseFeatureFlagCookie(cookieValue: string): FeatureFlags {
  return parseSharedFeatureFlagCookie(
    cookieValue,
    featureFlagCookieCodec,
    getFeatureFlagCookieOptions(),
  )
}

export function encodeFeatureFlagCookie(overrides: FeatureFlags): string {
  return encodeSharedFeatureFlagCookie(overrides, featureFlagCookieCodec)
}

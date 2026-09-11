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

export async function getGlobalServerFeatureFlags(): Promise<FeatureFlags> {
  return getFeatureFlags({ headers: { Cookie: '' } })
    .then(response => response.flags)
    .catch(() => ({}))
}

export async function getEffectiveServerFeatureFlag(name: string): Promise<boolean> {
  const flags = await getEffectiveServerFeatureFlags()
  return flags[name] === true
}

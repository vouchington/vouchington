import { Buffer } from 'node:buffer'
import type { Page } from '@playwright/test'
import {
  encodeFeatureFlagCookie,
  type FeatureFlagCookieCodec,
  type FeatureFlags,
} from '@vouchington/utils/feature-flags'
import { FF_COOKIE } from '../../ts-shared/feature-flags/index.mts'
import { cookieOrigin } from './cookie-origin.mts'

const featureFlagCookieCodec: FeatureFlagCookieCodec = {
  encodeBase64: value => Buffer.from(value, 'utf8').toString('base64'),
  decodeBase64: value => Buffer.from(value, 'base64').toString('utf8'),
}

type SetFeatureFlagsDependencies = {
  cookieOrigin: typeof cookieOrigin
}

export async function setFeatureFlags(
  page: Page,
  overrides: FeatureFlags,
  dependencies?: Partial<SetFeatureFlagsDependencies>,
): Promise<void> {
  const value = encodeFeatureFlagCookie(overrides, featureFlagCookieCodec)

  await page.context().addCookies([
    {
      name: FF_COOKIE,
      value,
      url: (dependencies?.cookieOrigin ?? cookieOrigin)(),
      sameSite: 'Lax',
    },
  ])
}

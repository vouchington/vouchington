import { Buffer } from 'node:buffer'
import type { Page } from '@playwright/test'
import {
  FF_COOKIE,
  encodeFeatureFlagCookie,
  type FeatureFlagCookieCodec,
  type FeatureFlags,
} from '../../ts-shared/feature-flags/index.mts'
import { retryOnConnectionLost } from './retry-on-connection-lost.mts'

const featureFlagCookieCodec: FeatureFlagCookieCodec = {
  encodeBase64: value => Buffer.from(value, 'utf8').toString('base64'),
  decodeBase64: value => Buffer.from(value, 'base64').toString('utf8'),
}

type SetFeatureFlagsDependencies = {
  retryOnConnectionLost: typeof retryOnConnectionLost
}

export async function setFeatureFlags(
  page: Page,
  overrides: FeatureFlags,
  dependencies?: Partial<SetFeatureFlagsDependencies>,
): Promise<void> {
  const retry = dependencies?.retryOnConnectionLost ?? retryOnConnectionLost
  const value = encodeFeatureFlagCookie(overrides, featureFlagCookieCodec)

  await retry(async () => {
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 15_000 })
    const origin = new URL(page.url()).origin

    await page.context().addCookies([
      {
        name: FF_COOKIE,
        value,
        url: origin,
        sameSite: 'Lax',
      },
    ])
  })
}

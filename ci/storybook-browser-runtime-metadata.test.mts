import { describe, expect, it } from 'vitest'

import { storybookBrowserRuntimeMetadata } from './storybook-browser-runtime-metadata.mts'

describe('Storybook browser runtime metadata', () => {
  it('records the dependency and Chromium versions needed for an upstream issue', () => {
    const metadata = storybookBrowserRuntimeMetadata()

    expect(metadata).toMatchObject({
      architecture: process.arch,
      node: process.version,
      platform: process.platform,
    })
    for (const value of [
      metadata.chromium,
      metadata.playwright,
      metadata.storybookAddonVitest,
      metadata.vitest,
      metadata.vitestBrowserPlaywright,
    ]) {
      expect(value).toMatch(/^\d+\.\d+/)
    }
  })
})

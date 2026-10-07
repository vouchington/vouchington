import type { BrowserContext, FullConfig, TestInfo } from '@playwright/test'
import { describe, expect, it } from 'vitest'
import { createPlaywrightConfig } from '../playwright/config/shared-config.mts'
import {
  assertResolvedPlaywrightTimeouts,
  validatePlaywrightConfigTimeouts,
} from '../playwright/config/test-timeout.mts'
import { browserErrorsFixture } from '../playwright/helpers/test.mts'

const baseOptions = {
  backendCommand: 'node backend/entrypoints/api/serve.mts',
  junitOutputFile: 'test-report.junit.xml',
  reuseExistingServer: false,
  testDir: './playwright/tests',
}

describe('Playwright test deadline cap', () => {
  it.each([0, -1, 30_001, Number.POSITIVE_INFINITY, Number.NaN])(
    'rejects invalid test timeout %s',
    timeout => {
      expect(() =>
        createPlaywrightConfig({
          ...baseOptions,
          projects: [{ name: 'chromium' }],
          timeout,
        }),
      ).toThrow(RangeError)
    },
  )

  it.each([0, -1, 30_001, Number.POSITIVE_INFINITY, Number.NaN])(
    'rejects invalid project timeout %s',
    timeout => {
      expect(() =>
        createPlaywrightConfig({
          ...baseOptions,
          projects: [{ name: 'chromium', timeout }],
          timeout: 30_000,
        }),
      ).toThrow(RangeError)
    },
  )

  it('accepts a positive project timeout at the 30-second ceiling', () => {
    const config = createPlaywrightConfig({
      ...baseOptions,
      projects: [{ name: 'chromium', timeout: 30_000 }],
      timeout: 30_000,
    })
    expect(config.timeout).toBe(30_000)
    expect(config.projects?.[0]?.timeout).toBe(30_000)
  })

  it('rejects an over-limit project in a raw Playwright config', () => {
    expect(() =>
      validatePlaywrightConfigTimeouts({
        timeout: 30_000,
        projects: [{ name: 'localization', timeout: 30_001 }],
      }),
    ).toThrow(RangeError)
  })

  it.each([0, 30_001, Number.POSITIVE_INFINITY, Number.NaN])(
    'rejects effective timeout %s before monitoring and the test body',
    async timeout => {
      let ran = false
      await expect(
        browserErrorsFixture(
          { context: {} as BrowserContext },
          async () => {
            ran = true
          },
          { timeout } as TestInfo,
        ),
      ).rejects.toThrow(RangeError)
      expect(ran).toBe(false)
    },
  )

  it.each([0, 30_001, Number.POSITIVE_INFINITY, Number.NaN])(
    'rejects resolved project timeout %s before global setup work',
    timeout => {
      const config = {
        projects: [{ name: 'chromium', timeout }],
      } as unknown as Pick<FullConfig, 'projects'>
      expect(() => assertResolvedPlaywrightTimeouts(config)).toThrow(RangeError)
    },
  )

  it('accepts a resolved project at the ceiling', () => {
    const config = {
      projects: [{ name: 'chromium', timeout: 30_000 }],
    } as unknown as Pick<FullConfig, 'projects'>
    expect(() => assertResolvedPlaywrightTimeouts(config)).not.toThrow()
  })
})

import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { createPlaywrightConfig } from '../playwright/config/shared-config.mts'
import {
  assertResolvedPlaywrightTimeouts,
  playwrightTimeoutFixture,
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
  it('resolves the localization global setup from its config directory', async () => {
    vi.stubEnv('WORKER_PORT', '8787')
    vi.stubEnv('LOCALIZATION_TMUX_WORKER_URL', 'http://localhost:8787')
    try {
      const { default: config } = await import('../playwright/localization-tmux.config.mts')
      const configPath = fileURLToPath(
        new URL('../playwright/localization-tmux.config.mts', import.meta.url),
      )
      const setup = config.globalSetup
      if (typeof setup !== 'string') throw new TypeError('Expected one localization global setup')
      expect(existsSync(resolve(dirname(configPath), setup))).toBe(true)
    } finally {
      vi.unstubAllEnvs()
    }
  })

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
          { context: {} as Parameters<typeof browserErrorsFixture>[0]['context'] },
          async () => {
            ran = true
          },
          { timeout } as Parameters<typeof browserErrorsFixture>[2],
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
      } as unknown as Parameters<typeof assertResolvedPlaywrightTimeouts>[0]
      expect(() => assertResolvedPlaywrightTimeouts(config)).toThrow(RangeError)
    },
  )

  it('accepts a resolved project at the ceiling', () => {
    const config = {
      projects: [{ name: 'chromium', timeout: 30_000 }],
    } as unknown as Parameters<typeof assertResolvedPlaywrightTimeouts>[0]
    expect(() => assertResolvedPlaywrightTimeouts(config)).not.toThrow()
  })
})

describe('browser-free timeout guard', () => {
  it.each([0, 30_001, Number.POSITIVE_INFINITY, Number.NaN])(
    'rejects effective timeout %s in the browser-free guard before hooks',
    async timeout => {
      const use = vi.fn<() => Promise<void>>()
      await expect(
        playwrightTimeoutFixture({}, use, { timeout } as Parameters<
          typeof playwrightTimeoutFixture
        >[2]),
      ).rejects.toThrow(RangeError)
      expect(use).not.toHaveBeenCalled()
    },
  )
})

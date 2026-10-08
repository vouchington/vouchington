import { tmpdir } from 'node:os'

import { afterEach, describe, expect, it, vi } from 'vitest'

const originalEnv = { ...process.env }
// Cache-busting queries re-evaluate the module for current process.env without tsc resolving the URL.
const environmentModulePath = '../test-helpers/vitest-config/environment.mts'
const importEnvironmentModule = (
  cacheBustingQuery: string,
): Promise<typeof import('../test-helpers/vitest-config/environment.mts')> =>
  import(`${environmentModulePath}?${cacheBustingQuery}`)

describe('Storybook browser Vitest environment overrides', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    process.env = { ...originalEnv }
  })

  it('uses explicit browser cache, API port, and connection timeout env overrides', async () => {
    process.env = {
      ...originalEnv,
      CI: 'true',
      STORYBOOK_BROWSER_HANG_MS: '150000',
      VITEST_STORYBOOK_BROWSER_API_PORT: '49231',
      VITEST_STORYBOOK_BROWSER_CACHE_DIR: '/tmp/storybook-browser-cache',
    }

    const envConfig = await importEnvironmentModule('storybook-browser-overrides')

    expect(envConfig.storybookBrowserCacheDir).toBe('/tmp/storybook-browser-cache')
    expect(envConfig.parseStorybookBrowserApiPort()).toBe(49_231)
    expect(envConfig.parseStorybookBrowserConnectTimeout()).toBe(150_000)
  })

  it.each(['1', '27519989871'])(
    'uses a fixed CI cache and no implicit API port for run %s',
    async run => {
      process.env = {
        ...originalEnv,
        CI: 'true',
        GITHUB_JOB: `job-${run}`,
        GITHUB_RUN_ATTEMPT: run,
        GITHUB_RUN_ID: run,
        RUNNER_TEMP: '/runner-temp',
      }
      delete process.env.VITEST_STORYBOOK_BROWSER_API_PORT
      delete process.env.VITEST_STORYBOOK_BROWSER_CACHE_DIR
      delete process.env.STORYBOOK_BROWSER_HANG_MS

      const envConfig = await importEnvironmentModule(`storybook-browser-fixed-${run}`)

      expect(envConfig.storybookBrowserCacheDir).toBe('/runner-temp/vite-storybook-browser')
      expect(envConfig.parseStorybookBrowserApiPort()).toBeUndefined()
      expect(envConfig.parseStorybookBrowserConnectTimeout()).toBe(120_000)
    },
  )

  it('falls back to OS temp when CI RUNNER_TEMP is blank', async () => {
    process.env = {
      ...originalEnv,
      CI: 'true',
      GITHUB_JOB: 'storybook',
      GITHUB_RUN_ATTEMPT: '2',
      GITHUB_RUN_ID: '27519989871',
      RUNNER_TEMP: '',
    }
    delete process.env.VITEST_STORYBOOK_BROWSER_API_PORT
    delete process.env.VITEST_STORYBOOK_BROWSER_CACHE_DIR

    const envConfig = await importEnvironmentModule('storybook-browser-blank-runner-temp')

    expect(envConfig.storybookBrowserCacheDir).toBe(`${tmpdir()}/vite-storybook-browser`)
  })

  it.each(['invalid', '0', '1.5'])('leaves an invalid explicit API port %s unset', async port => {
    vi.stubEnv('CI', 'true')
    vi.stubEnv('GITHUB_RUN_ID', '123')
    vi.stubEnv('VITEST_STORYBOOK_BROWSER_API_PORT', port)
    const envConfig = await importEnvironmentModule(
      `storybook-browser-invalid-${port.replace('.', '-')}`,
    )
    expect(envConfig.parseStorybookBrowserApiPort()).toBeUndefined()
  })

  it('strips JSON import attributes for browser-story dependencies', async () => {
    const storybookBrowserProjectModulePath =
      '../test-helpers/vitest-config/storybook-browser-project.mts'
    const {
      stripJsonImportAttributes,
    }: typeof import('../test-helpers/vitest-config/storybook-browser-project.mts') = await import(
      `${storybookBrowserProjectModulePath}?json-attributes`
    )

    expect(
      stripJsonImportAttributes(
        [
          "import one from './one.json' with { type: 'json' }",
          'import two from "./two.json" assert { type: "json" }',
        ].join('\n'),
      ),
    ).toBe(["import one from './one.json'", 'import two from "./two.json"'].join('\n'))
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'

const TRACKED_ENV_KEYS = [
  'PORT',
  'WORKER_PORT',
  'WEB_PORT',
  'NEXT_PORT',
  'IMAGE_LAMBDA_PORT',
  'S3_BUCKET_IMAGES',
  'S3_BUCKET_RENDERS',
  'ALLOW_TURNSTILE_TEST_KEY',
  'NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY',
  'NEXT_PUBLIC_ASSET_PREFIX',
  'GTM_ID',
  'NEXT_PUBLIC_GTM_ID',
] as const

const ORIGINAL_ENV = Object.fromEntries(TRACKED_ENV_KEYS.map(key => [key, process.env[key]]))

function loadPlaywrightConfig() {
  vi.resetModules()
  return import('../playwright/config/shared-config.mts')
}

describe('Playwright shared config', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    for (const key of TRACKED_ENV_KEYS) {
      const value = ORIGINAL_ENV[key]
      if (value === undefined) Reflect.deleteProperty(process.env, key)
      else process.env[key] = value
    }
    vi.resetModules()
  })

  it.each([
    {
      label: 'default',
      envOverrides: {},
      expected: {
        WEB_PORT: '3000',
        PORT: '2900',
        WORKER_PORT: '8787',
        S3_BUCKET_IMAGES: 'test-images',
        S3_BUCKET_RENDERS: 'test-renders',
      },
    },
    {
      label: 'explicit',
      envOverrides: {
        WEB_PORT: '3900',
        PORT: '3901',
        WORKER_PORT: '3902',
        S3_BUCKET_IMAGES: 'credentialed-images',
        S3_BUCKET_RENDERS: 'credentialed-renders',
      },
      expected: {
        WEB_PORT: '3900',
        PORT: '3901',
        WORKER_PORT: '3902',
        S3_BUCKET_IMAGES: 'credentialed-images',
        S3_BUCKET_RENDERS: 'credentialed-renders',
      },
    },
  ])(
    'passes $label local ports to Playwright web server processes',
    async ({ envOverrides, expected }) => {
      delete process.env.PORT
      delete process.env.WORKER_PORT
      delete process.env.WEB_PORT
      delete process.env.NEXT_PORT
      delete process.env.IMAGE_LAMBDA_PORT
      delete process.env.S3_BUCKET_IMAGES
      delete process.env.S3_BUCKET_RENDERS
      delete process.env.GTM_ID
      delete process.env.NEXT_PUBLIC_GTM_ID
      Object.assign(process.env, envOverrides)
      const { CHROMIUM_USE, createVouchaPlaywrightConfig } = await loadPlaywrightConfig()

      const config = createVouchaPlaywrightConfig({
        backendCommand: 'node backend/entrypoints/api/serve.mts',
        junitOutputFile: 'test-report.junit.xml',
        projects: [{ name: 'chromium', use: CHROMIUM_USE }],
        reuseExistingServer: false,
        testDir: './playwright/tests',
        timeout: 30_000,
      })

      const webServers = Array.isArray(config.webServer) ? config.webServer : []
      const webServer = webServers.find(server => server.name === 'web')
      const backendServer = webServers.find(server => server.name === 'backend')
      const lambdaServer = webServers.find(server => server.name === 'lambdas')
      const workerServer = webServers.find(server => server.name === 'cloudflare-worker')
      expect(webServer?.env).toMatchObject({
        ALLOW_TURNSTILE_TEST_KEY: 'true',
        GTM_ID: 'GTM-PLAYWRIGHT',
        NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY: expect.any(String),
        PORT: expected.WEB_PORT,
      })
      expect(backendServer?.env).toMatchObject({ PORT: expected.PORT })
      expect(lambdaServer?.env).toMatchObject({
        IMAGE_LAMBDA_PORT: '3100',
        S3_BUCKET_IMAGES: expected.S3_BUCKET_IMAGES,
        S3_BUCKET_RENDERS: expected.S3_BUCKET_RENDERS,
      })
      expect(workerServer?.env).toMatchObject({ WORKER_PORT: expected.WORKER_PORT })
    },
  )

  it('preserves an explicit Turnstile test-key opt-out for the Playwright web server', async () => {
    process.env.ALLOW_TURNSTILE_TEST_KEY = 'false'
    const { CHROMIUM_USE, createVouchaPlaywrightConfig } = await loadPlaywrightConfig()

    const config = createVouchaPlaywrightConfig({
      backendCommand: 'node backend/entrypoints/api/serve.mts',
      junitOutputFile: 'test-report.junit.xml',
      projects: [{ name: 'chromium', use: CHROMIUM_USE }],
      reuseExistingServer: false,
      testDir: './playwright/tests',
      timeout: 30_000,
    })

    const webServers = Array.isArray(config.webServer) ? config.webServer : []
    const webServer = webServers.find(server => server.name === 'web')
    expect(webServer?.env).toMatchObject({ ALLOW_TURNSTILE_TEST_KEY: 'false' })
  })

  it('preserves an explicit GTM id for the Playwright web server', async () => {
    process.env.GTM_ID = 'GTM-EXPLICIT'
    const { CHROMIUM_USE, createVouchaPlaywrightConfig } = await loadPlaywrightConfig()

    const config = createVouchaPlaywrightConfig({
      backendCommand: 'node backend/entrypoints/api/serve.mts',
      junitOutputFile: 'test-report.junit.xml',
      projects: [{ name: 'chromium', use: CHROMIUM_USE }],
      reuseExistingServer: false,
      testDir: './playwright/tests',
      timeout: 30_000,
    })

    const webServers = Array.isArray(config.webServer) ? config.webServer : []
    const webServer = webServers.find(server => server.name === 'web')
    expect(webServer?.env).toMatchObject({ GTM_ID: 'GTM-EXPLICIT' })
  })

  it('preserves an explicit web push public key for the Playwright web server', async () => {
    process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY = 'explicit-push-key'
    const { CHROMIUM_USE, createVouchaPlaywrightConfig } = await loadPlaywrightConfig()

    const config = createVouchaPlaywrightConfig({
      backendCommand: 'node backend/entrypoints/api/serve.mts',
      junitOutputFile: 'test-report.junit.xml',
      projects: [{ name: 'chromium', use: CHROMIUM_USE }],
      reuseExistingServer: false,
      testDir: './playwright/tests',
      timeout: 30_000,
    })

    const webServers = Array.isArray(config.webServer) ? config.webServer : []
    const webServer = webServers.find(server => server.name === 'web')
    expect(webServer?.env).toMatchObject({
      NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY: 'explicit-push-key',
    })
  })

  it.each([
    ['default Next port', 'http://localhost', undefined, '3000'],
    ['explicit Next port', 'http://localhost', '3900', '3900'],
    ['trailing-slash origin', 'http://localhost/', '3901', '3901'],
    ['explicit default-port origin', 'http://localhost:80', '3902', '3902'],
  ])('maps the fixed asset origin to the %s', async (_, assetPrefix, nextPort, expectedPort) => {
    process.env.NEXT_PUBLIC_ASSET_PREFIX = assetPrefix
    delete process.env.WEB_PORT
    if (nextPort === undefined) delete process.env.NEXT_PORT
    else process.env.NEXT_PORT = nextPort

    const { CHROMIUM_USE } = await loadPlaywrightConfig()

    expect(CHROMIUM_USE.launchOptions?.args).toContain(
      `--host-resolver-rules=MAP localhost:80 127.0.0.1:${expectedPort}`,
    )
  })

  it.each(['https://assets.example.test', 'http://localhost:3900'])(
    'does not remap the unrelated asset origin %s',
    async assetPrefix => {
      process.env.NEXT_PUBLIC_ASSET_PREFIX = assetPrefix

      const { CHROMIUM_USE } = await loadPlaywrightConfig()

      expect(CHROMIUM_USE.launchOptions?.args).toBeUndefined()
    },
  )

  it('falls back to the Next origin when the configured asset prefix is invalid', async () => {
    process.env.NEXT_PUBLIC_ASSET_PREFIX = 'not-a-url'
    delete process.env.NEXT_PORT
    delete process.env.WEB_PORT

    const { CHROMIUM_USE, createVouchaPlaywrightConfig } = await loadPlaywrightConfig()
    const config = createVouchaPlaywrightConfig({
      backendCommand: 'node backend/entrypoints/api/serve.mts',
      junitOutputFile: 'test-report.junit.xml',
      projects: [{ name: 'chromium', use: CHROMIUM_USE }],
      reuseExistingServer: false,
      testDir: './playwright/tests',
      timeout: 30_000,
    })
    const webServers = Array.isArray(config.webServer) ? config.webServer : []
    const workerServer = webServers.find(server => server.name === 'cloudflare-worker')

    expect(workerServer?.env).toMatchObject({ CSP_ASSET_ORIGIN: 'http://localhost:3000' })
  })
  // pnpm may install separate peer-variant copies of vouchington-tooling per workspace package, so
  // the reporter path can resolve to a sibling copy; match the package-relative path instead.
  const lifecycleReporterPathPattern =
    /vouchington-tooling\/dist\/playwright\/test-lifecycle-reporter\.mjs$/u
  it.each([
    ['ordinary', () => import('../playwright.config.mts'), ['setup', 'chromium']],
    ['credentialed', () => import('../playwright.credentialed.config.mts'), ['chromium']],
  ] as const)(
    'selects the lifecycle gate for every %s CI project',
    async (_, load, projectNames) => {
      vi.stubEnv('CI', '1')
      vi.resetModules()
      const { default: config } = await load()
      expect(config.reporter).toEqual(
        expect.arrayContaining([
          ['github'],
          ['junit', { outputFile: expect.any(String) }],
          [expect.stringMatching(lifecycleReporterPathPattern), { failOnSkippedTests: true }],
          [expect.stringMatching(/playwright\/config\/api-test-server-guard-reporter\.mts$/u)],
        ]),
      )
      expect(config.projects?.map(project => project.name)).toEqual(projectNames)
      expect(config.forbidOnly).toBe(true)
    },
  )

  it('preserves the existing local HTML reporter selection', async () => {
    vi.stubEnv('CI', '')
    const { CHROMIUM_USE, createVouchaPlaywrightConfig } = await loadPlaywrightConfig()
    const config = createVouchaPlaywrightConfig({
      backendCommand: 'node backend/entrypoints/api/serve.mts',
      junitOutputFile: 'local-results.xml',
      projects: [{ name: 'chromium', use: CHROMIUM_USE }],
      reuseExistingServer: false,
      testDir: './playwright/tests',
      timeout: 30_000,
    })
    expect(config.reporter).toEqual([
      ['html', { open: 'never' }],
      [expect.stringMatching(/api-test-server-guard-reporter\.mts$/u)],
    ])
  })
})

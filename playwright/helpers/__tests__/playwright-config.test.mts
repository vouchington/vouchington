import { afterEach, describe, expect, it, vi } from 'vitest'

const ORIGINAL_PORT = process.env.PORT
const ORIGINAL_WORKER_PORT = process.env.WORKER_PORT
const ORIGINAL_WEB_PORT = process.env.WEB_PORT
const ORIGINAL_NEXT_PORT = process.env.NEXT_PORT
const ORIGINAL_IMAGE_LAMBDA_PORT = process.env.IMAGE_LAMBDA_PORT
const ORIGINAL_S3_BUCKET_IMAGES = process.env.S3_BUCKET_IMAGES
const ORIGINAL_S3_BUCKET_RENDERS = process.env.S3_BUCKET_RENDERS
const ORIGINAL_ALLOW_TURNSTILE_TEST_KEY = process.env.ALLOW_TURNSTILE_TEST_KEY
const ORIGINAL_NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY = process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY
const ORIGINAL_NEXT_PUBLIC_ASSET_PREFIX = process.env.NEXT_PUBLIC_ASSET_PREFIX

function loadPlaywrightConfig() {
  vi.resetModules()
  return import('../../config/shared-config.mts')
}

describe('Playwright shared config', () => {
  afterEach(() => {
    if (ORIGINAL_PORT === undefined) {
      delete process.env.PORT
    } else {
      process.env.PORT = ORIGINAL_PORT
    }
    if (ORIGINAL_WORKER_PORT === undefined) {
      delete process.env.WORKER_PORT
    } else {
      process.env.WORKER_PORT = ORIGINAL_WORKER_PORT
    }
    if (ORIGINAL_WEB_PORT === undefined) {
      delete process.env.WEB_PORT
    } else {
      process.env.WEB_PORT = ORIGINAL_WEB_PORT
    }
    if (ORIGINAL_NEXT_PORT === undefined) {
      delete process.env.NEXT_PORT
    } else {
      process.env.NEXT_PORT = ORIGINAL_NEXT_PORT
    }
    if (ORIGINAL_IMAGE_LAMBDA_PORT === undefined) {
      delete process.env.IMAGE_LAMBDA_PORT
    } else {
      process.env.IMAGE_LAMBDA_PORT = ORIGINAL_IMAGE_LAMBDA_PORT
    }
    if (ORIGINAL_S3_BUCKET_IMAGES === undefined) {
      delete process.env.S3_BUCKET_IMAGES
    } else {
      process.env.S3_BUCKET_IMAGES = ORIGINAL_S3_BUCKET_IMAGES
    }
    if (ORIGINAL_S3_BUCKET_RENDERS === undefined) {
      delete process.env.S3_BUCKET_RENDERS
    } else {
      process.env.S3_BUCKET_RENDERS = ORIGINAL_S3_BUCKET_RENDERS
    }
    if (ORIGINAL_ALLOW_TURNSTILE_TEST_KEY === undefined) {
      delete process.env.ALLOW_TURNSTILE_TEST_KEY
    } else {
      process.env.ALLOW_TURNSTILE_TEST_KEY = ORIGINAL_ALLOW_TURNSTILE_TEST_KEY
    }
    if (ORIGINAL_NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY === undefined) {
      delete process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY
    } else {
      process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY = ORIGINAL_NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY
    }
    if (ORIGINAL_NEXT_PUBLIC_ASSET_PREFIX === undefined) {
      delete process.env.NEXT_PUBLIC_ASSET_PREFIX
    } else {
      process.env.NEXT_PUBLIC_ASSET_PREFIX = ORIGINAL_NEXT_PUBLIC_ASSET_PREFIX
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
      Object.assign(process.env, envOverrides)
      const { CHROMIUM_USE, createPlaywrightConfig } = await loadPlaywrightConfig()

      const config = createPlaywrightConfig({
        backendCommand: 'node backend/entrypoints/api/serve.mts',
        junitOutputFile: 'test-report.junit.xml',
        projects: [{ name: 'chromium', use: CHROMIUM_USE }],
        reuseExistingServer: false,
        testDir: './playwright/tests',
        timeout: 60_000,
      })

      const webServers = Array.isArray(config.webServer) ? config.webServer : []
      const webServer = webServers.find(server => server.name === 'web')
      const backendServer = webServers.find(server => server.name === 'backend')
      const lambdaServer = webServers.find(server => server.name === 'lambdas')
      const workerServer = webServers.find(server => server.name === 'cloudflare-worker')
      expect(webServer?.env).toMatchObject({
        ALLOW_TURNSTILE_TEST_KEY: 'true',
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
    const { CHROMIUM_USE, createPlaywrightConfig } = await loadPlaywrightConfig()

    const config = createPlaywrightConfig({
      backendCommand: 'node backend/entrypoints/api/serve.mts',
      junitOutputFile: 'test-report.junit.xml',
      projects: [{ name: 'chromium', use: CHROMIUM_USE }],
      reuseExistingServer: false,
      testDir: './playwright/tests',
      timeout: 60_000,
    })

    const webServers = Array.isArray(config.webServer) ? config.webServer : []
    const webServer = webServers.find(server => server.name === 'web')
    expect(webServer?.env).toMatchObject({ ALLOW_TURNSTILE_TEST_KEY: 'false' })
  })

  it('preserves an explicit web push public key for the Playwright web server', async () => {
    process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY = 'explicit-push-key'
    const { CHROMIUM_USE, createPlaywrightConfig } = await loadPlaywrightConfig()

    const config = createPlaywrightConfig({
      backendCommand: 'node backend/entrypoints/api/serve.mts',
      junitOutputFile: 'test-report.junit.xml',
      projects: [{ name: 'chromium', use: CHROMIUM_USE }],
      reuseExistingServer: false,
      testDir: './playwright/tests',
      timeout: 60_000,
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

    const { CHROMIUM_USE, createPlaywrightConfig } = await loadPlaywrightConfig()
    const config = createPlaywrightConfig({
      backendCommand: 'node backend/entrypoints/api/serve.mts',
      junitOutputFile: 'test-report.junit.xml',
      projects: [{ name: 'chromium', use: CHROMIUM_USE }],
      reuseExistingServer: false,
      testDir: './playwright/tests',
      timeout: 60_000,
    })
    const webServers = Array.isArray(config.webServer) ? config.webServer : []
    const workerServer = webServers.find(server => server.name === 'cloudflare-worker')

    expect(workerServer?.env).toMatchObject({ CSP_ASSET_ORIGIN: 'http://localhost:3000' })
  })
})

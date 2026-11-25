import '../../backend/test-helpers/s3-test-environment.mts'
import { devices, type PlaywrightTestConfig } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  DEFAULT_PLAYWRIGHT_USER_AGENT,
  assetHostResolverRule,
  createPlaywrightConfig,
  loggedShellCommand,
  nodeServerCommand,
  originOrFallback,
  playwrightWebServerLogDir,
  withNodeOption,
  withOptionalLaunchOptionArg,
  withOtelNodeOptions,
} from 'vouchington-tooling/playwright-config'
import {
  apiTestServerGuardReporter,
  imageLambdaEnv,
  otelRegisterPreload,
} from './web-server-command.mts'
import { vouchaTimeoutGuard } from './test-timeout.mts'
import { playwrightWebPublicEnv } from './web-public-env.mts'

const __dirname = fileURLToPath(new URL('../..', import.meta.url))

const WEB_PORT = process.env.NEXT_PORT || process.env.WEB_PORT || '3000'
const BACKEND_PORT = process.env.PORT || '2900'
const WORKER_PORT = process.env.WORKER_PORT || '8787'
const IMAGE_LAMBDA_PORT = process.env.IMAGE_LAMBDA_PORT || '3100'
const HAS_LOCAL_CERTS =
  process.env.WRANGLER_LOCAL_PROTOCOL !== 'http' &&
  process.env.WRANGLER_FORCE_HTTP !== '1' &&
  existsSync(join(__dirname, 'dev', 'certs', 'localhost.pem')) &&
  existsSync(join(__dirname, 'dev', 'certs', 'localhost-key.pem'))
const WORKER_PROTOCOL = HAS_LOCAL_CERTS ? 'https' : 'http'
const WEB_URL = `http://localhost:${WEB_PORT}`
const BACKEND_URL = `http://localhost:${BACKEND_PORT}`
const WORKER_URL = `${WORKER_PROTOCOL}://localhost:${WORKER_PORT}`
const IMAGE_LAMBDA_URL = `http://localhost:${IMAGE_LAMBDA_PORT}`
const ASSET_ORIGIN = originOrFallback(process.env.NEXT_PUBLIC_ASSET_PREFIX || WEB_URL, WEB_URL)
const TEMP_ROOT = process.env.RUNNER_TEMP || process.env.TMPDIR || '/tmp'
const webServerLogDir = playwrightWebServerLogDir(process.env)
export const CI = !!process.env.CI
const assetResolverRule = assetHostResolverRule(process.env.NEXT_PUBLIC_ASSET_PREFIX, WEB_PORT)
export const CHROMIUM_USE = withOptionalLaunchOptionArg(
  devices['Desktop Chrome'],
  DEFAULT_PLAYWRIGHT_USER_AGENT,
  assetResolverRule,
)
const nodeOptions = withNodeOption(process.env.NODE_OPTIONS, '--disable-warning=DEP0205')
const otelEnabled = process.env.OTEL_ENABLED === '1'
const otelPreload = otelEnabled ? otelRegisterPreload : undefined
const otelGracefulShutdown = otelEnabled
  ? { signal: 'SIGTERM' as const, timeout: 10_000 }
  : undefined

interface CreateVouchaPlaywrightConfigOptions {
  testDir: string
  timeout: number
  junitOutputFile: string
  projects: PlaywrightTestConfig['projects']
  backendCommand: string
  reuseExistingServer: boolean
  globalSetup?: string
}

export function createVouchaPlaywrightConfig({
  testDir,
  timeout,
  junitOutputFile,
  projects,
  backendCommand,
  reuseExistingServer,
  globalSetup = './playwright/global-setup.mts',
}: CreateVouchaPlaywrightConfigOptions): PlaywrightTestConfig {
  const workerLogDir = CI ? join(TEMP_ROOT, 'wrangler-logs', randomUUID()) : undefined
  return createPlaywrightConfig({
    testDir,
    timeout,
    timeoutGuard: vouchaTimeoutGuard,
    junitOutputFile,
    ci: CI,
    env: process.env,
    extraReporters: [[apiTestServerGuardReporter]],
    globalSetup,
    baseURL: WORKER_URL,
    use: {
      storageState: {
        cookies: [],
        origins: [
          { origin: WORKER_URL, localStorage: [{ name: 'cookie-consent', value: 'essential' }] },
        ],
      },
    },
    projects,
    webServer: [
      {
        command: nodeServerCommand({
          name: 'backend',
          serviceName: 'voucha-api-e2e',
          command: backendCommand,
          logDir: webServerLogDir,
          otelPreload,
        }),
        name: 'backend',
        url: `${BACKEND_URL}/infra/ping`,
        reuseExistingServer,
        timeout: 90 * 1000,
        stdout: 'pipe',
        stderr: 'pipe',
        env: { ...process.env, PORT: BACKEND_PORT },
        gracefulShutdown: otelGracefulShutdown,
      },
      {
        command: nodeServerCommand({
          name: 'lambdas',
          serviceName: 'voucha-lambdas-e2e',
          command: `IMAGE_LAMBDA_PORT=${IMAGE_LAMBDA_PORT} node lambdas/dev-server.mts`,
          logDir: webServerLogDir,
          otelPreload,
        }),
        name: 'lambdas',
        url: `${IMAGE_LAMBDA_URL}/health`,
        reuseExistingServer,
        timeout: 30 * 1000,
        stdout: 'pipe',
        stderr: 'pipe',
        env: imageLambdaEnv(process.env, IMAGE_LAMBDA_PORT),
        gracefulShutdown: otelGracefulShutdown,
      },
      {
        command: loggedShellCommand({
          name: 'web',
          command: 'node server.js',
          logDir: webServerLogDir,
        }),
        name: 'web',
        cwd: join(__dirname, 'web', '.next', 'standalone', 'web'),
        url: WEB_URL,
        reuseExistingServer,
        timeout: 30_000,
        stdout: 'pipe',
        stderr: 'pipe',
        env: {
          ...process.env,
          PORT: WEB_PORT,
          HOSTNAME: '0.0.0.0',
          API_BASE_URL: BACKEND_URL,
          ...playwrightWebPublicEnv(),
          ALLOW_TURNSTILE_TEST_KEY: process.env.ALLOW_TURNSTILE_TEST_KEY ?? 'true',
          IMAGE_ORIGIN: process.env.IMAGE_ORIGIN ?? IMAGE_LAMBDA_URL,
          GTM_ID: process.env.GTM_ID || process.env.NEXT_PUBLIC_GTM_ID || 'GTM-PLAYWRIGHT',
          NODE_OPTIONS: withOtelNodeOptions(nodeOptions, otelPreload),
          ...(otelEnabled ? { OTEL_LOGS_EXPORTER: 'otlp', OTEL_SERVICE_NAME: 'voucha-web' } : {}),
        },
        gracefulShutdown: otelGracefulShutdown,
      },
      {
        command: 'node cloudflare-worker/scripts/wrangler/start.mts',
        name: 'cloudflare-worker',
        // Worker-routed web page: a mis-routed worker's JSON 404 on /login fails boot (#5701).
        url: `${WORKER_URL}/login`,
        reuseExistingServer,
        timeout: CI ? 45_000 : 60_000,
        stdout: 'pipe',
        stderr: 'pipe',
        env: {
          ...process.env,
          CSP_ASSET_ORIGIN: process.env.CSP_ASSET_ORIGIN ?? ASSET_ORIGIN,
          ...(CI
            ? {
                NODE_OPTIONS: withNodeOption(
                  nodeOptions,
                  '--max-old-space-size=4096',
                  '--max-old-space-size=',
                ),
                WORKER_LOG_DIR: workerLogDir,
              }
            : {}),
          WORKER_PORT,
        },
      },
    ],
  })
}

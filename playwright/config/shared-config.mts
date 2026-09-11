import { devices, type PlaywrightTestConfig } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { hasWranglerHttpsCerts } from '../../cloudflare-worker/scripts/wrangler/env.mts'
import {
  assetHostResolverRule,
  originOrFallback,
  parseMaxWorkers,
  withOptionalLaunchOptionArg,
  withNodeOption,
} from './config-helpers.mts'
import {
  createReporter,
  imageLambdaEnv,
  nodeServerCommand,
  shellQuote,
  withHeldPortRelease,
} from './web-server-command.mts'
const __dirname = fileURLToPath(new URL('../..', import.meta.url))

const WEB_PORT = process.env.NEXT_PORT || process.env.WEB_PORT || '3000'
const BACKEND_PORT = process.env.PORT || '2900'
const WORKER_PORT = process.env.WORKER_PORT || '8787'
const IMAGE_LAMBDA_PORT = process.env.IMAGE_LAMBDA_PORT || '3100'
const HAS_LOCAL_CERTS = hasWranglerHttpsCerts(
  join(__dirname, 'dev', 'certs', 'localhost.pem'),
  join(__dirname, 'dev', 'certs', 'localhost-key.pem'),
)
const WORKER_PROTOCOL = HAS_LOCAL_CERTS ? 'https' : 'http'
const WEB_URL = `http://localhost:${WEB_PORT}`
const BACKEND_URL = `http://localhost:${BACKEND_PORT}`
const WORKER_URL = `${WORKER_PROTOCOL}://localhost:${WORKER_PORT}`
const IMAGE_LAMBDA_URL = `http://localhost:${IMAGE_LAMBDA_PORT}`
const ASSET_ORIGIN = originOrFallback(process.env.NEXT_PUBLIC_ASSET_PREFIX || WEB_URL, WEB_URL)
const TEMP_ROOT = process.env.RUNNER_TEMP || process.env.TMPDIR || '/tmp'
export const PLAYWRIGHT_WEB_SERVER_LOG_DIR = join(TEMP_ROOT, 'playwright-web-server-logs')
const PLAYWRIGHT_HUMAN_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36'
const TEST_WEB_PUSH_PUBLIC_KEY =
  'BHl0gZb-cpN8lY6FjEpmYTFQc-5hFCnM3vYIVOXsHOXOtfsmYmSlEdAOO4eXw3pZTbNuubGHTODWpl_vP7C_OeY'
export const CI = !!process.env.CI
const assetResolverRule = assetHostResolverRule(process.env.NEXT_PUBLIC_ASSET_PREFIX, WEB_PORT)
export const CHROMIUM_USE = withOptionalLaunchOptionArg(
  devices['Desktop Chrome'],
  PLAYWRIGHT_HUMAN_USER_AGENT,
  assetResolverRule,
)
const nodeOptions = withNodeOption(process.env.NODE_OPTIONS, '--disable-warning=DEP0205')
const otelEnabled = process.env.OTEL_ENABLED === '1'
const otelGracefulShutdown = otelEnabled
  ? { signal: 'SIGTERM' as const, timeout: 10_000 }
  : undefined
const defaultWorkers = CI ? 2 : '30%'
const workers = parseMaxWorkers(process.env.PLAYWRIGHT_MAX_WORKERS, defaultWorkers)
interface CreatePlaywrightConfigOptions {
  testDir: string
  timeout: number
  junitOutputFile: string
  projects: PlaywrightTestConfig['projects']
  backendCommand: string
  reuseExistingServer: boolean
  globalSetup?: string
}
export function createPlaywrightConfig({
  testDir,
  timeout,
  junitOutputFile,
  projects,
  backendCommand,
  reuseExistingServer,
  globalSetup = './playwright/global-setup.mts',
}: CreatePlaywrightConfigOptions): PlaywrightTestConfig {
  const workerLogDir = CI ? join(TEMP_ROOT, 'wrangler-logs', randomUUID()) : undefined
  return {
    testDir,
    fullyParallel: true,
    workers,
    forbidOnly: CI,
    retries: CI ? 1 : 0,
    reporter: createReporter(junitOutputFile, CI),
    globalSetup,
    maxFailures: CI ? 3 : undefined,
    timeout,
    expect: { timeout: 10_000 },
    use: {
      baseURL: WORKER_URL,
      testIdAttribute: 'data-pw',
      ignoreHTTPSErrors: true,
      actionTimeout: 10_000,
      navigationTimeout: 15_000,
      trace: 'on-first-retry',
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
        command: withHeldPortRelease(
          BACKEND_PORT,
          nodeServerCommand({
            name: 'backend',
            serviceName: 'voucha-api-e2e',
            command: backendCommand,
            logDir: PLAYWRIGHT_WEB_SERVER_LOG_DIR,
            otelEnabled,
            otelPreload: './backend/modules/on-error/sentry-preload.mts',
          }),
        ),
        name: 'backend',
        url: `${BACKEND_URL}/infra/ping`,
        reuseExistingServer,
        timeout: 60 * 1000,
        stdout: 'pipe',
        stderr: 'pipe',
        env: { ...process.env, PORT: BACKEND_PORT },
        gracefulShutdown: otelGracefulShutdown,
      },
      {
        command: withHeldPortRelease(
          IMAGE_LAMBDA_PORT,
          nodeServerCommand({
            name: 'lambdas',
            serviceName: 'voucha-lambdas-e2e',
            command: `IMAGE_LAMBDA_PORT=${IMAGE_LAMBDA_PORT} node lambdas/dev-server.mts`,
            logDir: PLAYWRIGHT_WEB_SERVER_LOG_DIR,
            otelEnabled,
            otelPreload: './lambdas/shared/sentry-preload.mts',
          }),
        ),
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
        command: withHeldPortRelease(
          WEB_PORT,
          `bash -lc ${shellQuote(`set -o pipefail; mkdir -p ${shellQuote(PLAYWRIGHT_WEB_SERVER_LOG_DIR)}; node server.js 2>&1 | tee ${shellQuote(join(PLAYWRIGHT_WEB_SERVER_LOG_DIR, 'web.log'))}`)}`,
        ),
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
          ALLOW_TURNSTILE_TEST_KEY: process.env.ALLOW_TURNSTILE_TEST_KEY ?? 'true',
          IMAGE_ORIGIN: process.env.IMAGE_ORIGIN ?? IMAGE_LAMBDA_URL,
          NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY:
            process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY ?? TEST_WEB_PUSH_PUBLIC_KEY,
          NODE_OPTIONS: nodeOptions,
          ...(otelEnabled ? { OTEL_LOGS_EXPORTER: 'otlp', OTEL_SERVICE_NAME: 'voucha-web' } : {}),
        },
        gracefulShutdown: otelGracefulShutdown,
      },
      {
        command: withHeldPortRelease(
          WORKER_PORT,
          'node cloudflare-worker/scripts/wrangler/start.mts',
        ),
        name: 'cloudflare-worker',
        url: WORKER_URL,
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
  }
}

import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  setup as setupDataStores,
  teardown as teardownDataStores,
} from '../../../test-helpers/vitest.setup.data-stores.mts'
import { seedPlaywrightTestData } from '../../../backend/test-helpers/playwright-seed-data.mts'
import { invalidate } from '../../../backend/services/entity-cache/index.mts'
import { prepareLocalizationCatalog } from './localization-catalog.mts'
import {
  BUILD_ARTIFACTS_HINT,
  getRequiredWebBuildArtifacts,
  PLAYWRIGHT_TOPIC_IDS,
} from './constants.mts'
import {
  allocateReservedPorts,
  cleanupManagedServices,
  createTraceProxy,
  ensureRequiredPathsExist,
  startReservedProcess,
  waitForService,
  type ManagedProcess,
  type ReservedPort,
  type TraceProxyHandle,
} from 'vouchington-tooling/integration-test-helpers'

const ROOT_DIR = process.cwd()
const WEB_DIR = resolve(ROOT_DIR, 'web')
const WORKER_DIR = resolve(ROOT_DIR, 'cloudflare-worker')
const WORKER_DEV_VARS_PATH = resolve(WORKER_DIR, '.dev.vars')

export default async function globalSetup(): Promise<() => Promise<void>> {
  const artifactsDir = resolve(ROOT_DIR, 'integration-tests', 'web', 'artifacts')
  const serviceLogsDir = resolve(artifactsDir, 'service-logs')
  mkdirSync(artifactsDir, { recursive: true })
  const existingWorkerDevVars = existsSync(WORKER_DEV_VARS_PATH)
    ? readFileSync(WORKER_DEV_VARS_PATH, 'utf8')
    : null
  const processes: ManagedProcess[] = []
  const reservedPorts: ReservedPort[] = []
  let traceProxy: TraceProxyHandle = { origin: '', close: async () => {} }
  const workerSecret = randomBytes(32).toString('hex')
  const cachePlaceholderNonce = randomBytes(32).toString('hex')
  const testUserEmail = `tests-${randomBytes(6).toString('hex')}@voucha.ai`

  const cleanup = async (): Promise<void> => {
    await cleanupManagedServices({
      processes,
      reservedPorts,
      closeables: [traceProxy],
      filesToRestore: [{ path: WORKER_DEV_VARS_PATH, existingContent: existingWorkerDevVars }],
    })
    await teardownDataStores()
  }

  try {
    ensureRequiredPathsExist(getRequiredWebBuildArtifacts(WEB_DIR, WORKER_DIR), {
      prefix: '[web-integration]',
      hint: BUILD_ARTIFACTS_HINT,
    })
    await prepareLocalizationCatalog()

    console.log('\n[web-integration] Preparing data stores...')
    process.env.WEB_INTEGRATION_TEST_USER_EMAIL = testUserEmail
    await setupDataStores()
    await seedPlaywrightTestData()
    await invalidate.topic_metrics(...PLAYWRIGHT_TOPIC_IDS)

    const allocatedPorts = await allocateReservedPorts(5)
    reservedPorts.push(...allocatedPorts)

    const [
      backendReservation,
      imageLambdaReservation,
      nextReservation,
      workerReservation,
      inspectorReservation,
    ] = allocatedPorts
    const backendOrigin = `http://127.0.0.1:${backendReservation.port}`
    const imageOrigin = `http://127.0.0.1:${imageLambdaReservation.port}`
    const webOrigin = `http://127.0.0.1:${nextReservation.port}`
    const workerOrigin = `http://127.0.0.1:${workerReservation.port}`

    traceProxy = await createTraceProxy(0, backendOrigin)
    const traceOrigin = traceProxy.origin

    process.env.WEB_INTEGRATION_BACKEND_ORIGIN = backendOrigin
    process.env.WEB_INTEGRATION_TRACE_ORIGIN = traceOrigin
    process.env.WEB_INTEGRATION_IMAGE_ORIGIN = imageOrigin
    process.env.WEB_INTEGRATION_WEB_ORIGIN = webOrigin
    process.env.WEB_INTEGRATION_WORKER_ORIGIN = workerOrigin
    process.env.WEB_INTEGRATION_ARTIFACTS_DIR = artifactsDir
    // Lets worker-routing.mts verify the placeholder never reaches a served body.
    process.env.WEB_INTEGRATION_CACHE_PLACEHOLDER_NONCE = cachePlaceholderNonce

    writeFileSync(
      WORKER_DEV_VARS_PATH,
      [
        `BACKEND_ORIGIN=${traceOrigin}`,
        `WEB_ORIGIN=${webOrigin}`,
        'CSP_BROWSER_UPLOAD_ORIGINS=["https://test-images.s3.us-west-2.amazonaws.com","https://test-images.s3.dualstack.us-west-2.amazonaws.com"]',
        `CF_WORKER_SECRET=${workerSecret}`,
        `CACHE_PLACEHOLDER_NONCE=${cachePlaceholderNonce}`,
      ].join('\n'),
    )

    const backendProcess = await startReservedProcess(backendReservation, processes, {
      name: 'backend',
      command: 'node',
      args: ['backend/entrypoints/api/serve.mts'],
      cwd: ROOT_DIR,
      env: {
        NODE_ENV: 'test',
        PORT: String(backendReservation.port),
        CF_WORKER_SECRET: workerSecret,
        IMAGE_ORIGIN: imageOrigin,
      },
      logFilePrefix: 'backend',
      logsDir: serviceLogsDir,
    })
    const imageLambdaProcess = await startReservedProcess(imageLambdaReservation, processes, {
      name: 'lambdas',
      command: 'node',
      args: ['lambdas/dev-server.mts'],
      cwd: ROOT_DIR,
      env: {
        NODE_ENV: 'test',
        IMAGE_LAMBDA_PORT: String(imageLambdaReservation.port),
        S3_BUCKET_IMAGES: 'test-images',
        S3_BUCKET_RENDERS: 'test-renders',
      },
      logFilePrefix: 'lambdas',
      logsDir: serviceLogsDir,
    })
    const nextProcess = await startReservedProcess(nextReservation, processes, {
      name: 'web',
      command: 'node',
      args: ['server.js'],
      cwd: resolve(WEB_DIR, '.next', 'standalone', 'web'),
      env: {
        NODE_ENV: 'test',
        VITEST: '',
        PORT: String(nextReservation.port),
        HOSTNAME: '127.0.0.1',
        API_BASE_URL: traceOrigin,
        NEXT_PUBLIC_API_BASE_URL: traceOrigin,
        CF_WORKER_SECRET: workerSecret,
        ALLOW_TURNSTILE_TEST_KEY: 'true',
        NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY:
          'BHl0gZb-cpN8lY6FjEpmYTFQc-5hFCnM3vYIVOXsHOXOtfsmYmSlEdAOO4eXw3pZTbNuubGHTODWpl_vP7C_OeY',
        // Next emits image URLs through the local Lambda; layout.tsx mirrors IMAGE_ORIGIN.
        IMAGE_ORIGIN: imageOrigin,
      },
      logFilePrefix: 'web',
      logsDir: serviceLogsDir,
    })
    // Spawn via start.mts (not the wrangler binary) to inherit its MAX_RESTARTS
    // auto-restart supervision, already used by Playwright and the worker smoke test
    // but previously never wired into this harness. See #2869.
    await inspectorReservation.release()
    const workerProcess = await startReservedProcess(workerReservation, processes, {
      name: 'cloudflare-worker',
      command: 'node',
      args: [resolve(WORKER_DIR, 'scripts', 'wrangler', 'start.mts')],
      cwd: ROOT_DIR,
      env: {
        NODE_ENV: 'test',
        WORKER_PORT: String(workerReservation.port),
        INSPECTOR_PORT: String(inspectorReservation.port),
        // workerOrigin above is always http://127.0.0.1; force HTTP regardless of
        // whether ./dev/initialize generated mkcert certs in dev/certs.
        WRANGLER_LOCAL_PROTOCOL: 'http',
        // Pin the filtered console copy to 'error'; WORKER_LOG_DIR below captures
        // start.mts's raw (unfiltered) stderr, which still has the crash line.
        WRANGLER_LOG_LEVEL: 'error',
        WORKER_LOG_DIR: resolve(artifactsDir, 'wrangler-logs'),
      },
      logFilePrefix: 'worker',
      logsDir: serviceLogsDir,
    })

    await Promise.all([
      waitForService('backend', `${backendOrigin}/infra/ping`, [200], backendProcess),
      waitForService('trace-proxy', `${traceOrigin}/__trace/health`),
      waitForService('lambdas', `${imageOrigin}/health`, [200], imageLambdaProcess),
      waitForService('web', `${webOrigin}/login`, [200], nextProcess),
      waitForService('worker', `${workerOrigin}/infra/ping`, [200], workerProcess),
    ])
    console.log('[web-integration] Services are ready.\n')

    return cleanup
  } catch (err) {
    await cleanup()
    throw err
  }
}

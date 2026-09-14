import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  setup as setupDataStores,
  teardown as teardownDataStores,
} from '../../../test-helpers/vitest.setup.data-stores.mts'
import { seedPlaywrightTestData } from '../../../backend/scripts/seeds/playwright-test-data.mts'
import { invalidate } from '../../../backend/services/entity-cache/index.mts'
import { compileCatalogForProcess } from '../../../backend/services/localization/compile-catalog.mts'
import { createTraceProxy, type TraceProxyHandle } from './backend-trace-proxy.mts'
import { ensureBuildArtifactsExist } from './build-state.mts'
import { allocateReservedPorts, type ReservedPort } from './ports.mts'
import { cleanupGlobalSetupState, startReservedProcess } from './global-setup-utils.mts'
import { waitForService, type ManagedProcess } from './processes.mts'

const ROOT_DIR = process.cwd()
const WEB_DIR = resolve(ROOT_DIR, 'web')
const WORKER_DIR = resolve(ROOT_DIR, 'cloudflare-worker')
const WORKER_DEV_VARS_PATH = resolve(WORKER_DIR, '.dev.vars')

const PLAYWRIGHT_TOPIC_IDS = [
  '019c64e6-f710-74cb-b36d-130af8ff1067',
  '019c64e6-f713-7bf3-8b1e-a869aa7c9cf1',
  '019c64e6-f716-722f-b05c-f4c4f7b93cd0',
  '019c64e6-b100-7000-b000-000000000001',
  '019c64e6-b200-7000-b000-000000000001',
  '019c64e6-b300-7000-b000-000000000001',
  '019c64e6-b400-7000-b000-000000000001',
] as const

export default async function globalSetup(): Promise<() => Promise<void>> {
  const artifactsDir = resolve(ROOT_DIR, 'integration-tests', 'web', 'artifacts')
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

  try {
    ensureBuildArtifactsExist()
    await compileCatalogForProcess()

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
    const backendPort = backendReservation.port
    const imageLambdaPort = imageLambdaReservation.port
    const nextPort = nextReservation.port
    const workerPort = workerReservation.port
    const inspectorPort = inspectorReservation.port
    const backendOrigin = `http://127.0.0.1:${backendPort}`
    const imageOrigin = `http://127.0.0.1:${imageLambdaPort}`
    const webOrigin = `http://127.0.0.1:${nextPort}`
    const workerOrigin = `http://127.0.0.1:${workerPort}`

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
        PORT: String(backendPort),
        CF_WORKER_SECRET: workerSecret,
        IMAGE_ORIGIN: imageOrigin,
      },
      logFilePrefix: 'backend',
    })
    const imageLambdaProcess = await startReservedProcess(imageLambdaReservation, processes, {
      name: 'lambdas',
      command: 'node',
      args: ['lambdas/dev-server.mts'],
      cwd: ROOT_DIR,
      env: {
        NODE_ENV: 'test',
        IMAGE_LAMBDA_PORT: String(imageLambdaPort),
        S3_BUCKET_IMAGES: 'test-images',
        S3_BUCKET_RENDERS: 'test-renders',
      },
      logFilePrefix: 'lambdas',
    })
    const nextProcess = await startReservedProcess(nextReservation, processes, {
      name: 'web',
      command: 'node',
      args: ['server.js'],
      cwd: resolve(WEB_DIR, '.next', 'standalone', 'web'),
      env: {
        NODE_ENV: 'test',
        VITEST: '',
        PORT: String(nextPort),
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
        WORKER_PORT: String(workerPort),
        INSPECTOR_PORT: String(inspectorPort),
        // workerOrigin above is always http://127.0.0.1; force HTTP regardless of
        // whether ./dev/initialize generated mkcert certs in dev/certs.
        WRANGLER_LOCAL_PROTOCOL: 'http',
        // Pin the filtered console copy to 'error'; WORKER_LOG_DIR below captures
        // start.mts's raw (unfiltered) stderr, which still has the crash line.
        WRANGLER_LOG_LEVEL: 'error',
        WORKER_LOG_DIR: resolve(artifactsDir, 'wrangler-logs'),
      },
      logFilePrefix: 'worker',
    })

    await Promise.all([
      waitForService('backend', `${backendOrigin}/infra/ping`, [200], backendProcess),
      waitForService('trace-proxy', `${traceOrigin}/__trace/health`),
      waitForService('lambdas', `${imageOrigin}/health`, [200], imageLambdaProcess),
      waitForService('web', `${webOrigin}/login`, [200], nextProcess),
      waitForService('worker', `${workerOrigin}/infra/ping`, [200], workerProcess),
    ])
    console.log('[web-integration] Services are ready.\n')

    return async () => {
      await cleanupGlobalSetupState({
        existingWorkerDevVars,
        processes,
        reservedPorts,
        traceProxy,
        workerDevVarsPath: WORKER_DEV_VARS_PATH,
      })
      await teardownDataStores()
    }
  } catch (error) {
    await cleanupGlobalSetupState({
      existingWorkerDevVars,
      processes,
      reservedPorts,
      traceProxy,
      workerDevVarsPath: WORKER_DEV_VARS_PATH,
    })
    await teardownDataStores()
    throw error
  }
}

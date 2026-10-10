import { writeSync } from 'node:fs'

import { configureTestPostgresSessions } from './vitest-postgres-session-settings.mts'
import {
  collectDbBackedTestSetupInput,
  evaluateDbBackedTestSetup,
} from '../dev/check-db-backed-test-setup.mts'

// Coverage-instrumented DB suites deliberately run many forks against one local Valkey. Keep the
// production fail-fast default out of that artificial contention envelope, while preserving an
// explicit caller override for timeout-focused tests and constrained CI runners. This assignment
// must stay above setup()'s dynamic imports so valkyries reads it before constructing any client.
process.env.VALKEY_REQUEST_TIMEOUT_MS ??= '5000'

const setupCheck = evaluateDbBackedTestSetup(collectDbBackedTestSetupInput())

if (!setupCheck.ok) {
  throw new Error(
    [
      'DB/Valkey-backed test setup is not ready.',
      ...setupCheck.errors.map(error => `- ${error}`),
    ].join('\n'),
  )
}

// Session startup options apply before any pool opens, including the global setup pools.
configureTestPostgresSessions()

// Required for API key HMAC checksum generation in tests
process.env.API_KEY_CHECKSUM_SECRET ??= 'this is a fake test API key checksum secret'
process.env.VOUCHA_OTP_TOKEN_HASH_SECRET ??= 'this is a fake test OTP HMAC secret'
process.env.VOUCHA_STORED_SECRET_ENCRYPTION_KEYS ??=
  'fake-test-key:raw32:this fake test key is not secret'

const emitSetupTiming = process.env.VITEST_CI_REPORTERS === 'run'

async function timedSetupPhase<T>(phase: string, run: () => Promise<T>): Promise<T> {
  if (!emitSetupTiming) return run()
  writeSync(2, `[vitest-setup] phase=${phase} start\n`)
  const start = performance.now()
  try {
    const result = await run()
    writeSync(2, `[vitest-setup] phase=${phase} done ms=${Math.round(performance.now() - start)}\n`)
    return result
  } catch (err) {
    writeSync(
      2,
      `[vitest-setup] phase=${phase} failed ms=${Math.round(performance.now() - start)}\n`,
    )
    throw err
  }
}

async function settleSetupOperations<const T extends readonly unknown[]>(operations: {
  [K in keyof T]: PromiseLike<T[K]>
}): Promise<T> {
  const outcomes = await Promise.allSettled(operations)
  const reasons: unknown[] = []
  const values: unknown[] = []
  for (const outcome of outcomes) {
    if (outcome.status === 'fulfilled') values.push(outcome.value)
    else if (!reasons.some(reason => Object.is(reason, outcome.reason)))
      reasons.push(outcome.reason)
  }
  if (reasons.length === 1) throw reasons[0]
  if (reasons.length > 1) throw new AggregateError(reasons, 'Backend setup operations failed')
  return values as unknown as T
}

export async function setup() {
  const [
    { Logger },
    { default: seed },
    { warmUpEmbeddingBloomFilter },
    { warmUpUrlBlocklistBloomFilter, warmUpEmailBlocklistBloomFilter },
    { dynamicConfigRegistry },
    { persistDynamicConfigTestBaseline },
  ] = await timedSetupPhase('imports', () =>
    settleSetupOperations([
      import('@valkey/valkey-glide'),
      import('@voucha/scripts/seed'),
      import('@services/bedrock-embeddings'),
      import('@services/urls-domains-blacklist'),
      import('@services/dynamic-config-admin/registry'),
      import('../backend/test-helpers/dynamic-config.mts'),
    ]),
  )

  // Suppress WARN-level messages from Glide's Rust logger (e.g. "item exists" from BF.RESERVE)
  Logger.setLoggerConfig('error')

  await timedSetupPhase('seed', seed)
  await timedSetupPhase('dynamic-config', () =>
    settleSetupOperations(
      dynamicConfigRegistry.map(({ config }) =>
        timedSetupPhase(`dynamic-config:${config.key}`, async () => {
          await config.waitForInitialization()
          await persistDynamicConfigTestBaseline(config)
        }),
      ),
    ),
  )
  await timedSetupPhase('bloom-warmup', () =>
    settleSetupOperations([
      timedSetupPhase('bloom-embeddings', warmUpEmbeddingBloomFilter),
      timedSetupPhase('bloom-url-blocklist', warmUpUrlBlocklistBloomFilter),
      timedSetupPhase('bloom-email-blocklist', warmUpEmailBlocklistBloomFilter),
    ]),
  )
}

// Mirrors the condition that wires the CI reporters (test-helpers/vitest-ci-reporters.mts) —
// same signal that turns on the teardown-overrun reporter also turns on this timing, so the
// two stay silent or visible together. Keeps plain local `vitest run` output quiet.
const emitTeardownTiming = process.env.VITEST_CI_REPORTERS === 'run'

// Diagnoses the #8259 teardownTimeout race: on a force-kill, the last "start" line with no
// matching "done" line names which teardown phase was still in flight. Each phase gets its
// own try/finally (not one trailing finally for the whole function) so a "done" line flushes
// as soon as that phase resolves, rather than only after every phase completes.
async function timedTeardownPhase(phase: string, run: () => Promise<void>): Promise<void> {
  if (!emitTeardownTiming) {
    await run()
    return
  }
  process.stderr.write(`[vitest-teardown] phase=${phase} start\n`)
  const start = performance.now()
  try {
    await run()
  } finally {
    const ms = Math.round(performance.now() - start)
    process.stderr.write(`[vitest-teardown] phase=${phase} done ms=${ms}\n`)
  }
}

export async function teardown() {
  const overallStart = emitTeardownTiming ? performance.now() : 0

  await timedTeardownPhase('native-drain', async () => {
    /**
     * Drain any in-flight native addon work before closing data stores.
     */
    const { beginNativeAddonShutdown, waitForNativeAddonWorkToDrain } =
      await import('@jongleberry/vurst-runtime')
    beginNativeAddonShutdown()
    await waitForNativeAddonWorkToDrain()
  })

  await timedTeardownPhase('data-stores', async () => {
    /**
     * Gracefully shutdown all data stores. This is also the socket-leak tripwire: setup()
     * opens Valkey/PSQL/glide-mq in this main process, and this is the only graceful close
     * of them — a leaked handle prevents a clean exit and force-kills at teardownTimeout.
     */
    const { gracefulShutdown } = await import('@data-stores/graceful-shutdown')
    await gracefulShutdown()
  })

  if (emitTeardownTiming) {
    const ms = Math.round(performance.now() - overallStart)
    process.stderr.write(`[vitest-teardown] total ms=${ms}\n`)
  }
}

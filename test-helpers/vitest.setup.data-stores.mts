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

// Required for API key HMAC checksum generation in tests
process.env.API_KEY_CHECKSUM_SECRET ??= 'this is a fake test API key checksum secret'
process.env.VOUCHA_OTP_TOKEN_HASH_SECRET ??= 'this is a fake test OTP HMAC secret'
process.env.VOUCHA_STORED_SECRET_ENCRYPTION_KEYS ??=
  'fake-test-key:raw32:this fake test key is not secret'

export async function setup() {
  const { Logger } = await import('@valkey/valkey-glide')
  const { raiseHnswEfSearchForTestDatabase } =
    await import('../backend/test-helpers/vector-search-recall.mts')
  const { boundStatementTimeoutForTestDatabase } =
    await import('../backend/test-helpers/statement-timeout.mts')
  const { default: seed } = await import('@voucha/scripts/seed')
  const { warmUpEmbeddingBloomFilter } = await import('@services/bedrock-embeddings')
  const { warmUpUrlBlocklistBloomFilter, warmUpEmailBlocklistBloomFilter } =
    await import('@services/urls-domains-blacklist')
  const { dynamicConfigRegistry } = await import('@services/dynamic-config-admin')
  const { persistDynamicConfigTestBaseline } =
    await import('../backend/test-helpers/dynamic-config.mts')

  // Suppress WARN-level messages from Glide's Rust logger (e.g. "item exists" from BF.RESERVE)
  Logger.setLoggerConfig('error')

  // Must complete before test workers fork: the setting applies to new sessions only.
  await raiseHnswEfSearchForTestDatabase()
  await boundStatementTimeoutForTestDatabase()
  await seed()
  await Promise.all(
    dynamicConfigRegistry.map(async ({ config }) => {
      await config.waitForInitialization()
      await persistDynamicConfigTestBaseline(config)
    }),
  )
  await Promise.all([
    warmUpEmbeddingBloomFilter(),
    warmUpUrlBlocklistBloomFilter(),
    warmUpEmailBlocklistBloomFilter(),
  ])
}

// Mirrors the condition that wires the CI reporters (test-helpers/vitest-ci-reporters.mts) —
// same signal that turns on the worker-exit diagnostics reporter also turns on this timing,
// so the two stay silent or visible together. Keeps plain local `vitest run` output quiet.
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

  await timedTeardownPhase('queues', async () => {
    /**
     * Clean all queues to avoid unnecessary calls to external services like OpenAI.
     */
    const { default: queues } = await import('@voucha/api/queues')
    await Promise.all(
      queues.map((queue: { obliterate(opts: { force: boolean }): Promise<void> }) =>
        queue.obliterate({ force: true }),
      ),
    )
  })

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

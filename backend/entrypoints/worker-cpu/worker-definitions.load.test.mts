import { describe, expect, it } from 'vitest'
import { WORKER_DEFINITIONS } from './worker-definitions.mts'

// The test setup keeps these live for the side effects other files expect, so this file must not
// close them.
const KEPT_LIVE_BY_TEST_SETUP = new Set([
  'bloom-filters',
  'topic-ratings',
  'elections',
  'entity-listeners',
  'entity-metrics-cache-refresh',
])

// These set a queue-wide limit before creating the worker. The in-memory test queue has no
// `setGlobalConcurrency`, so their real-GlideMQ tests cover them instead.
const NEEDS_QUEUE_WIDE_LIMIT = new Set([
  'bedrock-embeddings-batch-creation',
  'bluesky-follow-propagation',
])

const definitions = WORKER_DEFINITIONS.filter(
  ({ queueName }) =>
    !KEPT_LIVE_BY_TEST_SETUP.has(queueName) && !NEEDS_QUEUE_WIDE_LIMIT.has(queueName),
)

describe('worker definitions load their workers', () => {
  it.each(definitions.map(definition => [definition.queueName, definition] as const))(
    '%s resolves a worker that closes cleanly',
    async (_queueName, definition) => {
      const worker = await definition.load()

      await expect(worker.close()).resolves.toBeUndefined()
    },
  )
})

import { beforeAll, describe, expect, it, type Mock, vi } from 'vitest'
import { WORKER_DEFINITIONS } from './worker-definitions.mts'

type WorkerConstructor = typeof import('glide-mq').Worker

const workerMock = vi.hoisted(
  () => vi.fn<WorkerConstructor>() as Mock<WorkerConstructor> & WorkerConstructor,
)

// The constructor is mocked so loading a definition starts no consumer: a live worker would drain
// jobs that earlier files left in the in-memory queues of this fork.
vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => ({
  ...(await importOriginal()),
  Worker: workerMock,
}))

// These set a queue-wide limit before creating the worker. The in-memory test queue has no
// `setGlobalConcurrency`, so their real-GlideMQ tests cover them instead.
const NEEDS_QUEUE_WIDE_LIMIT = new Set([
  'bedrock-embeddings-batch-creation',
  'bluesky-follow-propagation',
])

const definitions = WORKER_DEFINITIONS.filter(
  ({ queueName }) => !NEEDS_QUEUE_WIDE_LIMIT.has(queueName),
)

describe('worker definitions build every worker through the factory', () => {
  beforeAll(() => {
    // The test setup preloads the data-store factory against the in-memory Worker, so drop it
    // and let each definition's lazy import rebuild the graph on the mock.
    vi.resetModules()
  })

  it.each(definitions.map(definition => [definition.queueName, definition] as const))(
    '%s gets the factory command client and stall budget',
    async (queueName, definition) => {
      await definition.load()

      const call = workerMock.mock.calls.find(([name]) => name === queueName)
      expect(call).toBeDefined()
      expect(call?.[2]).toMatchObject({
        commandClient: expect.anything(),
        maxStalledCount: expect.any(Number),
      })
    },
  )
})

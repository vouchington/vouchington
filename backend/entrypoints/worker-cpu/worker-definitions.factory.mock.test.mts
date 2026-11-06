import { beforeAll, describe, expect, it, type Mock, vi } from 'vitest'
import { WORKER_DEFINITIONS } from './worker-definitions.mts'

type WorkerConstructor = typeof import('glide-mq').Worker

const workerMock = vi.hoisted(() => {
  const worker = vi.fn<WorkerConstructor>() as Mock<WorkerConstructor> & WorkerConstructor
  // A worker built with a dedicated command client wraps its close() while it is constructed.
  worker.prototype.close = vi.fn<typeof import('glide-mq').Worker.prototype.close>()
  return worker
})

// The constructor is mocked so loading a definition starts no consumer: a live worker would drain
// jobs that earlier files left in the in-memory queues of this fork.
vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => ({
  ...(await importOriginal()),
  Worker: workerMock,
}))

const definitions = WORKER_DEFINITIONS

describe('worker definitions build every worker through the factory', () => {
  beforeAll(() => {
    // The test setup preloads the data-store factory against the in-memory Worker, so drop it
    // and let each definition's lazy import rebuild the graph on the mock.
    vi.resetModules()
  })

  it.each(definitions.map(definition => [definition.queueName, definition] as const))(
    '%s gets the factory command client and stall budget',
    async (queueName, definition) => {
      if (queueName === 'background') {
        // The IO definition test covers the full handler registry; this test only needs one
        // real domain to inspect the shared worker's factory options.
        const [{ createBackgroundWorker }, { cachePurgeHandlers }] = await Promise.all([
          import('../../workers/background/workers/create-worker.mts'),
          import('../../workers/cache-purge/workers.mts'),
        ])
        createBackgroundWorker({ handlers: cachePurgeHandlers, domains: ['cache-purge'] })
      } else {
        await definition.load()
      }

      const call = workerMock.mock.calls.find(([name]) => name === queueName)
      expect(call).toBeDefined()
      expect(call?.[2]).toMatchObject({
        commandClient: expect.anything(),
        maxStalledCount:
          queueName === 'background' || queueName === 'background-cpu' ? 1_000_000 : 2,
      })
    },
  )
})

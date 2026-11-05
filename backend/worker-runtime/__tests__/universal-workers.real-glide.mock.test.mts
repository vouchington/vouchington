import { randomUUID } from 'node:crypto'
import { Queue, Worker, type Job } from 'glide-mq'
import { afterAll, describe, expect, it, vi } from 'vitest'
import {
  workerQueueConnection,
  workerQueuePrefix,
} from '../../data-stores/valkey-core/glide-mq-client.mts'
import { closeAndUnregisterGlideMQInstance } from '../../data-stores/valkey-glide-mq/index.mts'
import { getGlideMQInstances } from '../../data-stores/valkey-core/glide-mq-registry.mts'
import { UNIVERSAL_WORKER_QUEUE_NAMES } from '@modules/worker-queue-inventory'
import { waitForRealGlideEvent } from '@voucha/test-helpers/real-glide-terminal-deadline'
import { loadUniversalWorkers } from '../universal-workers.mts'

vi.hoisted(() => {
  const url = new URL(process.env.VALKEY_URL || 'redis://localhost:6379')
  url.pathname = String(crypto.getRandomValues(new Uint32Array(1))[0] || 1)
  vi.stubEnv('VALKEY_WORKER_QUEUE_URL', url.toString())
  vi.stubEnv('QUEUES', 'not-heartbeat')
})
vi.mock<typeof import('glide-mq')>(import('glide-mq'), importOriginal => importOriginal())

describe('universal workers', () => {
  const queue = new Queue('heartbeat', {
    connection: workerQueueConnection,
    prefix: workerQueuePrefix,
  })
  let workers: Worker[] = []

  afterAll(async () => {
    try {
      await Promise.all(
        workers.map(async worker => {
          try {
            await worker.close(true)
          } finally {
            await closeAndUnregisterGlideMQInstance(worker)
          }
        }),
      )
    } finally {
      try {
        await queue.obliterate({ force: true })
      } finally {
        await queue.close()
      }
    }
  })

  it('loads the real heartbeat worker and processes a heartbeat despite the queue filter', async () => {
    expect(
      getGlideMQInstances().filter(
        instance => instance instanceof Worker && instance.name === 'heartbeat',
      ),
    ).toEqual([])
    workers = await loadUniversalWorkers()
    expect(
      getGlideMQInstances().filter(
        instance => instance instanceof Worker && instance.name === 'heartbeat',
      ),
    ).toEqual(workers)
    expect(workers.map(worker => worker.name)).toEqual(UNIVERSAL_WORKER_QUEUE_NAMES)
    expect(workers.map(worker => worker.name)).toEqual(['heartbeat'])
    const [worker] = workers
    expect(worker).toBeDefined()
    const { heartbeat } = await import('@workers/heartbeat/workers')
    expect(worker).toBe(heartbeat)
    await worker!.waitUntilReady()

    const jobId = randomUUID()
    const settled = Promise.withResolvers<unknown>()
    const onCompleted = (job: Job, result: unknown) => {
      if (job.id === jobId) settled.resolve(result)
    }
    const onFailed = (job: Job | undefined, error: Error) => {
      if (job?.id === jobId) settled.reject(error)
    }
    worker!.on('completed', onCompleted)
    worker!.on('failed', onFailed)
    try {
      const [, result] = await Promise.all([
        queue.add('heartbeat', { enqueuedAt: 42 }, { jobId, attempts: 1 }),
        waitForRealGlideEvent(settled.promise, `universal heartbeat ${jobId}`),
      ])
      expect(result).toEqual({ enqueuedAt: 42, processedAt: expect.any(Number) })
    } finally {
      worker!.off('completed', onCompleted)
      worker!.off('failed', onFailed)
    }
  })
})

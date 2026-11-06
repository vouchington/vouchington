import { randomUUID } from 'node:crypto'
import { QueueEvents, Worker } from 'glide-mq'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { closeAndUnregisterGlideMQInstance } from '../../data-stores/valkey-glide-mq/index.mts'
import { getGlideMQInstances } from '../../data-stores/valkey-core/glide-mq-registry.mts'
import {
  workerQueueConnection,
  workerQueuePrefix,
} from '../../data-stores/valkey-core/glide-mq-client.mts'
import { UNIVERSAL_WORKER_QUEUE_NAMES } from '@modules/worker-queue-inventory'
import { HEARTBEAT_JOB_NAME } from '@queues/heartbeat/config'
import { heartbeat as queue } from '@queues/heartbeat/queues'
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
  let workers: Worker[] = []
  const events = new QueueEvents('heartbeat', {
    connection: workerQueueConnection,
    prefix: workerQueuePrefix,
    lastEventId: '0-0',
  })

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
        await events.close()
      } finally {
        try {
          await queue.obliterate({ force: true })
        } finally {
          await closeAndUnregisterGlideMQInstance(queue)
        }
      }
    }
  })

  it('loads the real heartbeat worker and processes a heartbeat despite the queue filter', async () => {
    expect(
      getGlideMQInstances().filter(
        instance => instance instanceof Worker && instance.name === 'heartbeat',
      ),
    ).toEqual([])
    const jobId = randomUUID()
    const settled = Promise.withResolvers<'completed' | 'failed'>()
    const onCompleted = (event: { jobId: string }) => {
      if (event.jobId === jobId) settled.resolve('completed')
    }
    const onFailed = (event: { jobId: string }) => {
      if (event.jobId === jobId) settled.resolve('failed')
    }
    events.on('completed', onCompleted)
    events.on('failed', onFailed)
    try {
      await events.waitUntilReady()
      const enqueued = await queue.add(
        HEARTBEAT_JOB_NAME,
        { enqueuedAt: 42 },
        { jobId, attempts: 1 },
      )
      expect(enqueued?.id).toBe(jobId)
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
      await expect(waitForRealGlideEvent(settled.promise, 'universal heartbeat')).resolves.toBe(
        'completed',
      )
      const completed = await queue.getJob(jobId)
      expect(completed?.returnvalue).toEqual({ enqueuedAt: 42, processedAt: expect.any(Number) })
    } finally {
      events.off('completed', onCompleted)
      events.off('failed', onFailed)
    }
  })
})

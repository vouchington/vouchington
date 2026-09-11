import type { JobOptions, Queue } from 'glide-mq'
import { describe, expect, it, vi } from 'vitest'
import { createQueue, createWorker } from '../glide-mq-factory.mts'
import {
  createBulkEnqueueFunction,
  createEnqueueFunction,
  ENQUEUE_BASE_DEFAULTS,
} from '../glide-mq-enqueue.mts'
import {
  closeSharedCommandClientFromRegistry,
  getGlideMQInstances,
  setSharedCommandClientShutdown,
} from '@data-stores/valkey-core/glide-mq-registry'

type AddedJob<TData> = {
  name: string
  data: TData
  opts?: JobOptions
}

function createQueueStub<TData>() {
  const added: AddedJob<TData>[] = []

  return {
    added,
    queue: {
      add(name: string, data: TData, opts?: JobOptions) {
        added.push({ name, data, opts })
        return Promise.resolve({ id: `${name}-1` })
      },
      addBulk(jobs: AddedJob<TData>[]) {
        added.push(...jobs)
        return Promise.resolve(jobs.map((job, index) => ({ id: `${job.name}-${index}` })))
      },
    } as Pick<Queue<TData>, 'add' | 'addBulk'>,
  }
}

describe('glide-mq factory', () => {
  it('creates queues and workers with shared DLQ configuration', async () => {
    const queueName = `factory-dlq-${crypto.randomUUID()}`
    const deadLetterQueue = { name: `${queueName}-dlq` }
    const queue = createQueue(queueName, { deadLetterQueue })
    const worker = createWorker(
      queueName,
      () => {
        throw new Error('planned failure')
      },
      { deadLetterQueue, concurrency: 1 },
    )

    try {
      expect(getGlideMQInstances()).toContain(worker)

      const opts = { attempts: 1, expectDeadLetter: true } as Parameters<typeof queue.add>[2]
      await queue.add('alwaysFail', { id: 'job-1' }, opts)

      const deadLetterJobs = await queue.getDeadLetterJobs(0, 9)
      expect(deadLetterJobs).toHaveLength(1)
      expect(deadLetterJobs[0].name).toBe('alwaysFail')
      expect(deadLetterJobs[0].data).toMatchObject({
        originalQueue: queueName,
        data: { id: 'job-1' },
        failedReason: 'planned failure',
      })
    } finally {
      await worker.close()
      await queue.close()
    }
  })
})

describe('createEnqueueFunction', () => {
  it('merges base defaults, system defaults, and per-call options in order', async () => {
    const stub = createQueueStub<{ id: string }>()
    const enqueue = createEnqueueFunction({
      queue: stub.queue,
      queueName: 'queue',
      jobName: 'job',
      defaults: {
        attempts: 5,
        priority: 50,
        backoff: { type: 'exponential', delay: 2_000 },
      },
    })

    await enqueue({ id: '1' }, { priority: 7, delay: 100 })

    expect(stub.added[0]).toEqual({
      name: 'job',
      data: { id: '1' },
      opts: {
        ...ENQUEUE_BASE_DEFAULTS,
        attempts: 5,
        backoff: { type: 'exponential', delay: 2_000 },
        priority: 7,
        delay: 100,
      },
    })
  })
})

describe('createBulkEnqueueFunction', () => {
  it('merges per-job options before per-call options', async () => {
    const stub = createQueueStub<{ id: string }>()
    const enqueueBulk = createBulkEnqueueFunction<{ id: string }, { id: string }, 'job'>({
      queue: stub.queue,
      queueName: 'queue',
      jobName: 'job',
      defaults: { priority: 50 },
      buildJob: input => ({
        data: input,
        opts: {
          priority: 25,
          deduplication: { id: input.id, mode: 'throttle', ttl: 1_000 },
        },
      }),
    })

    await enqueueBulk([{ id: '1' }], { priority: 10 })

    expect(stub.added[0]?.opts).toEqual({
      ...ENQUEUE_BASE_DEFAULTS,
      priority: 10,
      deduplication: { id: '1', mode: 'throttle', ttl: 1_000 },
    })
  })

  it('does not enqueue empty batches', async () => {
    const stub = createQueueStub<{ id: string }>()
    const enqueueBulk = createBulkEnqueueFunction<{ id: string }, { id: string }, 'job'>({
      queue: stub.queue,
      queueName: 'queue',
      jobName: 'job',
      buildJob: input => ({ data: input }),
    })

    await enqueueBulk([])

    expect(stub.added).toEqual([])
  })
})

describe('glide-mq-registry shared command client shutdown', () => {
  it('invokes and clears the registered shutdown callback', async () => {
    const close = vi.fn<() => void>()
    setSharedCommandClientShutdown(close)
    await closeSharedCommandClientFromRegistry()
    expect(close).toHaveBeenCalledOnce()
    // second call is a no-op after clear
    await closeSharedCommandClientFromRegistry()
    expect(close).toHaveBeenCalledOnce()
  })

  it('is a no-op when no callback is registered', async () => {
    await expect(closeSharedCommandClientFromRegistry()).resolves.toBeUndefined()
  })
})

import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { Queue, Worker, UnrecoverableError, type Job } from 'glide-mq'
import { createBulkEnqueueFunction, workerQueueConnection, workerQueuePrefix } from './index.mts'
import { processPagedDispatcher, pagedDispatchBackoffStrategies } from './paged-dispatcher.mts'
import { pagedDispatchConfig } from './paged-dispatcher-config.mts'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'

describe('page admission fence ownership', () => {
  it('recovers fences after a real receipt serialization failure even when the source advances', async () => {
    const settings = {
      connection: workerQueueConnection,
      prefix: `${workerQueuePrefix}:fences:${randomUUID()}`,
    }
    const target = new Queue<{ id: number }>(`rows-${randomUUID()}`, settings)
    const dispatch = new Queue<Record<string, never>>(`pages-${randomUUID()}`, settings)
    const enqueue = createBulkEnqueueFunction<{ id: number }, { id: number }, 'row'>({
      queue: Object.assign(target, { priorityKind: 'none' as const }),
      queueName: 'background',
      jobName: 'row',
      buildJob: data => ({ data }),
    })
    const consumed: number[] = []
    const firstConsumed = Promise.withResolvers<void>()
    const rowsDone = Promise.withResolvers<void>()
    const done = Promise.withResolvers<void>()
    const restore = overrideDynamicConfigFieldsForTest(pagedDispatchConfig, { rss_page_size: 1 })
    const consumer = new Worker<{ id: number }>(
      target.name,
      async (job: Job<{ id: number }>) => {
        consumed.push(job.data.id)
      },
      settings,
    )
    consumer.on('completed', job => {
      if (job.data.id === 1) firstConsumed.resolve()
      if (job.data.id === 2) rowsDone.resolve()
    })
    let source = 0
    const worker = new Worker(
      dispatch.name,
      (job: Job<Record<string, never>>) =>
        processPagedDispatcher(job, {
          dispatcher: 'rss',
          cursorKey: 'id',
          target,
          targetName: 'background',
          targetPrefix: settings.prefix,
          continuationQueue: dispatch,
          readAndDispatch: async () => {
            const id = ++source
            await enqueue([{ id }])
            if (id === 1) await firstConsumed.promise
            // BigInt rejects the real JSON receipt write after source visibility advances.
            return { result: id === 1 ? 1n : id }
          },
          enqueueNext: async () => {
            throw new Error('Unexpected continuation')
          },
        }),
      { ...settings, promotionInterval: 1, backoffStrategies: pagedDispatchBackoffStrategies() },
    )
    worker.on('completed', () => done.resolve())
    worker.on('error', done.reject)
    try {
      const root = await dispatch.add('page', {}, { attempts: 3 })
      if (!root) throw new Error('Expected root admission')
      await Promise.all([done.promise, rowsDone.promise])
      expect(consumed).toEqual([1, 2])
      expect(source).toBe(2)
      const client = await target.getClient()
      expect(await client.hgetall(`${settings.prefix}:{${target.name}}:dedup`)).toEqual([])
      expect(
        await client.scard(`${settings.prefix}:{${target.name}}:dispatch-fences:${root.id}`),
      ).toBe(0)
      expect((await dispatch.getJob(root.id))?.attemptsMade).toBe(1)
    } finally {
      restore()
      await worker.close(true)
      await consumer.close(true)
      await Promise.all([target.obliterate({ force: true }), dispatch.obliterate({ force: true })])
      await Promise.all([target.close(), dispatch.close()])
    }
  })

  it('preserves a row job failure-retention policy for terminal recovery', async () => {
    const settings = {
      connection: workerQueueConnection,
      prefix: `${workerQueuePrefix}:retained:${randomUUID()}`,
    }
    const target = new Queue<{ id: string }>(`retained-${randomUUID()}`, settings)
    const dispatch = new Queue<Record<string, never>>(`dispatch-${randomUUID()}`, settings)
    const enqueue = createBulkEnqueueFunction<{ id: string }, { id: string }, 'row'>({
      queue: Object.assign(target, { priorityKind: 'none' as const }),
      queueName: 'background',
      jobName: 'row',
      defaults: { removeOnFail: 77 },
      buildJob: data => ({ data }),
    })
    const failed = Promise.withResolvers<string>()
    const consumer = new Worker(
      target.name,
      async () => {
        throw new UnrecoverableError('Inbox unavailable')
      },
      settings,
    )
    consumer.on('failed', job => {
      if (job) failed.resolve(job.id)
    })
    try {
      const root = await dispatch.add('page', {})
      if (!root) throw new Error('Expected dispatcher admission')
      await processPagedDispatcher(root, {
        dispatcher: 'activitypub',
        cursorKey: 'remoteActorId',
        target,
        targetName: 'background',
        targetPrefix: settings.prefix,
        readAndDispatch: async () => {
          await enqueue([{ id: 'recipient' }])
          return { result: 1 }
        },
        enqueueNext: async () => {
          throw new Error('Unexpected continuation')
        },
      })
      const job = await target.getJob(await failed.promise)
      expect(job?.opts.removeOnFail).toBe(77)
      expect(await job?.getState()).toBe('failed')
      expect(job?.data).toEqual({ id: 'recipient' })
    } finally {
      await consumer.close(true)
      await Promise.all([target.obliterate({ force: true }), dispatch.obliterate({ force: true })])
      await Promise.all([target.close(), dispatch.close()])
    }
  })
})

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

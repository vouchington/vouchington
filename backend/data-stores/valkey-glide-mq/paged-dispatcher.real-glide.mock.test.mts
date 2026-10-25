import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { Queue, Worker, type Job } from 'glide-mq'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-core/glide-mq-client'
import { createBulkEnqueueFunction } from './index.mts'
import {
  processPagedDispatcher,
  pagedDispatchBackoffStrategies,
  type DispatchCursorKey,
} from './paged-dispatcher.mts'
import { pagedDispatchConfig } from './paged-dispatcher-config.mts'
import { createPagedDispatchFences } from './paged-dispatch-fences.mts'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'

describe('paged dispatcher', () => {
  it('retires a durable receipt while the target remains above its depth limit', async () => {
    const settings = {
      connection: workerQueueConnection,
      prefix: `${workerQueuePrefix}:receipt-drain:${randomUUID()}`,
    }
    const target = new Queue(`rows-${randomUUID()}`, settings)
    const dispatch = new Queue(`pages-${randomUUID()}`, settings)
    const restore = overrideDynamicConfigFieldsForTest(pagedDispatchConfig, {
      background_max_depth: 1,
    })
    try {
      await target.add('held', {})
      await target.add('held', {})
      const job = await dispatch.add('page', { dispatchReceipt: { result: 7 } })
      if (!job) throw new Error('Expected dispatcher admission')
      const fences = createPagedDispatchFences(target.name, job.id, settings.prefix)
      await fences.checkpoint(['old-page-row'])
      const result = await processPagedDispatcher(job, {
        dispatcher: 'rss',
        cursorKey: 'id',
        target,
        targetName: 'background',
        targetPrefix: settings.prefix,
        readAndDispatch: async () => {
          throw new Error('A durable receipt must never reread its source')
        },
        enqueueNext: async () => {
          throw new Error('The final page has no continuation')
        },
      })
      expect(result).toBe(7)
      expect((await target.getJobCounts()).waiting).toBe(2)
      expect(
        await (
          await target.getClient()
        ).scard(`${settings.prefix}:{${target.name}}:dispatch-fences:${job.id}`),
      ).toBe(0)
    } finally {
      restore()
      await Promise.all([target.obliterate({ force: true }), dispatch.obliterate({ force: true })])
      await Promise.all([target.close(), dispatch.close()])
    }
  })

  it.each(['updated_at', 'created_at'])(
    'rejects a non-unique or mutable %s cursor before dispatch',
    async cursorKey => {
      const queue = new Queue<Record<string, never>>(`cursor-${randomUUID()}`, {
        connection: workerQueueConnection,
        prefix: `${workerQueuePrefix}:cursor:${randomUUID()}`,
      })
      try {
        const job = await queue.add('page', {})
        if (!job) throw new Error('Expected dispatcher admission')
        await expect(
          processPagedDispatcher(job, {
            dispatcher: 'rss',
            cursorKey: cursorKey as DispatchCursorKey,
            target: queue,
            targetName: 'background',
            readAndDispatch: async () => ({ result: 0 }),
            enqueueNext: (data, opts) => queue.add('page', data, opts),
          }),
        ).rejects.toThrow('unique immutable cursor')
      } finally {
        await queue.obliterate({ force: true })
        await queue.close()
      }
    },
  )

  it('waits for queue capacity and replays each row and continuation once', async () => {
    const connection = {
      connection: workerQueueConnection,
      prefix: `${workerQueuePrefix}:paged:${randomUUID()}`,
    }
    const targetName = `target-${randomUUID()}`
    const dispatchName = `dispatch-${randomUUID()}`
    const target = new Queue(targetName, connection)
    const enqueueRows = createBulkEnqueueFunction({
      queue: Object.assign(target, { priorityKind: 'none' as const }),
      queueName: 'background',
      jobName: 'row',
      buildJob: (data: { id: number }) => ({ data }),
    })
    const dispatch = new Queue<{ after?: number }>(dispatchName, connection)
    const blocked = Promise.withResolvers<void>()
    const admitted = Promise.withResolvers<void>()
    const allDone = Promise.withResolvers<void>()
    const secondDone = Promise.withResolvers<void>()
    let completedSweeps = 0
    const seen: number[] = []
    let rejected = false
    let completedRowsAtRetry: unknown
    const firstConsumed = Promise.withResolvers<void>()
    const restore = overrideDynamicConfigFieldsForTest(pagedDispatchConfig, {
      background_max_depth: 1,
      rss_page_size: 1,
      rss_backoff_ms: 1,
    })
    await target.add('held', { id: 'held-1' })
    await target.add('held', { id: 'held-2' })
    const worker = new Worker<{ after?: number }>(
      dispatchName,
      async (job: Job<{ after?: number }>) => {
        const count = await target.getJobCounts()
        if ((count.waiting ?? 0) > 1) blocked.resolve()
        return processPagedDispatcher(job, {
          dispatcher: 'rss',
          cursorKey: 'id',
          target,
          targetName: 'background',
          targetPrefix: connection.prefix,
          continuationQueue: dispatch,
          readAndDispatch: async size => {
            expect(size).toBe(1)
            const id = (job.data.after ?? 0) + 1
            await enqueueRows([{ id }])
            if (!rejected) {
              rejected = true
              await firstConsumed.promise
              completedRowsAtRetry = await target.searchJobs({ name: 'row', state: 'completed' })
              throw new Error('retry after the row was admitted')
            }
            seen.push(id)
            if (id === 3) admitted.resolve()
            return { result: id, ...(id < 3 ? { next: { after: id } } : {}) }
          },
          enqueueNext: (data, options) => dispatch.add('page', data, options),
        })
      },
      {
        ...connection,
        blockTimeout: 1000,
        promotionInterval: 1,
        backoffStrategies: pagedDispatchBackoffStrategies(),
      },
    )
    worker.on('error', allDone.reject)
    worker.on('completed', job => {
      if (job.returnvalue === 3) {
        completedSweeps++
        if (completedSweeps === 1) allDone.resolve()
        else secondDone.resolve()
      }
    })
    try {
      await worker.waitUntilReady()
      const root = await dispatch.add('page', {}, { attempts: 3 })
      await blocked.promise
      const rootState = await dispatch.getJob(root!.id)
      expect(rootState?.data).toEqual({})
      // Drain the queue only after the dispatcher observes a deep destination. Row records are
      // removed immediately; the page admission fence must survive that pruning.
      const consumed: number[] = []
      const consumedAll = Promise.withResolvers<void>()
      const consumedTwice = Promise.withResolvers<void>()
      const consumer = new Worker<{ id: number | string }>(
        targetName,
        async (job: Job<{ id: number | string }>) => {
          if (typeof job.data.id === 'number') consumed.push(job.data.id)
        },
        { ...connection, blockTimeout: 1000 },
      )
      consumer.on('completed', job => {
        if (job.data.id === 1) firstConsumed.resolve()
        if (job.data.id === 3 && consumed.length === 3) consumedAll.resolve()
        if (job.data.id === 3 && consumed.length === 6) consumedTwice.resolve()
      })
      try {
        await consumer.waitUntilReady()
        await admitted.promise
        await allDone.promise
        await consumedAll.promise
        expect(completedRowsAtRetry).toEqual([])
        expect(seen).toEqual([1, 2, 3])
        expect(consumed).toEqual([1, 2, 3])
        expect(
          await (await target.getClient()).hgetall(`${connection.prefix}:{${targetName}}:dedup`),
        ).toEqual([])
        expect(
          await (
            await dispatch.getClient()
          ).hgetall(`${connection.prefix}:{${dispatchName}}:dedup`),
        ).toEqual([])
        await dispatch.add('page', {}, { attempts: 3 })
        await secondDone.promise
        await consumedTwice.promise
        expect(consumed).toEqual([1, 2, 3, 1, 2, 3])
      } finally {
        await consumer.close()
      }
    } finally {
      restore()
      await worker.close(true)
      await Promise.all([target.obliterate({ force: true }), dispatch.obliterate({ force: true })])
      await Promise.all([target.close(), dispatch.close()])
    }
  })
})

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

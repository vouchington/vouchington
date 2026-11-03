import { randomUUID } from 'node:crypto'
import { Queue, Worker, type Job } from 'glide-mq'
import { describe, expect, it, vi } from 'vitest'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-core/glide-mq-client'
import { waitForRealGlideEvent } from '@voucha/test-helpers/real-glide-terminal-deadline'
import { createBulkEnqueueFunction } from '@data-stores/valkey-glide-mq'
import { withPagedDispatchPage } from './paged-dispatch-context.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

type Row = { rowId: string; step: string; receipt?: string }

describe('reactivating a finished paged row with its retained data', () => {
  it('replaces the new input with what reactivatedData returns for the completed record', async () => {
    const prefix = `${workerQueuePrefix ?? 'glide'}:reactivated-data:${randomUUID()}`
    const queue = new Queue<Row>(`reactivated-data-${randomUUID()}`, {
      connection: workerQueueConnection,
      prefix,
    })
    Object.assign(queue, { priorityKind: 'none' as const })
    const rowId = randomUUID()
    const bulk = createBulkEnqueueFunction({
      queue: queue as typeof queue & { priorityKind: 'none' },
      queueName: queue.name,
      queuePrefix: prefix,
      jobName: 'fetchRssFeed',
      defaults: { attempts: 1, removeOnComplete: 100 },
      buildJob: (input: Row) => ({ data: input, opts: { jobId: rowId } }),
      reactivatedData: (input, retainedData) => ({
        ...input,
        receipt: (retainedData as Row).receipt,
      }),
    })
    const completed = Promise.withResolvers<void>()
    const worker = new Worker(
      queue.name,
      async (job: Job<Row>) => {
        await job.updateData({ ...job.data, receipt: 'saved-receipt' })
      },
      { connection: workerQueueConnection, prefix, blockTimeout: 1000 },
    )
    worker.on('completed', () => completed.resolve())
    worker.on('error', completed.reject)
    const enqueuePage = (pageId: string, step: string) =>
      withPagedDispatchPage(
        pageId,
        queue.name,
        () => bulk([{ rowId, step }]),
        () => Promise.resolve(),
      )

    try {
      await worker.waitUntilReady()
      await enqueuePage('first', 'initial')
      await waitForRealGlideEvent(completed.promise, 'Completed paged row')
      await worker.close(true)
      expect(await (await queue.getJob(rowId))?.getState()).toBe('completed')

      const readmitted = await enqueuePage('second', 'recovery')
      expect(readmitted.value.map(job => job.id)).toEqual([rowId])
      const job = await queue.getJob(rowId)
      expect(await job?.getState()).not.toBe('completed')
      expect(job?.data).toEqual({ rowId, step: 'recovery', receipt: 'saved-receipt' })
    } finally {
      await worker.close(true)
      await queue.obliterate({ force: true })
      await queue.close()
    }
  })
})

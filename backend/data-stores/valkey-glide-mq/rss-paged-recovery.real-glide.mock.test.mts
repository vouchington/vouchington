import { randomUUID } from 'node:crypto'
import { Queue, Worker, type Job } from 'glide-mq'
import { describe, expect, it, vi } from 'vitest'
import {
  createBulkEnqueueFunction,
  workerQueueConnection,
  workerQueuePrefix,
} from '@data-stores/valkey-glide-mq'
import { createRetryingCommandClient } from './glide-mq-command-client.mts'
import { acquireTerminalJobRemoval } from './terminal-job-removal.mts'
import { withPagedDispatchPage } from './paged-dispatch-context.mts'

describe('real-queue recovery for paged RSS rows', () => {
  it('keeps a concurrently retried failed job when watched terminal removal conflicts', async () => {
    const prefix = `${workerQueuePrefix ?? 'glide'}:retry-race:${randomUUID()}`
    const queue = new Queue<{ id: string }>(`retry-race-${randomUUID()}`, {
      connection: workerQueueConnection,
      prefix,
    })
    const failed = Promise.withResolvers<void>()
    const retryEntered = Promise.withResolvers<void>()
    const releaseRetry = Promise.withResolvers<void>()
    let runs = 0
    const worker = new Worker(
      queue.name,
      async () => {
        if (++runs === 1) throw new Error('initial terminal failure')
        retryEntered.resolve()
        await releaseRetry.promise
      },
      { connection: workerQueueConnection, prefix, blockTimeout: 100, promotionInterval: 1000 },
    )
    worker.on('failed', () => failed.resolve())
    worker.on('error', failed.reject)
    const dedicated = createRetryingCommandClient('terminal-removal-race-test')
    const id = randomUUID()
    const namespace = `${prefix}:{${queue.name}}`

    try {
      await worker.waitUntilReady()
      await queue.add('fetchRssFeed', { id }, { jobId: id, attempts: 1, removeOnFail: 100 })
      await failed.promise
      const retained = await queue.getJob(id)
      expect(await retained?.getState()).toBe('failed')

      const claim = await acquireTerminalJobRemoval(dedicated.client, namespace, id)
      expect(claim.state).toBe('terminal')
      await retained?.retry()
      await retryEntered.promise
      if (claim.state !== 'terminal') throw new Error('Expected terminal removal claim')
      expect(await claim.remove()).toBe(false)
      expect(await (await queue.getJob(id))?.getState()).toBe('active')
      releaseRetry.resolve()
      expect(runs).toBe(2)
    } finally {
      releaseRetry.resolve()
      await dedicated.close()
      await worker.close(true)
      await queue.obliterate({ force: true })
      await queue.close()
    }
  })

  it.each([
    { label: 'RSS', jobName: 'fetchRssFeed' },
    { label: 'election', jobName: 'processUpdateElectionVoteStats' },
  ] as const)(
    're-admits a failed $label row on a fresh page while fencing replay and in-flight pages',
    async ({ label, jobName }) => {
      const prefix = `${workerQueuePrefix ?? 'glide'}:${label}-recovery:${randomUUID()}`
      const queue = new Queue<{ rowId: string; page: number }>(`${label}-${randomUUID()}`, {
        connection: workerQueueConnection,
        prefix,
      })
      Object.assign(queue, { priorityKind: 'none' as const })
      const bulk = createBulkEnqueueFunction({
        queue: queue as typeof queue & { priorityKind: 'none' },
        queueName: queue.name,
        queuePrefix: prefix,
        jobName,
        defaults: { attempts: 1, removeOnFail: 100 },
        buildJob: (input: { rowId: string; page: number }) => ({
          data: input,
          opts: { deduplication: { id: `row__${input.rowId}`, mode: 'simple' } },
        }),
      })
      const firstFailed = Promise.withResolvers<void>()
      const secondEntered = Promise.withResolvers<void>()
      const releaseSecond = Promise.withResolvers<void>()
      const worker = new Worker(
        queue.name,
        async (job: Job<{ rowId: string; page: number }>) => {
          if (job.data.page === 1) throw new Error('synthetic row failure')
          secondEntered.resolve()
          await releaseSecond.promise
        },
        { connection: workerQueueConnection, prefix, blockTimeout: 1000 },
      )
      worker.on('failed', job => {
        if (job?.data.page === 1) firstFailed.resolve()
      })
      worker.on('error', firstFailed.reject)
      const rowId = randomUUID()
      const enqueuePage = (pageId: string, page: number) =>
        withPagedDispatchPage(
          pageId,
          queue.name,
          () => bulk([{ rowId, page }]),
          ids =>
            ids.length
              ? queue
                  .getClient()
                  .then(client =>
                    client.sadd(`${prefix}:{${queue.name}}:dispatch-fences:${pageId}`, ids),
                  )
                  .then(() => undefined)
              : Promise.resolve(),
        )

      try {
        await worker.waitUntilReady()
        const first = await enqueuePage('first', 1)
        expect(first.value).toHaveLength(1)
        await firstFailed.promise
        expect(await (await queue.getJob(first.value[0]!.id))?.getState()).toBe('failed')

        // The old page owns a durable throttle fence even after terminal cleanup.
        expect((await enqueuePage('first', 1)).value).toEqual([])
        const fresh = await enqueuePage('second', 2)
        expect(fresh.value).toHaveLength(1)
        expect(fresh.value[0]?.data.page).toBe(2)
        await secondEntered.promise
        expect((await enqueuePage('third', 3)).value).toEqual([])
        releaseSecond.resolve()
      } finally {
        releaseSecond.resolve()
        await worker.close(true)
        await queue.obliterate({ force: true })
        await queue.close()
      }
    },
  )
})

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

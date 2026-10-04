import { randomUUID } from 'node:crypto'
import { Queue, Worker, type Job } from 'glide-mq'
import { describe, expect, it, vi } from 'vitest'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-glide-mq'
import { creationJobOptions, reconciliationJobOptions } from './enqueues.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), importOriginal => importOriginal())

const connection = { connection: workerQueueConnection, prefix: workerQueuePrefix }

describe('embedding reconciliation on real GlideMQ', () => {
  it('throttles only cursorless roots and coalesces a pending continuation page', async () => {
    const queue = new Queue(`embedding_reconciliation_dedup_${randomUUID()}`, connection)
    try {
      const rootOptions = reconciliationJobOptions('copy:topics')
      const root = await queue.add('reconcile_existing', { entityType: 'topics' }, rootOptions)
      expect(root).not.toBeNull()
      const duplicateRoot = await queue.add(
        'reconcile_existing',
        { entityType: 'topics' },
        rootOptions,
      )
      expect(duplicateRoot).toBeNull()

      const after = `opaque-${randomUUID()}`
      const pageOptions = reconciliationJobOptions('copy:topics', after)
      const page = await queue.add(
        'reconcile_existing',
        { entityType: 'topics', after },
        pageOptions,
      )
      expect(page).not.toBeNull()
      const duplicatePage = await queue.add(
        'reconcile_existing',
        { entityType: 'topics', after },
        pageOptions,
      )
      expect(duplicatePage).toBeNull()
      expect(page?.opts.ordering).toEqual(rootOptions.ordering)
      expect(page?.opts.deduplication).toEqual({
        id: `bedrock-embedding-reconciliation:copy:topics:${after}`,
        mode: 'simple',
      })
    } finally {
      await queue.obliterate({ force: true })
      await queue.close()
    }
  })

  it('retains a delayed identical creation cursor after the denied job completes', async () => {
    const queueName = `embedding_creation_retry_${randomUUID()}`
    const queue = new Queue(queueName, connection)
    const firstCompleted = Promise.withResolvers<void>()
    const recovered = Promise.withResolvers<void>()
    const cursor = {
      sweepStartedAt: new Date().toISOString(),
      afterId: randomUUID(),
      pendingImageIds: [randomUUID()],
    }
    let capacityAvailable = false
    let retry: Job | null = null
    const payloads: unknown[] = []
    const worker = new Worker(
      queueName,
      async (job: Job) => {
        payloads.push(job.data)
        if (!capacityAvailable) {
          retry = await queue.add(
            'images',
            job.data,
            creationJobOptions('images_batch', undefined, cursor, 30000),
          )
        } else recovered.resolve()
      },
      { ...connection, concurrency: 1, blockTimeout: 1000 },
    )
    worker.once('completed', () => firstCompleted.resolve())
    try {
      await worker.waitUntilReady()
      const first = await queue.add(
        'images',
        { cursor },
        creationJobOptions('images_batch', undefined, cursor),
      )
      await firstCompleted.promise
      const delayed = retry as Job | null
      if (!first || !delayed) throw new Error('Expected retained creation retry')
      expect(delayed.id).not.toBe(first.id)
      expect(await delayed.getState()).toBe('delayed')
      expect(delayed.data).toEqual({ cursor })
      expect(delayed.opts.deduplication).toBeUndefined()
      capacityAvailable = true
      await delayed.promote()
      await recovered.promise
      expect(payloads).toEqual([{ cursor }, { cursor }])
    } finally {
      await worker.close()
      await queue.obliterate({ force: true })
      await queue.close()
    }
  })

  it('serializes the reconciliation lane while a different lane can run', async () => {
    const queueName = `embedding_reconciliation_lane_${randomUUID()}`
    const queue = new Queue(queueName, connection)
    const firstStarted = Promise.withResolvers<void>()
    const otherLaneStarted = Promise.withResolvers<void>()
    const releaseFirst = Promise.withResolvers<void>()
    const processed: string[] = []
    const worker = new Worker(
      queueName,
      async (job: Job) => {
        processed.push(job.name)
        if (job.name === 'first') {
          firstStarted.resolve()
          await releaseFirst.promise
        }
        if (job.name === 'other') otherLaneStarted.resolve()
      },
      { ...connection, concurrency: 3, blockTimeout: 10_000 },
    )

    try {
      await worker.waitUntilReady()
      const first = await queue.add(
        'first',
        {},
        reconciliationJobOptions('copy:topics', randomUUID()),
      )
      if (!first) throw new Error('Expected first reconciliation job')
      await firstStarted.promise
      const second = await queue.add(
        'second',
        {},
        reconciliationJobOptions('copy:posts', randomUUID()),
      )
      if (!second) throw new Error('Expected second reconciliation job')
      const other = await queue.add(
        'other',
        {},
        {
          priority: 10,
          ordering: { key: 'other', concurrency: 1 },
        },
      )
      if (!other) throw new Error('Expected unrelated job')
      await otherLaneStarted.promise
      expect(await second.getState()).toBe('group-waiting')
      expect(processed).toEqual(['first', 'other'])
      releaseFirst.resolve()
      await vi.waitFor(() => expect(processed).toContain('second'), { timeout: 3_000 })
    } finally {
      releaseFirst.resolve()
      await worker.close(true)
      await queue.obliterate({ force: true })
      await queue.close()
    }
  })
})

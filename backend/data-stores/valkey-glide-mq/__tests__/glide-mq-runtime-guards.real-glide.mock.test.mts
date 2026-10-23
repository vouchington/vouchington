import { describe, expect, it, vi } from 'vitest'
import { waitForRealGlideEvent } from '@voucha/test-helpers/real-glide-terminal-deadline'
import { createQueue, createWorker } from '../glide-mq-factory.mts'

// Keep the real GlideMQ transport in the dedicated integration project.
vi.mock<typeof import('glide-mq')>(import('glide-mq'), importOriginal => importOriginal())

describe('GlideMQ runtime guards', () => {
  it('fails a processor that adds its own active dedup id', async () => {
    const name = `self-dedup-${crypto.randomUUID()}`
    const queue = createQueue(name, { priorityKind: 'ranked' })
    const failed = Promise.withResolvers<Error>()
    const worker = createWorker(
      name,
      async job => {
        await queue.add(
          'different-name',
          {},
          {
            deduplication: { id: job.opts.deduplication!.id, mode: 'simple' },
          },
        )
      },
      { blockTimeout: 1000, promotionInterval: 1000 },
    )
    worker.on('failed', (_job, error) => failed.resolve(error))
    try {
      await worker.waitUntilReady()
      await queue.add(
        'first',
        {},
        { deduplication: { id: 'same-id', mode: 'simple' }, attempts: 1 },
      )
      await expect(failed.promise).resolves.toHaveProperty(
        'message',
        expect.stringContaining('tried to add itself'),
      )
      expect(await queue.searchJobs({ name: 'different-name' })).toHaveLength(0)
    } finally {
      await worker.close(true)
      await queue.obliterate({ force: true })
      await queue.close()
    }
  })

  it('reports and rejects self-add in production without failing the processor', async () => {
    const name = `self-prod-${crypto.randomUUID()}`
    const queue = createQueue(name, { priorityKind: 'ranked' })
    const completed = Promise.withResolvers<void>()
    const worker = createWorker(
      name,
      async job => {
        await queue.add('duplicate', {}, { jobId: job.id })
      },
      { blockTimeout: 1000, promotionInterval: 1000 },
    )
    worker.on('completed', () => completed.resolve())
    try {
      vi.stubEnv('NODE_ENV', 'production')
      await worker.waitUntilReady()
      await queue.add('first', {}, { jobId: 'active-job', attempts: 1 })
      await completed.promise
      expect(await queue.searchJobs({ name: 'duplicate' })).toHaveLength(0)
    } finally {
      vi.unstubAllEnvs()
      await worker.close(true)
      await queue.obliterate({ force: true })
      await queue.close()
    }
  })

  it('fails a bulk add that reuses the active job id', async () => {
    const name = `self-bulk-${crypto.randomUUID()}`
    const queue = createQueue(name, { priorityKind: 'ranked' })
    const failed = Promise.withResolvers<Error>()
    const worker = createWorker(
      name,
      async job => {
        await queue.addBulk([{ name: 'other-name', data: {}, opts: { jobId: job.id } }])
      },
      { blockTimeout: 1000, promotionInterval: 1000 },
    )
    worker.on('failed', (_job, error) => failed.resolve(error))
    try {
      await worker.waitUntilReady()
      await queue.add('first', {}, { jobId: 'active-job', attempts: 1 })
      await expect(failed.promise).resolves.toHaveProperty(
        'message',
        expect.stringContaining('tried to add itself'),
      )
      expect(await queue.searchJobs({ name: 'other-name' })).toHaveLength(0)
    } finally {
      await worker.close(true)
      await queue.obliterate({ force: true })
      await queue.close()
    }
  })

  it('allows a dispatcher to enqueue each page with a new id', async () => {
    const name = `page-continuation-${crypto.randomUUID()}`
    const queue = createQueue<{ page: number }>(name, { priorityKind: 'ranked' })
    const completed = Promise.withResolvers<void>()
    const seen: number[] = []
    const completedIds: string[] = []
    const worker = createWorker<{ page: number }>(
      name,
      async job => {
        seen.push(job.data.page)
        if (job.data.page < 3)
          await queue.add(
            'page',
            { page: job.data.page + 1 },
            {
              jobId: `page-${job.data.page + 1}`,
              deduplication: { id: `dedup-page-${job.data.page + 1}`, mode: 'simple' },
            },
          )
      },
      { blockTimeout: 1000, promotionInterval: 1000 },
    )
    const onCompleted = (job: { id: string }) => {
      completedIds.push(job.id)
      if (job.id === 'page-3') completed.resolve()
    }
    worker.on('completed', onCompleted)
    try {
      await worker.waitUntilReady()
      await queue.add(
        'page',
        { page: 1 },
        {
          jobId: 'page-1',
          deduplication: { id: 'dedup-page-1', mode: 'simple' },
        },
      )
      await waitForRealGlideEvent(completed.promise, `GlideMQ page-3 completion ${name}`)
      expect(seen).toEqual([1, 2, 3])
      expect(completedIds).toEqual(['page-1', 'page-2', 'page-3'])
    } finally {
      worker.off('completed', onCompleted)
      await worker.close(true)
      await queue.obliterate({ force: true })
      await queue.close()
    }
  })
})

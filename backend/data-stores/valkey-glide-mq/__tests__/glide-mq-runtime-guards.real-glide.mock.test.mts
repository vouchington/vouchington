import { describe, expect, it, vi } from 'vitest'
import { workerQueuePrefix } from '@data-stores/valkey-core/glide-mq-client'
import { createQueue, createWorker } from '../glide-mq-factory.mts'
import { workerQueueCommandClient } from '../glide-mq-shared-client.mts'
import { withScheduledRunLease } from '../scheduled-run-lease.mts'

// Keep the real GlideMQ transport in the dedicated integration project.
vi.mock<typeof import('glide-mq')>(import('glide-mq'), importOriginal => importOriginal())

describe('GlideMQ runtime guards', () => {
  it('fails a processor that adds its own active dedup id', async () => {
    const name = `self-dedup-${crypto.randomUUID()}`
    const queue = createQueue(name, { priorityKind: 'ranked' })
    const failed = Promise.withResolvers<Error>()
    const worker = createWorker(name, async job => {
      await queue.add(
        'different-name',
        {},
        {
          deduplication: { id: job.opts.deduplication!.id, mode: 'simple' },
        },
      )
    })
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
    const worker = createWorker(name, async job => {
      await queue.add('duplicate', {}, { jobId: job.id })
    })
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
    const worker = createWorker(name, async job => {
      await queue.addBulk([{ name: 'other-name', data: {}, opts: { jobId: job.id } }])
    })
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
    const worker = createWorker<{ page: number }>(name, async job => {
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
      else completed.resolve()
    })
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
      await completed.promise
      expect(seen).toEqual([1, 2, 3])
    } finally {
      await worker.close(true)
      await queue.obliterate({ force: true })
      await queue.close()
    }
  })

  it('bounds leases from scheduler timestamps and malformed entries', async () => {
    const name = `lease-entry-${crypto.randomUUID()}`
    const base = `${workerQueuePrefix ?? 'glide'}:{${name}}`
    const queue = createQueue(name, { priorityKind: 'ranked' })
    const job = await queue.add('work', {}, { jobId: 'scheduled-root' })
    if (!job) throw new Error('Expected a scheduled root')
    Object.assign(job, { schedulerName: 'repeat' })
    const leaseKey = `${base}:run:repeat`
    try {
      await workerQueueCommandClient.hset(`${base}:schedulers`, {
        repeat: JSON.stringify({ lastRun: 1000, nextRun: 11000 }),
      })
      const releaseFirst = await withScheduledRunLease(name, job, { lockDuration: 20000 })
      expect(releaseFirst).not.toBeNull()
      const boundedTtl = await workerQueueCommandClient.pttl(leaseKey)
      expect(boundedTtl).toBeGreaterThan(0)
      expect(boundedTtl).toBeLessThanOrEqual(10000)
      await releaseFirst?.()

      await workerQueueCommandClient.hset(`${base}:schedulers`, { repeat: '{malformed' })
      const releaseMalformed = await withScheduledRunLease(name, job, { lockDuration: 20000 })
      expect(releaseMalformed).not.toBeNull()
      const fallbackTtl = await workerQueueCommandClient.pttl(leaseKey)
      expect(fallbackTtl).toBeGreaterThan(10000)
      expect(fallbackTtl).toBeLessThanOrEqual(60000)
      await releaseMalformed?.()
    } finally {
      await queue.obliterate({ force: true })
      await workerQueueCommandClient.unlink([leaseKey, `${leaseKey}:previous`])
      await queue.close()
    }
  })

  it('releases an acquired lease if previous-run bookkeeping fails', async () => {
    const name = `lease-bookkeeping-${crypto.randomUUID()}`
    const base = `${workerQueuePrefix ?? 'glide'}:{${name}}`
    const queue = createQueue(name, { priorityKind: 'ranked' })
    const job = await queue.add('work', {}, { jobId: 'scheduled-root' })
    if (!job) throw new Error('Expected a scheduled root')
    Object.assign(job, { schedulerName: 'repeat' })
    const leaseKey = `${base}:run:repeat`
    const previousKey = `${leaseKey}:previous`
    try {
      // GET against a hash is a real Valkey bookkeeping failure after SET NX succeeds.
      await workerQueueCommandClient.hset(previousKey, { invalid: 'previous-run' })
      await expect(withScheduledRunLease(name, job, { lockDuration: 20000 })).rejects.toThrow(
        /WRONGTYPE/,
      )
      expect(await workerQueueCommandClient.get(leaseKey)).toBeNull()
      const releaseRetry = await withScheduledRunLease(name, job, { lockDuration: 20000 })
      expect(releaseRetry).not.toBeNull()
      await releaseRetry?.()
    } finally {
      await queue.obliterate({ force: true })
      await workerQueueCommandClient.unlink([leaseKey, previousKey])
      await queue.close()
    }
  })

  it('skips a second scheduled root while the first lease is live', async () => {
    const name = `live-lease-${crypto.randomUUID()}`
    const base = `${workerQueuePrefix ?? 'glide'}:{${name}}`
    const queue = createQueue(name, { priorityKind: 'ranked' })
    const started = Promise.withResolvers<void>()
    const skipped = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const seen: string[] = []
    try {
      const first = await queue.add('work', {}, { priority: 10 })
      const second = await queue.add('work', {}, { priority: 10 })
      if (!first || !second) throw new Error('Expected two synthetic scheduler roots')
      await Promise.all(
        [first, second].map(job =>
          workerQueueCommandClient.hset(`${base}:job:${job.id}`, { schedulerName: 'repeat' }),
        ),
      )
      const worker = createWorker(
        name,
        async job => {
          seen.push(job.id)
          started.resolve()
          await release.promise
        },
        { concurrency: 2 },
      )
      worker.on('completed', job => {
        if (job.id !== seen[0]) skipped.resolve()
      })
      try {
        await worker.waitUntilReady()
        await started.promise
        await skipped.promise
        expect(seen).toHaveLength(1)
        expect(await workerQueueCommandClient.hget(`${base}:run-metrics`, 'skipped_overlap')).toBe(
          '1',
        )
      } finally {
        release.resolve()
        await worker.close(true)
      }
    } finally {
      await queue.obliterate({ force: true })
      await workerQueueCommandClient.unlink([
        `${base}:run:repeat`,
        `${base}:run:repeat:previous`,
        `${base}:run-metrics`,
      ])
      await queue.close()
    }
  })

  it('lets the next scheduled run proceed after its predecessor lease expires', async () => {
    const name = `expired-lease-${crypto.randomUUID()}`
    const queue = createQueue(name, { priorityKind: 'ranked' })
    const first = Promise.withResolvers<void>()
    const second = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    let running = 0
    const worker = createWorker(
      name,
      async () => {
        running++
        if (running === 1) first.resolve()
        if (running === 2) second.resolve()
        await release.promise
        running--
      },
      { concurrency: 2, promotionInterval: 100 },
    )
    const leaseKey = `${workerQueuePrefix ?? 'glide'}:{${name}}:run:repeat`
    try {
      await worker.waitUntilReady()
      await queue.upsertJobScheduler(
        'repeat',
        { every: 1000 },
        {
          name: 'work',
          data: {},
          opts: { priority: 10 },
        },
      )
      await first.promise
      expect(await workerQueueCommandClient.pexpire(leaseKey, 1)).toBe(true)
      await second.promise
      expect(running).toBe(2)
    } finally {
      await queue.removeJobScheduler('repeat')
      release.resolve()
      await worker.close(true)
      await queue.obliterate({ force: true })
      await workerQueueCommandClient.unlink([
        leaseKey,
        `${leaseKey}:previous`,
        `${workerQueuePrefix ?? 'glide'}:{${name}}:run-metrics`,
      ])
      await queue.close()
    }
  })
})

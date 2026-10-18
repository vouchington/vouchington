import { describe, expect, it, vi } from 'vitest'
import { QueueEvents } from 'glide-mq'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-core/glide-mq-client'
import { createQueue, createWorker } from '../glide-mq-factory.mts'
import { wrapBatchProcessor } from '../guarded-worker-processors.mts'
import { workerQueueCommandClient } from '../glide-mq-shared-client.mts'
import { withScheduledRunLease } from '../scheduled-run-lease.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), importOriginal => importOriginal())

describe('scheduled run lease recovery', () => {
  it('releases a scheduled batch lease when the batch processor fails', async () => {
    const name = `lease-batch-failure-${crypto.randomUUID()}`
    const base = `${workerQueuePrefix ?? 'glide'}:{${name}}`
    const queue = createQueue(name, { priorityKind: 'ranked' })
    const job = await queue.add('batch', {}, { jobId: 'scheduled-batch' })
    if (!job) throw new Error('Expected a scheduled batch job')
    await workerQueueCommandClient.hset(`${base}:job:${job.id}`, { schedulerName: 'repeat' })
    const process = wrapBatchProcessor(
      name,
      async () => {
        throw new Error('batch processor failure')
      },
      { lockDuration: 20_000 },
    )
    try {
      await expect(process([job])).rejects.toThrow('batch processor failure')
      expect(await workerQueueCommandClient.get(`${base}:run:repeat`)).toBeNull()
    } finally {
      await queue.obliterate({ force: true })
      await workerQueueCommandClient.unlink([`${base}:run:repeat:previous`])
      await queue.close()
    }
  })

  it('still skips a fresh tick when overlap metric storage fails', async () => {
    const name = `lease-metric-${crypto.randomUUID()}`
    const base = `${workerQueuePrefix ?? 'glide'}:{${name}}`
    const queue = createQueue(name, { priorityKind: 'ranked' })
    const first = await queue.add('sweep', {}, { jobId: 'first' })
    const second = await queue.add('sweep', {}, { jobId: 'second' })
    if (!first || !second) throw new Error('Expected both scheduled ticks')
    Object.assign(first, { schedulerName: 'repeat' })
    Object.assign(second, { schedulerName: 'repeat' })
    const release = await withScheduledRunLease(name, first, { lockDuration: 20000 })
    try {
      await workerQueueCommandClient.set(`${base}:run-metrics`, 'wrong-type')
      expect(await withScheduledRunLease(name, second, { lockDuration: 20000 })).toBeNull()
      expect(
        await workerQueueCommandClient.hget(`${base}:job:${second.id}`, 'scheduledRunLeaseSkipped'),
      ).toBe('repeat')
      await release?.()
      // Even if the collision response were lost, this tick cannot run after the holder releases.
      expect(await withScheduledRunLease(name, second, { lockDuration: 20000 })).toBeNull()
      expect(await workerQueueCommandClient.get(`${base}:run:repeat`)).toBeNull()
    } finally {
      await release?.()
      await queue.obliterate({ force: true })
      await workerQueueCommandClient.unlink([`${base}:run-metrics`, `${base}:run:repeat:previous`])
      await queue.close()
    }
  })

  it('uses an isolated worker prefix and lets the same job reacquire its owned lease', async () => {
    const name = `lease-prefix-${crypto.randomUUID()}`
    const prefix = `isolated-${crypto.randomUUID()}`
    const base = `${prefix}:{${name}}`
    const globalBase = `${workerQueuePrefix ?? 'glide'}:{${name}}`
    const queue = createQueue(name, { priorityKind: 'ranked' })
    const job = await queue.add('work', {}, { jobId: 'scheduled-root' })
    if (!job) throw new Error('Expected a scheduled root')
    Object.assign(job, { schedulerName: 'repeat' })
    const leaseKey = `${base}:run:repeat`
    try {
      await workerQueueCommandClient.hset(`${base}:schedulers`, {
        repeat: JSON.stringify({ lastRun: 1000, nextRun: 6000 }),
      })
      const releaseFirst = await withScheduledRunLease(name, job, {
        prefix,
        lockDuration: 20000,
      })
      expect(releaseFirst).not.toBeNull()
      expect(await workerQueueCommandClient.pttl(leaseKey)).toBeLessThanOrEqual(5000)
      expect(await workerQueueCommandClient.get(`${globalBase}:run:repeat`)).toBeNull()
      const releaseRetry = await withScheduledRunLease(name, job, { prefix, lockDuration: 20000 })
      expect(releaseRetry).not.toBeNull()
      expect(
        await workerQueueCommandClient.hget(`${base}:run-metrics`, 'skipped_overlap'),
      ).toBeNull()
      await releaseRetry?.()
      await releaseFirst?.()
      expect(await workerQueueCommandClient.get(leaseKey)).toBeNull()
    } finally {
      await queue.obliterate({ force: true })
      await workerQueueCommandClient.unlink([
        leaseKey,
        `${leaseKey}:previous`,
        `${base}:schedulers`,
        `${base}:job:${job.id}`,
      ])
      await queue.close()
    }
  })

  it('repairs admission after a crash between acquiring the lease and recording it', async () => {
    const name = `lease-admission-retry-${crypto.randomUUID()}`
    const base = `${workerQueuePrefix ?? 'glide'}:{${name}}`
    const leaseKey = `${base}:run:repeat`
    const queue = createQueue(name, { priorityKind: 'ranked' })
    const job = await queue.add('sweep', {}, { jobId: 'scheduled-root' })
    if (!job) throw new Error('Expected a scheduled root')
    Object.assign(job, { schedulerName: 'repeat' })
    try {
      await workerQueueCommandClient.set(leaseKey, job.id)
      expect(
        await workerQueueCommandClient.hget(`${base}:job:${job.id}`, 'scheduledRunLeaseAdmitted'),
      ).toBeNull()
      const release = await withScheduledRunLease(name, job, { lockDuration: 20_000 })
      expect(release).not.toBeNull()
      expect(
        await workerQueueCommandClient.hget(`${base}:job:${job.id}`, 'scheduledRunLeaseAdmitted'),
      ).toBe('repeat')
      await release?.()
      expect(await workerQueueCommandClient.get(leaseKey)).toBeNull()
    } finally {
      await queue.obliterate({ force: true })
      await workerQueueCommandClient.unlink([leaseKey, `${leaseKey}:previous`])
      await queue.close()
    }
  })

  it('defers an admitted retained page behind a new tick, then resumes its saved cursor', async () => {
    const name = `lease-continuation-${crypto.randomUUID()}`
    const base = `${workerQueuePrefix ?? 'glide'}:{${name}}`
    const queue = createQueue<{ kind: 'old' | 'new'; page: number }>(name, {
      priorityKind: 'ranked',
    })
    const first = await queue.add('sweep', { kind: 'old', page: 1 }, { jobId: 'old-root' })
    if (!first) throw new Error('Expected the first scheduled root')
    await workerQueueCommandClient.hset(`${base}:job:${first.id}`, { schedulerName: 'repeat' })
    const events = new QueueEvents(name, {
      connection: workerQueueConnection,
      prefix: workerQueuePrefix,
      blockTimeout: 500,
    })
    const oldDelayedAgain = Promise.withResolvers<void>()
    let oldDelayCount = 0
    events.on('delay-changed', ({ jobId }: { jobId: string }) => {
      if (jobId === first.id && ++oldDelayCount === 2) oldDelayedAgain.resolve()
    })
    const firstMoved = Promise.withResolvers<void>()
    const oldWorker = createWorker<typeof first.data>(name, async job => {
      await job.updateData({ kind: 'old', page: 2 })
      firstMoved.resolve()
      await job.moveToDelayed(Date.now() + 500)
    })
    let newWorker: ReturnType<typeof createWorker<typeof first.data>> | undefined
    const releaseNew = Promise.withResolvers<void>()
    const newStarted = Promise.withResolvers<void>()
    const oldCompleted = Promise.withResolvers<void>()
    const seenPages: number[] = []
    try {
      await events.waitUntilReady()
      await oldWorker.waitUntilReady()
      await firstMoved.promise
      await oldWorker.close()
      expect(await first.getState()).toBe('delayed')

      const second = await queue.add('sweep', { kind: 'new', page: 1 }, { jobId: 'new-root' })
      if (!second) throw new Error('Expected the next scheduled root')
      await workerQueueCommandClient.hset(`${base}:job:${second.id}`, { schedulerName: 'repeat' })
      newWorker = createWorker<typeof first.data>(
        name,
        async job => {
          if (job.data.kind === 'new') {
            newStarted.resolve()
            await releaseNew.promise
          } else {
            seenPages.push(job.data.page)
            oldCompleted.resolve()
          }
        },
        { concurrency: 2 },
      )
      await newWorker.waitUntilReady()
      await newStarted.promise
      await oldDelayedAgain.promise
      expect(seenPages).toEqual([])
      releaseNew.resolve()
      await oldCompleted.promise
      expect(seenPages).toEqual([2])
    } finally {
      releaseNew.resolve()
      await Promise.all([oldWorker.close(true), newWorker?.close(true)])
      await queue.obliterate({ force: true })
      await workerQueueCommandClient.unlink([`${base}:run:repeat`, `${base}:run:repeat:previous`])
      await Promise.all([queue.close(), events.close()])
    }
  })

  it('preserves a processor failure when lease cleanup also fails', async () => {
    const name = `lease-cleanup-${crypto.randomUUID()}`
    const base = `${workerQueuePrefix ?? 'glide'}:{${name}}`
    const leaseKey = `${base}:run:repeat`
    const queue = createQueue(name, { priorityKind: 'ranked' })
    const job = await queue.add('work', {}, { attempts: 1 })
    if (!job) throw new Error('Expected a scheduled root')
    await workerQueueCommandClient.hset(`${base}:job:${job.id}`, { schedulerName: 'repeat' })
    const failed = Promise.withResolvers<Error>()
    const worker = createWorker(name, async () => {
      await workerQueueCommandClient.unlink([leaseKey])
      await workerQueueCommandClient.hset(leaseKey, { invalid: 'lease-value' })
      throw new Error('processor failure')
    })
    worker.on('failed', (_job, error) => failed.resolve(error))
    try {
      await worker.waitUntilReady()
      await expect(failed.promise).resolves.toHaveProperty('message', 'processor failure')
    } finally {
      await worker.close(true)
      await queue.obliterate({ force: true })
      await workerQueueCommandClient.unlink([leaseKey, `${leaseKey}:previous`])
      await queue.close()
    }
  })

  it('does not retry successful processing when lease cleanup fails', async () => {
    const name = `lease-success-cleanup-${crypto.randomUUID()}`
    const base = `${workerQueuePrefix ?? 'glide'}:{${name}}`
    const leaseKey = `${base}:run:repeat`
    const queue = createQueue(name, { priorityKind: 'ranked' })
    const job = await queue.add('work', {}, { attempts: 2 })
    if (!job) throw new Error('Expected a scheduled root')
    await workerQueueCommandClient.hset(`${base}:job:${job.id}`, { schedulerName: 'repeat' })
    const completed = Promise.withResolvers<void>()
    let processed = 0
    const worker = createWorker(name, async () => {
      processed += 1
      await workerQueueCommandClient.unlink([leaseKey])
      await workerQueueCommandClient.hset(leaseKey, { invalid: 'lease-value' })
    })
    worker.on('completed', () => completed.resolve())
    try {
      await worker.waitUntilReady()
      await completed.promise
      expect(processed).toBe(1)
      expect(await job.getState()).toBe('completed')
    } finally {
      await worker.close(true)
      await queue.obliterate({ force: true })
      await workerQueueCommandClient.unlink([leaseKey, `${leaseKey}:previous`])
      await queue.close()
    }
  })
})

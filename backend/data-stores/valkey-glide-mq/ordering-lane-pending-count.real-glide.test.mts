import { randomUUID } from 'node:crypto'
import { Queue, Worker, type Job } from 'glide-mq'
import { describe, expect, it } from 'vitest'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-core/glide-mq-client'
import { workerQueueCommandClient } from './glide-mq-shared-client.mts'
import { getOrderingLanePendingCount } from './ordering-lane-pending-count.mts'
import { waitForRealGlideEvent } from '@voucha/test-helpers/real-glide-terminal-deadline'

const orderingKey = 'activitypub:inbound'
type TestJobData = { item?: number; secret?: string }

function ownedQueue() {
  const name = `inbound_counter_${randomUUID()}`
  const prefix = `${workerQueuePrefix ?? 'glide'}_counter_${randomUUID()}`
  const queue = new Queue<TestJobData, void>(name, {
    connection: workerQueueConnection,
    prefix,
  })
  return {
    name,
    prefix,
    queue,
    count: () => getOrderingLanePendingCount(name, orderingKey, prefix),
  }
}

describe('native inbound ordering backlog count', () => {
  it('releases out-of-order removals only at the contiguous frontier', async () => {
    const { queue, count } = ownedQueue()
    try {
      const opts = { ordering: { key: orderingKey, concurrency: 1 } }
      const first = await queue.add('activitypub.processDelivery', { item: 1 }, opts)
      const second = await queue.add('activitypub.processDelivery', { item: 2 }, opts)
      const third = await queue.add('activitypub.processDelivery', { item: 3 }, opts)
      expect(await count()).toBe(3)

      await second!.remove()
      expect(await count()).toBe(3)
      await first!.remove()
      expect(await count()).toBe(1)
      await third!.remove()
      expect(await count()).toBe(0)
    } finally {
      await queue.obliterate({ force: true })
      await queue.close()
    }
  })

  it('counts active work and releases a terminal sensitive failure', async () => {
    const { name, prefix, queue, count } = ownedQueue()
    const active = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const completed = Promise.withResolvers<void>()
    const markerCompleted = Promise.withResolvers<void>()
    const failed = Promise.withResolvers<void>()
    let worker: Worker<TestJobData, void> | undefined
    try {
      const opts = {
        ordering: { key: orderingKey, concurrency: 1 },
        attempts: 1,
        removeOnComplete: true,
        removeOnFail: true,
      }
      const first = await queue.add('activitypub.processDelivery', { secret: 'first' }, opts)
      const second = await queue.add('activitypub.processDelivery', { secret: 'second' }, opts)
      const marker = await queue.add(
        'other.marker',
        {},
        { ordering: { key: 'other-lane', concurrency: 1 }, removeOnComplete: true },
      )
      expect(await count()).toBe(2)

      const runningWorker = new Worker<TestJobData, void>(
        name,
        async (job: Job<TestJobData, void>) => {
          if (job.id === first!.id) {
            active.resolve()
            await release.promise
            return
          }
          if (job.id === marker!.id) return
          throw new Error('terminal inbound failure')
        },
        { connection: workerQueueConnection, prefix, concurrency: 2, blockTimeout: 100 },
      )
      worker = runningWorker
      runningWorker.on('completed', job => {
        if (job.id === first!.id) completed.resolve()
        if (job.id === marker!.id) markerCompleted.resolve()
      })
      runningWorker.on('failed', job => {
        if (job?.id === second!.id) failed.resolve()
      })
      await runningWorker.waitUntilReady()
      await waitForRealGlideEvent(active.promise, 'inbound job activation')
      await waitForRealGlideEvent(markerCompleted.promise, 'other-lane marker completion')
      expect(await second!.getState()).toBe('group-waiting')
      expect(await count()).toBe(2)
      release.resolve()
      await waitForRealGlideEvent(completed.promise, 'first inbound completion')
      await waitForRealGlideEvent(failed.promise, 'second inbound terminal failure')
      expect(await count()).toBe(0)
      expect(await queue.getJob(second!.id)).toBeNull()
    } finally {
      release.resolve()
      await worker?.close()
      await queue.obliterate({ force: true })
      await queue.close()
    }
  })

  it('keeps a delayed retry pending until its owned job is removed', async () => {
    const { name, prefix, queue, count } = ownedQueue()
    const failedAttempt = Promise.withResolvers<void>()
    let worker: Worker<TestJobData, void> | undefined
    try {
      const job = await queue.add(
        'activitypub.processDelivery',
        { secret: 'delayed retry' },
        {
          ordering: { key: orderingKey, concurrency: 1 },
          attempts: 2,
          backoff: { type: 'fixed', delay: 60_000 },
          removeOnComplete: true,
          removeOnFail: true,
        },
      )
      const runningWorker = new Worker<TestJobData, void>(
        name,
        async () => {
          throw new Error('retry later')
        },
        { connection: workerQueueConnection, prefix, blockTimeout: 100 },
      )
      worker = runningWorker
      runningWorker.on('failed', failedJob => {
        if (failedJob?.id === job!.id) failedAttempt.resolve()
      })
      await runningWorker.waitUntilReady()
      await waitForRealGlideEvent(failedAttempt.promise, 'inbound delayed retry')
      expect(await job!.getState()).toBe('delayed')
      expect(await count()).toBe(1)
      await job!.remove()
      expect(await count()).toBe(0)
    } finally {
      await worker?.close()
      await queue.obliterate({ force: true })
      await queue.close()
    }
  })

  it('fails closed on malformed or missing allocated metadata in an owned namespace', async () => {
    const name = `inbound_counter_corrupt_${randomUUID()}`
    const prefix = `${workerQueuePrefix ?? 'glide'}_counter_${randomUUID()}`
    const ordering = `${prefix}:{${name}}:ordering`
    const meta = `${prefix}:{${name}}:meta`
    try {
      await workerQueueCommandClient.hset(ordering, { [orderingKey]: 'malformed' })
      await expect(getOrderingLanePendingCount(name, orderingKey, prefix)).rejects.toThrow(
        'malformed',
      )

      await workerQueueCommandClient.hdel(ordering, [orderingKey])
      await workerQueueCommandClient.hset(meta, { [`orderdone:${orderingKey}`]: '1' })
      await expect(getOrderingLanePendingCount(name, orderingKey, prefix)).rejects.toThrow(
        'allocation is missing',
      )
    } finally {
      await workerQueueCommandClient.unlink([ordering, meta])
    }
  })
})

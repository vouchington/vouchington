import { randomUUID } from 'node:crypto'
import { Queue, Worker, type Job } from 'glide-mq'
import { describe, expect, it } from 'vitest'
import { workerQueueConnection } from '@data-stores/valkey-core/glide-mq-client'
import { waitForRealGlideEvent } from '@voucha/test-helpers/real-glide-terminal-deadline'
import { workerQueueCommandClient } from './glide-mq-shared-client.mts'
import {
  activityPubInboxReservationKey,
  observeActivityPubInboxReservations,
  releaseActivityPubInboxDelivery,
  reserveActivityPubInboxDelivery,
} from './activitypub-inbox-reservations.mts'

const ttlMs = 60_000

function ownedReservationSet() {
  const queueName = `activitypub_inbox_test_${randomUUID()}`
  const prefix = `inbox_reservation_test_${randomUUID()}`
  const key = activityPubInboxReservationKey(queueName, prefix)
  return {
    key,
    reserve: (jobId: string, cap: number) =>
      reserveActivityPubInboxDelivery(queueName, jobId, cap, ttlMs, 2, prefix),
    release: (jobId: string) => releaseActivityPubInboxDelivery(queueName, jobId, prefix),
    cleanup: () => workerQueueCommandClient.unlink([key]),
  }
}

describe('ActivityPub inbox reservations', () => {
  it('admits exactly the configured cap across simultaneous requests', async () => {
    const owned = ownedReservationSet()
    try {
      const attempts = Array.from({ length: 12 }, () => randomUUID())
      const results = await Promise.all(attempts.map(id => owned.reserve(id, 2)))
      expect(results.filter(Boolean)).toHaveLength(2)
      expect(await workerQueueCommandClient.zcard(owned.key)).toBe(2)
      await Promise.all(attempts.filter((_, index) => results[index]).map(id => owned.release(id)))
      expect(await workerQueueCommandClient.zcard(owned.key)).toBe(0)
    } finally {
      await owned.cleanup()
    }
  })

  it('admits later work when a completed job releases while an earlier job stays delayed', async () => {
    const owned = ownedReservationSet()
    try {
      const delayedId = randomUUID()
      const completedId = randomUUID()
      const laterId = randomUUID()
      expect(await owned.reserve(delayedId, 2)).toBe(true)
      expect(await owned.reserve(completedId, 2)).toBe(true)
      expect(await owned.reserve(laterId, 2)).toBe(false)

      await owned.release(completedId)
      expect(await owned.reserve(laterId, 2)).toBe(true)
      expect(await workerQueueCommandClient.zcard(owned.key)).toBe(2)
      await owned.release(delayedId)
      await owned.release(laterId)
      expect(await workerQueueCommandClient.zcard(owned.key)).toBe(0)
    } finally {
      await owned.cleanup()
    }
  })

  it('sweeps an expired owned reservation on the next admission', async () => {
    const owned = ownedReservationSet()
    try {
      const expiredId = randomUUID()
      const admittedId = randomUUID()
      await workerQueueCommandClient.zadd(owned.key, { [expiredId]: Date.now() - 60_000 })
      expect(await owned.reserve(admittedId, 1)).toBe(true)
      expect(await workerQueueCommandClient.zcard(owned.key)).toBe(1)
      expect(await workerQueueCommandClient.zscore(owned.key, expiredId)).toBeNull()
      await owned.release(admittedId)
    } finally {
      await owned.cleanup()
    }
  })

  it('renews an expired reservation while its exact native job is still delayed', async () => {
    const queueName = `activitypub_inbox_live_${randomUUID()}`
    const prefix = `inbox_reservation_live_${randomUUID()}`
    const key = activityPubInboxReservationKey(queueName, prefix)
    const queue = new Queue(queueName, { connection: workerQueueConnection, prefix })
    try {
      const liveId = `activitypub-inbox__${randomUUID()}`
      const nextId = `activitypub-inbox__${randomUUID()}`
      const job = await queue.add(
        'activitypub.processDelivery',
        {},
        {
          jobId: liveId,
          delay: 60_000,
        },
      )
      expect(job).toBeTruthy()
      await workerQueueCommandClient.zadd(key, { [liveId]: Date.now() - 60_000 })

      expect(await reserveActivityPubInboxDelivery(queueName, nextId, 1, ttlMs, 1, prefix)).toBe(
        false,
      )
      expect(await workerQueueCommandClient.zcard(key)).toBe(1)
      expect(await workerQueueCommandClient.zscore(key, liveId)).not.toBeNull()
      await job!.remove()
    } finally {
      await workerQueueCommandClient.unlink([key])
      await queue.obliterate({ force: true })
      await queue.close()
    }
  })

  it('removes a retained terminal failure and releases a later completion', async () => {
    const queueName = `activitypub_inbox_terminal_${randomUUID()}`
    const prefix = `inbox_reservation_terminal_${randomUUID()}`
    const key = activityPubInboxReservationKey(queueName, prefix)
    const jobId = `activitypub-inbox__${randomUUID()}`
    const nextId = `activitypub-inbox__${randomUUID()}`
    const released = Promise.withResolvers<void>()
    const nextReleased = Promise.withResolvers<void>()
    const failed = Promise.withResolvers<void>()
    const completed = Promise.withResolvers<void>()
    const queue = new Queue<{ secret: string }, void>(queueName, {
      connection: workerQueueConnection,
      prefix,
    })
    const observer = observeActivityPubInboxReservations(queueName, prefix, releasedId => {
      if (releasedId === jobId) released.resolve()
      if (releasedId === nextId) nextReleased.resolve()
    })
    let worker: Worker<{ secret: string }, void> | undefined
    try {
      await observer.ready
      expect(await reserveActivityPubInboxDelivery(queueName, jobId, 1, ttlMs, 1, prefix)).toBe(
        true,
      )
      const job = await queue.add(
        'activitypub.processDelivery',
        { secret: 'redacted' },
        {
          jobId,
          ordering: { key: 'activitypub:inbound', concurrency: 1 },
          attempts: 1,
          removeOnFail: false,
        },
      )
      expect(job).toBeTruthy()
      const runningWorker = new Worker<{ secret: string }, void>(
        queueName,
        async (job: Job<{ secret: string }, void>) => {
          if (job.id === jobId) throw new Error('terminal signed-delivery failure')
        },
        { connection: workerQueueConnection, prefix, blockTimeout: 100 },
      )
      worker = runningWorker
      runningWorker.on('failed', failedJob => {
        if (failedJob?.id === jobId) failed.resolve()
      })
      runningWorker.on('completed', completedJob => {
        if (completedJob.id === nextId) completed.resolve()
      })
      await runningWorker.waitUntilReady()
      await waitForRealGlideEvent(failed.promise, 'terminal inbox failure')
      await waitForRealGlideEvent(released.promise, 'terminal inbox reservation release')
      expect(await queue.getJob(jobId)).toBeNull()
      expect(await workerQueueCommandClient.zcard(key)).toBe(0)
      expect(await reserveActivityPubInboxDelivery(queueName, nextId, 1, ttlMs, 1, prefix)).toBe(
        true,
      )
      await queue.add(
        'activitypub.processDelivery',
        { secret: 'complete' },
        {
          jobId: nextId,
          ordering: { key: 'activitypub:inbound', concurrency: 1 },
          removeOnComplete: true,
        },
      )
      await waitForRealGlideEvent(completed.promise, 'inbox completion')
      await waitForRealGlideEvent(nextReleased.promise, 'completed inbox reservation release')
      expect(await workerQueueCommandClient.zcard(key)).toBe(0)
    } finally {
      await worker?.close()
      await observer.close()
      await workerQueueCommandClient.unlink([key])
      await queue.obliterate({ force: true })
      await queue.close()
    }
  })

  it('replays a terminal event emitted before the reservation observer starts', async () => {
    const queueName = `activitypub_inbox_replay_${randomUUID()}`
    const prefix = `inbox_reservation_replay_${randomUUID()}`
    const key = activityPubInboxReservationKey(queueName, prefix)
    const jobId = `activitypub-inbox__${randomUUID()}`
    const failed = Promise.withResolvers<void>()
    const released = Promise.withResolvers<void>()
    const queue = new Queue<{ secret: string }, void>(queueName, {
      connection: workerQueueConnection,
      prefix,
    })
    let worker: Worker<{ secret: string }, void> | undefined
    let observer: ReturnType<typeof observeActivityPubInboxReservations> | undefined
    try {
      expect(await reserveActivityPubInboxDelivery(queueName, jobId, 1, ttlMs, 1, prefix)).toBe(
        true,
      )
      const job = await queue.add(
        'activitypub.processDelivery',
        { secret: 'redacted' },
        {
          jobId,
          attempts: 1,
          removeOnFail: true,
        },
      )
      expect(job).toBeTruthy()
      const runningWorker = new Worker<{ secret: string }, void>(
        queueName,
        async () => {
          throw new Error('terminal before observer startup')
        },
        { connection: workerQueueConnection, prefix, blockTimeout: 100 },
      )
      worker = runningWorker
      runningWorker.on('failed', failedJob => {
        if (failedJob?.id === jobId) failed.resolve()
      })
      await runningWorker.waitUntilReady()
      await waitForRealGlideEvent(failed.promise, 'pre-observer terminal failure')
      await runningWorker.close()
      worker = undefined
      expect(await workerQueueCommandClient.zcard(key)).toBe(1)

      observer = observeActivityPubInboxReservations(queueName, prefix, releasedId => {
        if (releasedId === jobId) released.resolve()
      })
      await observer.ready
      await waitForRealGlideEvent(released.promise, 'replayed terminal reservation release')
      expect(await workerQueueCommandClient.zcard(key)).toBe(0)
    } finally {
      await worker?.close()
      await observer?.close()
      await workerQueueCommandClient.unlink([key])
      await queue.obliterate({ force: true })
      await queue.close()
    }
  })

  it('releases a removed waiting job through the native observer', async () => {
    const queueName = `activitypub_inbox_removed_${randomUUID()}`
    const prefix = `inbox_reservation_removed_${randomUUID()}`
    const key = activityPubInboxReservationKey(queueName, prefix)
    const jobId = `activitypub-inbox__${randomUUID()}`
    const released = Promise.withResolvers<void>()
    const queue = new Queue(queueName, { connection: workerQueueConnection, prefix })
    const observer = observeActivityPubInboxReservations(queueName, prefix, releasedId => {
      if (releasedId === jobId) released.resolve()
    })
    try {
      await observer.ready
      expect(await reserveActivityPubInboxDelivery(queueName, jobId, 1, ttlMs, 1, prefix)).toBe(
        true,
      )
      const job = await queue.add('activitypub.processDelivery', {}, { jobId })
      expect(job).toBeTruthy()
      await job!.remove()
      await waitForRealGlideEvent(released.promise, 'removed inbox reservation release')
      expect(await workerQueueCommandClient.zcard(key)).toBe(0)
    } finally {
      await observer.close()
      await workerQueueCommandClient.unlink([key])
      await queue.obliterate({ force: true })
      await queue.close()
    }
  })
})

import { randomUUID } from 'node:crypto'
import { Queue, Worker } from 'glide-mq'
import { describe, expect, it } from 'vitest'
import { workerQueueConnection } from '@data-stores/valkey-core/glide-mq-client'
import { waitForRealGlideEvent } from '@voucha/test-helpers/real-glide-terminal-deadline'
import { workerQueueCommandClient } from './glide-mq-shared-client.mts'
import {
  activityPubInboxReservationKey,
  observeActivityPubInboxReservations,
  reserveActivityPubInboxDelivery,
} from './activitypub-inbox-reservations.mts'

describe('ActivityPub inbox retained terminal cleanup', () => {
  it('removes an expired sensitive job hash before releasing its reservation', async () => {
    const queueName = `inbox_expiry_${randomUUID()}`
    const prefix = `inbox_expiry_${randomUUID()}`
    const jobId = `activitypub-inbox__${randomUUID()}`
    const reservationKey = activityPubInboxReservationKey(queueName, prefix)
    const jobKey = `${prefix}:{${queueName}}:job:${jobId}`
    const released = Promise.withResolvers<void>()
    let processorCalled = false
    const queue = new Queue<{ secret: string }, void>(queueName, {
      connection: workerQueueConnection,
      prefix,
    })
    const observer = observeActivityPubInboxReservations(queueName, prefix, releasedId => {
      if (releasedId === jobId) released.resolve()
    })
    let worker: Worker<{ secret: string }, void> | undefined
    try {
      await observer.ready
      expect(await reserveActivityPubInboxDelivery(queueName, jobId, 1, 60_000, 1, prefix)).toBe(
        true,
      )
      const job = await queue.add(
        'activitypub.processDelivery',
        { secret: 'must be removed' },
        {
          jobId,
          ordering: { key: 'activitypub:inbound', concurrency: 1 },
        },
      )
      expect(job).toBeTruthy()
      await workerQueueCommandClient.hset(jobKey, { expireAt: String(Date.now() - 60_000) })

      const runningWorker = new Worker<{ secret: string }, void>(
        queueName,
        async () => {
          processorCalled = true
        },
        { connection: workerQueueConnection, prefix, blockTimeout: 100 },
      )
      worker = runningWorker
      await runningWorker.waitUntilReady()
      await waitForRealGlideEvent(released.promise, 'expired inbox payload cleanup')
      expect(processorCalled).toBe(false)
      expect(await queue.getJob(jobId)).toBeNull()
      expect(await workerQueueCommandClient.zcard(reservationKey)).toBe(0)
    } finally {
      await worker?.close()
      await observer.close()
      await workerQueueCommandClient.unlink([reservationKey])
      await queue.obliterate({ force: true })
      await queue.close()
    }
  })

  it('removes a revoked delayed job hash before releasing its reservation', async () => {
    const queueName = `inbox_revoked_${randomUUID()}`
    const prefix = `inbox_revoked_${randomUUID()}`
    const jobId = `activitypub-inbox__${randomUUID()}`
    const reservationKey = activityPubInboxReservationKey(queueName, prefix)
    const released = Promise.withResolvers<void>()
    const queue = new Queue<{ secret: string }, void>(queueName, {
      connection: workerQueueConnection,
      prefix,
    })
    const observer = observeActivityPubInboxReservations(queueName, prefix, releasedId => {
      if (releasedId === jobId) released.resolve()
    })
    try {
      await observer.ready
      expect(await reserveActivityPubInboxDelivery(queueName, jobId, 1, 60_000, 1, prefix)).toBe(
        true,
      )
      const job = await queue.add(
        'activitypub.processDelivery',
        { secret: 'must be removed' },
        { jobId, delay: 60_000 },
      )
      expect(job).toBeTruthy()
      expect(await queue.revoke(jobId)).toBe('revoked')
      await waitForRealGlideEvent(released.promise, 'revoked inbox payload cleanup')
      expect(await queue.getJob(jobId)).toBeNull()
      expect(await workerQueueCommandClient.zcard(reservationKey)).toBe(0)
    } finally {
      await observer.close()
      await workerQueueCommandClient.unlink([reservationKey])
      await queue.obliterate({ force: true })
      await queue.close()
    }
  })
})

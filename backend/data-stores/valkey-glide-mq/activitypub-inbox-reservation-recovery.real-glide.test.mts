import { randomUUID } from 'node:crypto'
import { Queue, Worker } from 'glide-mq'
import { describe, expect, it } from 'vitest'
import { workerQueueConnection } from '@data-stores/valkey-core/glide-mq-client'
import { waitForRealGlideEvent } from '@voucha/test-helpers/real-glide-terminal-deadline'
import { workerQueueCommandClient } from './glide-mq-shared-client.mts'
import {
  activityPubInboxReservationKey,
  releaseActivityPubInboxDelivery,
  reserveActivityPubInboxDelivery,
} from './activitypub-inbox-reservations.mts'

describe('ActivityPub inbox reservation recovery after a lost terminal event', () => {
  it.each(['failed', 'completed'] as const)(
    'reclaims an expired reservation and sensitive %s hash at the next admission',
    async outcome => {
      const queueName = `inbox_lost_${randomUUID()}`
      const prefix = `inbox_lost_${randomUUID()}`
      const jobId = `activitypub-inbox__${randomUUID()}`
      const nextId = `activitypub-inbox__${randomUUID()}`
      const reservationKey = activityPubInboxReservationKey(queueName, prefix)
      const terminalIndexKey = `${prefix}:{${queueName}}:${outcome}`
      const settled = Promise.withResolvers<void>()
      const queue = new Queue<{ secret: string }, void>(queueName, {
        connection: workerQueueConnection,
        prefix,
      })
      let worker: Worker<{ secret: string }, void> | undefined
      try {
        expect(await reserveActivityPubInboxDelivery(queueName, jobId, 1, 60_000, 1, prefix)).toBe(
          true,
        )
        const job = await queue.add(
          'activitypub.processDelivery',
          { secret: 'must not survive a lost event' },
          { jobId, attempts: 1, removeOnFail: false, removeOnComplete: false },
        )
        expect(job).toBeTruthy()
        const runningWorker = new Worker<{ secret: string }, void>(
          queueName,
          async () => {
            if (outcome === 'failed') throw new Error('terminal without observer')
          },
          { connection: workerQueueConnection, prefix, blockTimeout: 100 },
        )
        worker = runningWorker
        runningWorker.on('failed', failedJob => {
          if (outcome === 'failed' && failedJob?.id === jobId) settled.resolve()
        })
        runningWorker.on('completed', completedJob => {
          if (outcome === 'completed' && completedJob.id === jobId) settled.resolve()
        })
        await runningWorker.waitUntilReady()
        await waitForRealGlideEvent(settled.promise, `lost ${outcome} inbox event`)
        await runningWorker.close()
        worker = undefined
        expect(await (await queue.getJob(jobId))?.getState()).toBe(outcome)
        expect(await workerQueueCommandClient.zscore(terminalIndexKey, jobId)).not.toBeNull()
        expect(await workerQueueCommandClient.zcard(reservationKey)).toBe(1)

        await workerQueueCommandClient.zadd(reservationKey, { [jobId]: Date.now() - 60_000 })
        expect(await reserveActivityPubInboxDelivery(queueName, nextId, 1, 60_000, 1, prefix)).toBe(
          true,
        )
        expect(await queue.getJob(jobId)).toBeNull()
        expect(await workerQueueCommandClient.zscore(terminalIndexKey, jobId)).toBeNull()
        expect(await workerQueueCommandClient.zcard(reservationKey)).toBe(1)
        await releaseActivityPubInboxDelivery(queueName, nextId, prefix)
      } finally {
        await worker?.close()
        await workerQueueCommandClient.unlink([reservationKey])
        await queue.obliterate({ force: true })
        await queue.close()
      }
    },
  )

  it('releases a terminal reservation without deleting a non-inbound job hash', async () => {
    const queueName = `inbox_unrelated_${randomUUID()}`
    const prefix = `inbox_unrelated_${randomUUID()}`
    const jobId = `activitypub-inbox__${randomUUID()}`
    const nextId = `activitypub-inbox__${randomUUID()}`
    const reservationKey = activityPubInboxReservationKey(queueName, prefix)
    const jobKey = `${prefix}:{${queueName}}:job:${jobId}`
    const queue = new Queue<{ secret: string }, void>(queueName, {
      connection: workerQueueConnection,
      prefix,
    })
    try {
      const job = await queue.add('unrelated.task', { secret: 'must be retained' }, { jobId })
      expect(job).toBeTruthy()
      await workerQueueCommandClient.hset(jobKey, { state: 'failed' })
      await workerQueueCommandClient.zadd(reservationKey, { [jobId]: Date.now() - 60_000 })

      expect(await reserveActivityPubInboxDelivery(queueName, nextId, 1, 60_000, 1, prefix)).toBe(
        true,
      )
      expect((await queue.getJob(jobId))?.data).toEqual({ secret: 'must be retained' })
      expect(await workerQueueCommandClient.zcard(reservationKey)).toBe(1)
      await releaseActivityPubInboxDelivery(queueName, nextId, prefix)
    } finally {
      await workerQueueCommandClient.unlink([reservationKey])
      await queue.obliterate({ force: true })
      await queue.close()
    }
  })
})

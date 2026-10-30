import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { workerQueueCommandClient } from './glide-mq-shared-client.mts'
import {
  activityPubInboxReservationKey,
  reserveActivityPubInboxDelivery,
} from './activitypub-inbox-reservations.mts'

describe('ActivityPub inbox reservation failures', () => {
  it('rejects invalid cap and expiry bounds before any reservation write', async () => {
    const queueName = `inbox_invalid_${randomUUID()}`
    const prefix = `inbox_invalid_${randomUUID()}`
    const key = activityPubInboxReservationKey(queueName, prefix)
    try {
      await expect(
        reserveActivityPubInboxDelivery(queueName, randomUUID(), 0, 60_000, 1, prefix),
      ).rejects.toThrow('Invalid ActivityPub inbox reservation bounds')
      await expect(
        reserveActivityPubInboxDelivery(queueName, randomUUID(), 1, 0, 1, prefix),
      ).rejects.toThrow('Invalid ActivityPub inbox reservation bounds')
      await expect(
        reserveActivityPubInboxDelivery(queueName, randomUUID(), 2, 60_000, 1, prefix),
      ).rejects.toThrow('Invalid ActivityPub inbox reservation bounds')
      expect(await workerQueueCommandClient.zcard(key)).toBe(0)
    } finally {
      await workerQueueCommandClient.unlink([key])
    }
  })

  it('fails closed when an owned expired set exceeds the configured sweep bound', async () => {
    const queueName = `inbox_overflow_${randomUUID()}`
    const prefix = `inbox_overflow_${randomUUID()}`
    const key = activityPubInboxReservationKey(queueName, prefix)
    try {
      const expiredScore = Date.now() - 60_000
      await workerQueueCommandClient.zadd(key, {
        [randomUUID()]: expiredScore,
        [randomUUID()]: expiredScore,
        [randomUUID()]: expiredScore,
      })
      await expect(
        reserveActivityPubInboxDelivery(queueName, randomUUID(), 1, 60_000, 2, prefix),
      ).rejects.toThrow('Unknown ActivityPub inbox reservation result')
      expect(await workerQueueCommandClient.zcard(key)).toBe(3)
    } finally {
      await workerQueueCommandClient.unlink([key])
    }
  })
})

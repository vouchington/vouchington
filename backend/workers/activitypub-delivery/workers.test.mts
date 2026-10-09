import { randomUUID } from 'node:crypto'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { activitypubDelivery } from '@queues/activitypub-delivery/queues'
import { activitypubDeliveryWorker } from './workers.mts'

describe('activitypubDeliveryWorker', () => {
  beforeEach(async () => {
    await activitypubDelivery.obliterate({ force: true })
  })

  afterAll(async () => {
    await activitypubDeliveryWorker.close()
  })

  it('rejects unknown jobs', async () => {
    await expect(
      activitypubDelivery.add(
        'missingJob',
        {},
        { attempts: 1, removeOnComplete: true, removeOnFail: true, priority: 10 },
      ),
    ).rejects.toThrow('ActivityPub delivery job missingJob not found')
  })

  it('runs a delivery job through its processor', async () => {
    const activityId = randomUUID()
    const result = Promise.withResolvers<unknown>()
    activitypubDeliveryWorker.on('completed', (job, value) => {
      if (job.data.activityId === activityId) result.resolve(value)
    })

    await activitypubDelivery.add(
      'deliverActivity',
      {
        activityId,
        activityType: 'Accept',
        sourceUserId: randomUUID(),
        inboxUrl: 'https://remote.example.test/inbox',
        followActivityId: randomUUID(),
        followActorUri: 'https://remote.example.test/actor',
      },
      { attempts: 1, removeOnComplete: true, removeOnFail: true, priority: 10 },
    )

    await expect(result.promise).resolves.toEqual({
      delivered: false,
      reason: 'federation-disabled',
    })
  })
})

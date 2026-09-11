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
})

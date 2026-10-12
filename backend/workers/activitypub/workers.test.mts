import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { activitypub } from '@queues/activitypub/queues'

let activitypubWorker: (typeof import('./workers.mts'))['activitypubWorker']

describe('activitypubWorker', () => {
  beforeAll(async () => {
    await activitypub.pause()
    try {
      ;({ activitypubWorker } = await import('./workers.mts'))
      await activitypub.obliterate({ force: true })
    } finally {
      await activitypub.resume()
    }
  })

  beforeEach(async () => {
    await activitypub.obliterate({ force: true })
  })

  afterAll(async () => {
    await activitypubWorker?.close()
  })

  it('rejects unknown jobs', async () => {
    await expect(
      activitypub.add(
        'missingJob',
        {},
        { attempts: 1, removeOnComplete: true, removeOnFail: true, priority: 10 },
      ),
    ).rejects.toThrow('Unknown ActivityPub inbox job: missingJob')
  })

  it('runs a delivery job through its processor', async () => {
    const activityId = randomUUID()
    const result = Promise.withResolvers<unknown>()
    activitypubWorker.on('completed', (job, value) => {
      if (job.data.activityId === activityId) result.resolve(value)
    })

    await activitypub.add(
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

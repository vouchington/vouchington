import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Job } from 'glide-mq'
import { QUEUE_NAME } from '@queues/activitypub-inbox/config'
import type { ActivityPubInboxDeliveryJob } from '@queues/activitypub-inbox/types'
import { getOrCreateQueue } from '../../../test-helpers/glide-mq-vitest-internals.mts'

const activityPubInboxQueue = getOrCreateQueue(QUEUE_NAME)
await activityPubInboxQueue.pause()
const { activitypubInboxWorker, isFinalActivityPubInboxAttempt, processActivityPubInboxJob } =
  await import('./workers.mts')
try {
  await activitypubInboxWorker.close()
} finally {
  await activityPubInboxQueue.resume()
}

const activityPubInboxWorkerClosed = activitypubInboxWorker.close(true)

describe('ActivityPub inbox worker attempt routing', () => {
  beforeAll(async () => {
    await activityPubInboxWorkerClosed
  })

  afterAll(async () => {
    await activitypubInboxWorker.close(true)
  })

  it('uses the attempts configured on the actual job', () => {
    const job = { attemptsMade: 1, opts: { attempts: 2 } } as Pick<Job, 'attemptsMade' | 'opts'>

    expect(isFinalActivityPubInboxAttempt(job)).toBe(true)
  })

  it('defaults a job without explicit attempts to one attempt', () => {
    const job = { attemptsMade: 0, opts: {} } as Pick<Job, 'attemptsMade' | 'opts'>

    expect(isFinalActivityPubInboxAttempt(job)).toBe(true)
  })

  it('routes every supported job to its processor', async () => {
    const processDelivery = vi.fn<VitestLooseMock>().mockResolvedValue(undefined)
    const recoverDeliveries = vi.fn<VitestLooseMock>().mockResolvedValue({ enqueued: 0 })
    const rearmFailedDeliveries = vi.fn<VitestLooseMock>().mockResolvedValue({ enqueued: 0 })
    const cleanupExpiredDeliveries = vi.fn<VitestLooseMock>().mockResolvedValue({ deleted: 0 })
    const processors = {
      processDelivery,
      recoverDeliveries,
      rearmFailedDeliveries,
      cleanupExpiredDeliveries,
    }
    const data = { deliveryId: randomUUID(), processingAttemptId: randomUUID() }

    await processActivityPubInboxJob(makeJob('processDelivery', data, 1, 2), processors)
    await processActivityPubInboxJob(makeJob('recoverDeliveries', data), processors)
    await processActivityPubInboxJob(makeJob('rearmFailedDeliveries', data), processors)
    await processActivityPubInboxJob(makeJob('cleanupExpiredDeliveries', data), processors)

    expect(processDelivery).toHaveBeenCalledWith(data, { isFinalAttempt: true })
    expect(recoverDeliveries).toHaveBeenCalledWith()
    expect(rearmFailedDeliveries).toHaveBeenCalledWith()
    expect(cleanupExpiredDeliveries).toHaveBeenCalledWith()
  })

  it('rejects unknown jobs before invoking a processor', () => {
    const data = { deliveryId: randomUUID(), processingAttemptId: randomUUID() }

    expect(() => processActivityPubInboxJob(makeJob('unknown', data))).toThrow(
      'Unknown ActivityPub inbox job: unknown',
    )
  })
})

function makeJob(
  name: string,
  data: ActivityPubInboxDeliveryJob,
  attemptsMade = 0,
  attempts = 1,
): Job<ActivityPubInboxDeliveryJob> {
  return { name, data, attemptsMade, opts: { attempts } } as Job<ActivityPubInboxDeliveryJob>
}

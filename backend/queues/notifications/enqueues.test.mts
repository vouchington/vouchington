import { describe, expect, it } from 'vitest'
import {
  enqueueApplyMediaDeliveryRegistryRecord,
  enqueueCheckCopyrightReviewTarget,
  enqueueReconcileCopyrightActionIntents,
  enqueueSweepCopyrightEvidenceRetention,
} from './enqueues.mts'
import { notifications } from './queues.mts'
import { readAllQueueJobs } from '@voucha/test-helpers'

describe('copyright and media-delivery notification enqueue wiring', () => {
  it('throttles action-intent reconciliation to one five-minute schedule', async () => {
    await enqueueReconcileCopyrightActionIntents()
    const job = (await readAllQueueJobs(notifications)).find(
      candidate => candidate.name === 'processReconcileCopyrightActionIntents',
    )
    expect(job?.data).toEqual({})
    expect(job?.opts).toMatchObject({
      deduplication: {
        id: 'copyright-action-reconciliation',
        mode: 'throttle',
      },
    })
  })

  it('throttles the copyright review-target sweep to one five-minute schedule', async () => {
    await enqueueCheckCopyrightReviewTarget()
    const job = (await readAllQueueJobs(notifications)).find(
      candidate => candidate.name === 'processCheckCopyrightReviewTarget',
    )
    expect(job?.data).toEqual({})
    expect(job?.opts).toMatchObject({
      deduplication: {
        id: 'copyright-review-target-page',
        mode: 'throttle',
      },
    })
  })

  it('throttles the copyright evidence retention sweep to one schedule', async () => {
    await enqueueSweepCopyrightEvidenceRetention()
    const job = (await readAllQueueJobs(notifications)).find(
      candidate => candidate.name === 'processSweepCopyrightEvidenceRetention',
    )
    expect(job?.data).toEqual({})
    expect(job?.opts).toMatchObject({
      deduplication: {
        id: 'copyright-evidence-retention',
        mode: 'throttle',
      },
    })
  })

  it('deduplicates one registry projection per delivery key', async () => {
    const deliveryKey = `image-placement:${crypto.randomUUID()}:0:${crypto.randomUUID()}`
    await enqueueApplyMediaDeliveryRegistryRecord(deliveryKey)
    const job = (await readAllQueueJobs(notifications)).find(
      candidate =>
        candidate.name === 'processApplyMediaDeliveryRegistryRecord' &&
        (candidate.data as { deliveryKey?: string }).deliveryKey === deliveryKey,
    )
    expect(job?.data).toEqual({ deliveryKey })
    expect(job?.opts).toMatchObject({
      deduplication: {
        id: `media-delivery-registry:${deliveryKey}`,
        mode: 'throttle',
      },
    })
  })
})

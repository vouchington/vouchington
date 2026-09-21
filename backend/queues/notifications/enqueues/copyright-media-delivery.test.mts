import { describe, expect, it } from 'vitest'
import {
  enqueueApplyMediaDeliveryRegistryRecord,
  enqueueReconcileCopyrightActionIntents,
} from '../enqueues.mts'
import { notifications } from '../queues.mts'

describe('copyright and media-delivery notification enqueue wiring', () => {
  it('throttles action-intent reconciliation to one five-minute schedule', async () => {
    await enqueueReconcileCopyrightActionIntents()
    const job = (await notifications.getJobs('waiting')).find(
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

  it('deduplicates one registry projection per delivery key', async () => {
    const deliveryKey = `legacy-image:${crypto.randomUUID()}`
    await enqueueApplyMediaDeliveryRegistryRecord(deliveryKey)
    const job = (await notifications.getJobs('waiting')).find(
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

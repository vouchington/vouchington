import { randomUUID } from 'node:crypto'
import type { Job } from 'glide-mq'
import { describe, expect, it, onTestFinished } from 'vitest'
import {
  ACTIVITYPUB_PROCESS_DELIVERY_JOB,
  ACTIVITYPUB_REARM_FAILED_DELIVERIES_JOB,
  ACTIVITYPUB_RECOVER_DELIVERIES_JOB,
} from '@queues/background/enqueues/activitypub-jobs'
import { activitypubHandlers } from './workers.mts'

import { createActivityPubInboxEnvelope } from '@voucha/test-helpers/activitypub-inbox-contract-fixtures'
import {
  acceptTestDelivery,
  registerActivityPubInboxAdmission,
} from '@voucha/test-helpers/activitypub-inbox-transitions'
import { apInboxActivitiesWorkConfig } from '@services/ap-inbox-activities/work-limits'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { uuidBefore } from '@voucha/test-helpers/uuid-before'
import { background } from '@queues/background/queues'

registerActivityPubInboxAdmission()

function handlerFor(name: string) {
  return activitypubHandlers.find(handler => handler.job.name === name)!
}

describe('ActivityPub background handlers', () => {
  it('treats a missing delivery as an idempotent no-op on any attempt', async () => {
    const job = {
      data: { deliveryId: randomUUID(), requestDigest: randomUUID() },
      attemptsMade: 4,
      opts: { attempts: 5 },
    } as unknown as Job

    await expect(
      handlerFor(ACTIVITYPUB_PROCESS_DELIVERY_JOB.name).handle(job),
    ).resolves.toBeUndefined()
  })

  it('recovers an owned full page through the registered handler and continues from its cursor', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(apInboxActivitiesWorkConfig, {
        delivery_transition_recovery_batch_size: 1,
      }),
    )
    const delivery = await acceptTestDelivery(createActivityPubInboxEnvelope())
    const continuationId = `activitypub-inbox-recovery__${delivery.deliveryId}`
    onTestFinished(async () => {
      await (await background.getJob(`activitypub-inbox__${delivery.requestDigest}`))?.remove()
      await (await background.getJob(continuationId))?.remove()
    })
    const job = { data: { afterId: uuidBefore(delivery.deliveryId) } } as unknown as Job
    await expect(handlerFor(ACTIVITYPUB_RECOVER_DELIVERIES_JOB.name).handle(job)).resolves.toEqual({
      enqueued: 1,
      hasMore: true,
    })
    expect((await background.getJob(continuationId))?.data).toEqual({
      afterId: delivery.deliveryId,
    })
  })

  it('re-arms the page after the cursor carried by the job', async () => {
    const job = { data: { afterId: 'ffffffff-ffff-ffff-ffff-ffffffffffff' } } as unknown as Job

    await expect(
      handlerFor(ACTIVITYPUB_REARM_FAILED_DELIVERIES_JOB.name).handle(job),
    ).resolves.toEqual({ enqueued: 0, hasMore: false })
  })
})

import { randomUUID } from 'node:crypto'
import { describe, expect, it, onTestFinished } from 'vitest'
import { activitypubInbox } from '@queues/activitypub-inbox/queues'
import {
  claimTestDelivery,
  rejectTestDelivery,
} from '@services/ap-inbox-activities/durable-delivery-transitions.test-support'
import {
  recordActivityPubInboxSenderDelivery,
  recordActivityPubInboxSenderDeliveryOnce,
  routeRateLimitConfig,
} from '@services/route-rate-limits'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { readAllQueueJobs } from '@voucha/test-helpers'
import { processDelivery } from '../processors.mts'
import { createApprovedRemoteActor, createSignedDelivery } from '../test-support.mts'

describe('ActivityPub inbox processor sender rate limit', () => {
  it('delays a valid signed delivery when the sender allowance races to exhausted', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(routeRateLimitConfig, {
        activitypub_inbox_max_requests: 1,
        activitypub_inbox_window_seconds: 60,
      }),
    )
    const actor = await createApprovedRemoteActor()
    expect(await recordActivityPubInboxSenderDelivery(actor.hostname)).toBe(false)
    const delivery = await createSignedDelivery(actor)

    await processDelivery(delivery, { isFinalAttempt: false })

    expect(await claimTestDelivery(delivery.deliveryId, delivery.processingAttemptId)).toBeNull()
    const jobs = await readAllQueueJobs(activitypubInbox)
    expect(
      jobs.some(
        job =>
          job.name === 'processDelivery' &&
          (job.data as { deliveryId?: string }).deliveryId === delivery.deliveryId,
      ),
    ).toBe(true)
  })

  it('charges a durable delivery only once when a worker retries after the charge', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(routeRateLimitConfig, {
        activitypub_inbox_max_requests: 2,
        activitypub_inbox_window_seconds: 60,
      }),
    )
    const actor = await createApprovedRemoteActor()
    const delivery = await createSignedDelivery(actor)
    onTestFinished(async () => {
      await rejectTestDelivery(delivery.deliveryId, delivery.processingAttemptId)
    })

    expect(
      await recordActivityPubInboxSenderDeliveryOnce(actor.hostname, delivery.deliveryId),
    ).toBe(false)

    await processDelivery(delivery, { isFinalAttempt: false })

    expect(await recordActivityPubInboxSenderDeliveryOnce(actor.hostname, randomUUID())).toBe(false)
    expect(await recordActivityPubInboxSenderDeliveryOnce(actor.hostname, randomUUID())).toBe(true)
  })
})

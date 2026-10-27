import { ACTIVITYPUB_PROCESS_DELIVERY_JOB } from '@queues/background/enqueues/activitypub-jobs'
import { activitypubHandlers } from '../workers.mts'
import { DelayedError, type Job } from 'glide-mq'
import { randomUUID } from 'node:crypto'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import {
  loadTestDelivery,
  registerActivityPubInboxAdmission,
  rejectTestDelivery,
} from '@voucha/test-helpers/activitypub-inbox-transitions'
import {
  recordActivityPubInboxSenderDelivery,
  recordActivityPubInboxSenderDeliveryOnce,
  routeRateLimitConfig,
} from '@services/route-rate-limits'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { processDelivery } from '../processors/inbox.mts'
import {
  createApprovedRemoteActor,
  createSignedDelivery,
} from '@voucha/test-helpers/activitypub-inbox-signed-delivery'

registerActivityPubInboxAdmission()

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

    const moveToDelayed = vi
      .fn<(timestamp: number) => Promise<never>>()
      .mockImplementation(async timestamp => {
        throw new DelayedError(timestamp)
      })
    const handler = activitypubHandlers.find(
      entry => entry.job.name === ACTIVITYPUB_PROCESS_DELIVERY_JOB.name,
    )!
    await expect(
      handler.handle({
        data: delivery,
        attemptsMade: 0,
        opts: { attempts: 5 },
        moveToDelayed,
      } as unknown as Job),
    ).rejects.toBeInstanceOf(DelayedError)
    expect(moveToDelayed).toHaveBeenCalledOnce()
    expect(await loadTestDelivery(delivery.deliveryId)).toMatchObject({ senderAllowedAt: null })
    onTestFinished(async () => {
      await rejectTestDelivery(delivery.deliveryId)
    })
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
      await rejectTestDelivery(delivery.deliveryId)
    })

    expect(
      await recordActivityPubInboxSenderDeliveryOnce(actor.hostname, delivery.deliveryId),
    ).toBe(false)

    await processDelivery(delivery, {
      isFinalAttempt: false,
      moveToDelayed: async () => {
        throw new Error('Unexpected deferral')
      },
    })

    expect(await recordActivityPubInboxSenderDeliveryOnce(actor.hostname, randomUUID())).toBe(false)
    expect(await recordActivityPubInboxSenderDeliveryOnce(actor.hostname, randomUUID())).toBe(true)
  })
})

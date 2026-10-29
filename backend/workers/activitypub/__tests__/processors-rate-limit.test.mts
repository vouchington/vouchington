import { randomUUID } from 'node:crypto'
import { DelayedError, type Job } from 'glide-mq'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { ACTIVITYPUB_PROCESS_DELIVERY_JOB } from '@queues/background/enqueues/activitypub-jobs'
import type { ActivityPubInboxDeliveryJob } from '@queues/activitypub/types'
import {
  recordActivityPubInboxSenderDelivery,
  recordActivityPubInboxSenderDeliveryOnce,
  routeRateLimitConfig,
} from '@services/route-rate-limits'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import {
  createApprovedRemoteActor,
  createSignedDelivery,
} from '@voucha/test-helpers/activitypub-inbox-signed-delivery'
import { processDelivery } from '../processors/inbox.mts'
import { activitypubHandlers } from '../workers.mts'

describe('ActivityPub inbox processor sender rate limit', () => {
  it('delays a valid signed envelope when the sender allowance races to exhausted', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(routeRateLimitConfig, {
        activitypub_inbox_max_requests: 1,
        activitypub_inbox_window_seconds: 60,
      }),
    )
    const actor = await createApprovedRemoteActor()
    expect(await recordActivityPubInboxSenderDelivery(actor.hostname)).toBe(false)
    const delivery = await createSignedDelivery(actor)
    const updateData = vi.fn<(data: ActivityPubInboxDeliveryJob) => Promise<void>>(
      async () => undefined,
    )
    const moveToDelayed = vi
      .fn<(timestamp: number) => Promise<never>>()
      .mockImplementation(async timestamp => {
        throw new DelayedError(timestamp)
      })
    const handler = activitypubHandlers.find(
      entry => entry.job.name === ACTIVITYPUB_PROCESS_DELIVERY_JOB.name,
    )!

    await expect(
      handler.handle({ data: delivery, moveToDelayed, updateData } as unknown as Job),
    ).rejects.toBeInstanceOf(DelayedError)
    expect(moveToDelayed).toHaveBeenCalledOnce()
    expect(updateData).toHaveBeenCalledWith(
      expect.objectContaining({ verifiedRemoteActorId: actor.remoteActorId }),
    )
    expect(updateData).not.toHaveBeenCalledWith(expect.objectContaining({ senderAllowed: true }))
  })

  it('charges a signed request only once when a worker retries after the charge', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(routeRateLimitConfig, {
        activitypub_inbox_max_requests: 2,
        activitypub_inbox_window_seconds: 60,
      }),
    )
    const actor = await createApprovedRemoteActor()
    const delivery = await createSignedDelivery(actor)
    expect(
      await recordActivityPubInboxSenderDeliveryOnce(actor.hostname, delivery.requestDigest),
    ).toBe(false)

    await processDelivery(delivery, {
      moveToDelayed: async () => {
        throw new Error('Unexpected deferral')
      },
      updateData: async () => undefined,
    })

    expect(await recordActivityPubInboxSenderDeliveryOnce(actor.hostname, randomUUID())).toBe(false)
    expect(await recordActivityPubInboxSenderDeliveryOnce(actor.hostname, randomUUID())).toBe(true)
  })
})

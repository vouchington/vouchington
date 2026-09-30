import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { activityPubInboxDeliveryTransitions } from './durable-delivery-transitions.mts'
import type { ActivityPubInboxEnvelope } from './durable-delivery-transition-contract.mts'
import {
  acceptTestDelivery,
  claimTestDelivery,
  exhaustTestDelivery,
  rejectTestDelivery,
} from '@voucha/test-helpers/services/ap-inbox-activities/durable-delivery-transitions.test-support'

function makeEnvelope(): ActivityPubInboxEnvelope {
  const suffix = randomUUID()
  const actor = `https://${suffix}.example/users/alice`
  return {
    requestMethod: 'POST',
    requestTarget: `/ap/inbox?delivery=${suffix}`,
    expectedHost: 'voucha.example',
    signatureHeader: `keyId="${actor}#main-key",headers="(request-target) host date digest",signature="bytes"`,
    digestHeader: 'SHA-256=exact-digest',
    dateHeader: 'Thu, 01 Jan 2026 00:00:00 GMT',
    contentTypeHeader: 'application/activity+json',
    rawBody: Buffer.from([0, 1, 2, 255]),
    claimedActivityId: `${actor}/activities/${suffix}`,
    claimedActivityType: 'Create',
    claimedActorUri: actor,
    senderHostname: `${suffix}.example`,
  }
}

describe('ActivityPub rearm scope', () => {
  it('re-arms only an owned failed delivery while another eligible failure keeps its token', async () => {
    const [selected, unrelated] = await Promise.all([
      acceptTestDelivery(makeEnvelope()),
      acceptTestDelivery(makeEnvelope()),
    ])
    await Promise.all(
      [selected, unrelated].map(delivery =>
        claimTestDelivery(delivery.deliveryId, delivery.processingAttemptId),
      ),
    )
    await Promise.all(
      [selected, unrelated].map(delivery =>
        exhaustTestDelivery(
          delivery.deliveryId,
          delivery.processingAttemptId,
          new Error('provider outage'),
        ),
      ),
    )

    const rearmed = await activityPubInboxDeliveryTransitions.rearm([selected.deliveryId])
    expect(rearmed.map(delivery => delivery.deliveryId)).toEqual([selected.deliveryId])
    expect(rearmed[0]?.processingAttemptId).not.toBe(selected.processingAttemptId)
    expect(await claimTestDelivery(unrelated.deliveryId, unrelated.processingAttemptId)).toBeNull()
    const unrelatedRearmed = await activityPubInboxDeliveryTransitions.rearm([unrelated.deliveryId])
    expect(unrelatedRearmed.map(delivery => delivery.deliveryId)).toEqual([unrelated.deliveryId])
    await Promise.all([
      rejectTestDelivery(selected.deliveryId, rearmed[0]!.processingAttemptId),
      rejectTestDelivery(unrelated.deliveryId, unrelatedRearmed[0]!.processingAttemptId),
    ])
  })
})

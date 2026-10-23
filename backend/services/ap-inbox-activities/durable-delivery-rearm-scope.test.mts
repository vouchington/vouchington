import { describe, expect, it } from 'vitest'
import { createActivityPubInboxEnvelope } from '@voucha/test-helpers/activitypub-inbox-contract-fixtures'
import { activityPubInboxDeliveryTransitions } from './durable-delivery-transitions.mts'
import {
  registerActivityPubInboxAdmission,
  acceptTestDelivery,
  claimTestDelivery,
  exhaustTestDelivery,
  rejectTestDelivery,
} from '@voucha/test-helpers/activitypub-inbox-transitions'

registerActivityPubInboxAdmission()

describe('ActivityPub rearm scope', () => {
  it('re-arms only an owned failed delivery while another eligible failure keeps its token', async () => {
    const [selected, unrelated] = await Promise.all([
      acceptTestDelivery(createActivityPubInboxEnvelope()),
      acceptTestDelivery(createActivityPubInboxEnvelope()),
    ])
    await Promise.all(
      [selected, unrelated].map(delivery =>
        claimTestDelivery(delivery.deliveryId, delivery.leaseToken),
      ),
    )
    await Promise.all(
      [selected, unrelated].map(delivery =>
        exhaustTestDelivery(delivery.deliveryId, delivery.leaseToken, new Error('provider outage')),
      ),
    )

    const rearmed = await activityPubInboxDeliveryTransitions.rearm([selected.deliveryId])
    expect(rearmed.map(delivery => delivery.deliveryId)).toEqual([selected.deliveryId])
    expect(rearmed[0]?.leaseToken).not.toBe(selected.leaseToken)
    expect(await claimTestDelivery(unrelated.deliveryId, unrelated.leaseToken)).toBeNull()
    const unrelatedRearmed = await activityPubInboxDeliveryTransitions.rearm([unrelated.deliveryId])
    expect(unrelatedRearmed.map(delivery => delivery.deliveryId)).toEqual([unrelated.deliveryId])
    await Promise.all([
      rejectTestDelivery(selected.deliveryId, rearmed[0]!.leaseToken),
      rejectTestDelivery(unrelated.deliveryId, unrelatedRearmed[0]!.leaseToken),
    ])
  })
})

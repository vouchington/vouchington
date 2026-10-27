import { describe, expect, it } from 'vitest'
import { createActivityPubInboxEnvelope } from '@voucha/test-helpers/activitypub-inbox-contract-fixtures'
import { activityPubInboxDeliveryTransitions } from './durable-delivery-transitions.mts'
import {
  registerActivityPubInboxAdmission,
  acceptTestDelivery,
  exhaustTestDelivery,
  rejectTestDelivery,
} from '@voucha/test-helpers/activitypub-inbox-transitions'

registerActivityPubInboxAdmission()

describe('ActivityPub rearm scope', () => {
  it('rearms only the selected failed delivery', async () => {
    const [selected, unrelated] = await Promise.all([
      acceptTestDelivery(createActivityPubInboxEnvelope()),
      acceptTestDelivery(createActivityPubInboxEnvelope()),
    ])
    await Promise.all(
      [selected, unrelated].map(delivery =>
        exhaustTestDelivery(delivery.deliveryId, new Error('provider outage')),
      ),
    )
    const rearmed = await activityPubInboxDeliveryTransitions.rearm([selected.deliveryId])
    expect(rearmed.map(delivery => delivery.deliveryId)).toEqual([selected.deliveryId])
    expect(await rejectTestDelivery(unrelated.deliveryId)).toBe(false)
    expect(await rejectTestDelivery(selected.deliveryId)).toBe(true)
    expect(
      (await activityPubInboxDeliveryTransitions.rearm([unrelated.deliveryId])).map(
        delivery => delivery.deliveryId,
      ),
    ).toEqual([unrelated.deliveryId])
    expect(await rejectTestDelivery(unrelated.deliveryId)).toBe(true)
  })
})

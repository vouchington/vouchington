import { describe, expect, it, onTestFinished } from 'vitest'
import { createActivityPubInboxEnvelope } from '@voucha/test-helpers/activitypub-inbox-contract-fixtures'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { uuidBefore } from '@voucha/test-helpers/uuid-before'
import {
  registerActivityPubInboxAdmission,
  acceptTestDelivery,
  exhaustTestDelivery,
  rejectTestDelivery,
} from '@voucha/test-helpers/activitypub-inbox-transitions'
import { activityPubInboxDeliveryTransitions } from './durable-delivery-transitions.mts'
import { apInboxActivitiesWorkConfig } from './work-limits.mts'

registerActivityPubInboxAdmission()

describe('ActivityPub rearm paging', () => {
  it('does not spend the recovery budget when queue admission fails', async () => {
    const delivery = await acceptTestDelivery(createActivityPubInboxEnvelope())
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const reserved = await activityPubInboxDeliveryTransitions.reserveRecoveryRequeues([
        delivery.deliveryId,
      ])
      expect(reserved.get(delivery.deliveryId)).toBe(1)
      await activityPubInboxDeliveryTransitions.releaseUnadmittedRecoveryRequeues([
        { deliveryId: delivery.deliveryId, count: 1 },
      ])
    }
    expect(await activityPubInboxDeliveryTransitions.load(delivery.deliveryId)).toMatchObject({
      outcome: 'applied',
    })
  })

  it('rearms failed deliveries one bounded page at a time', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(apInboxActivitiesWorkConfig, {
        delivery_transition_recovery_batch_size: 2,
      }),
    )
    const deliveries = await Promise.all(
      [1, 2, 3].map(() => acceptTestDelivery(createActivityPubInboxEnvelope())),
    )
    await Promise.all(
      deliveries.map(delivery => exhaustTestDelivery(delivery.deliveryId, new Error('offline'))),
    )
    const ids = deliveries.map(delivery => delivery.deliveryId).toSorted()
    const firstPage = await activityPubInboxDeliveryTransitions.rearm(ids, uuidBefore(ids[0]!))
    const firstIds = firstPage.map(delivery => delivery.deliveryId).toSorted()
    expect(firstIds).toEqual(ids.slice(0, 2))
    const secondPage = await activityPubInboxDeliveryTransitions.rearm(ids, firstIds.at(-1))
    expect(secondPage.map(delivery => delivery.deliveryId)).toEqual([ids[2]])
    await Promise.all(ids.map(id => rejectTestDelivery(id)))
  })
})

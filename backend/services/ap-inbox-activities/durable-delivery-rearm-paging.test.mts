import { describe, expect, it, onTestFinished } from 'vitest'
import { createActivityPubInboxEnvelope } from '@voucha/test-helpers/activitypub-inbox-contract-fixtures'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { uuidBefore } from '@voucha/test-helpers/uuid-before'
import {
  registerActivityPubInboxAdmission,
  acceptTestDelivery,
  claimTestDelivery,
  exhaustTestDelivery,
  rejectTestDelivery,
} from '@voucha/test-helpers/activitypub-inbox-transitions'
import { activityPubInboxDeliveryTransitions } from './durable-delivery-transitions.mts'
import { apInboxActivitiesWorkConfig } from './work-limits.mts'

registerActivityPubInboxAdmission()

describe('ActivityPub rearm paging', () => {
  it('re-arms failed deliveries a bounded page after a cursor, covering each exactly once', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(apInboxActivitiesWorkConfig, {
        delivery_transition_recovery_batch_size: 2,
      }),
    )
    const deliveries = await Promise.all(
      [1, 2, 3].map(() => acceptTestDelivery(createActivityPubInboxEnvelope())),
    )
    await Promise.all(
      deliveries.map(async delivery => {
        await claimTestDelivery(delivery.deliveryId, delivery.leaseToken)
        await exhaustTestDelivery(delivery.deliveryId, delivery.leaseToken, new Error('offline'))
      }),
    )
    // The database is shared, so the scope is this test's own rows; the keyset starts at the first.
    const ids = deliveries.map(delivery => delivery.deliveryId).toSorted()
    const firstPage = await activityPubInboxDeliveryTransitions.rearm(ids, uuidBefore(ids[0]!))
    const firstIds = firstPage.map(delivery => delivery.deliveryId).toSorted()
    expect(firstIds).toEqual(ids.slice(0, 2))

    const secondPage = await activityPubInboxDeliveryTransitions.rearm(ids, firstIds.at(-1))
    expect(secondPage.map(delivery => delivery.deliveryId)).toEqual([ids[2]])

    const rearmedTokens = new Map(
      [...firstPage, ...secondPage].map(delivery => [delivery.deliveryId, delivery.leaseToken]),
    )
    await Promise.all(ids.map(id => rejectTestDelivery(id, rearmedTokens.get(id)!)))
  })
})

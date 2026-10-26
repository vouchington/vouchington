import { describe, expect, it } from 'vitest'
import { createActivityPubInboxEnvelope } from '@voucha/test-helpers/activitypub-inbox-contract-fixtures'
import {
  acceptTestDelivery,
  registerActivityPubInboxAdmission,
} from '@voucha/test-helpers/activitypub-inbox-transitions'
import {
  ACTIVITYPUB_INBOX_DELIVERY_TRANSITION_CONTRACT,
  activityPubInboxDeliveryTransitions,
} from './durable-delivery-transitions.mts'

registerActivityPubInboxAdmission()

describe('ActivityPub inbox delivery transitions', () => {
  it('exposes one implementation for every declared transition', () => {
    expect(Object.keys(activityPubInboxDeliveryTransitions).toSorted()).toEqual(
      [
        'accept',
        'admitSender',
        'complete',
        'exhaust',
        'expire',
        'load',
        'rearm',
        'recover',
        'reject',
        'verify',
      ].toSorted(),
    )
    expect(Object.keys(ACTIVITYPUB_INBOX_DELIVERY_TRANSITION_CONTRACT).toSorted()).toEqual(
      [
        'accept',
        'admitSender',
        'complete',
        'exhaust',
        'expire',
        'load',
        'rearm',
        'recover',
        'reject',
        'verify',
      ].toSorted(),
    )
  })

  it('marks an exhausted delivery failed until rearmed', async () => {
    const delivery = await acceptTestDelivery(createActivityPubInboxEnvelope())
    expect(
      await activityPubInboxDeliveryTransitions.exhaust(delivery.deliveryId, new Error('offline')),
    ).toMatchObject({ outcome: 'applied' })
    expect(await activityPubInboxDeliveryTransitions.reject(delivery.deliveryId)).toEqual({
      outcome: 'stale',
    })
    const rearmed = await activityPubInboxDeliveryTransitions.rearm([delivery.deliveryId])
    expect(rearmed.map(candidate => candidate.deliveryId)).toEqual([delivery.deliveryId])
    expect(await activityPubInboxDeliveryTransitions.reject(delivery.deliveryId)).toMatchObject({
      outcome: 'applied',
    })
  })
})

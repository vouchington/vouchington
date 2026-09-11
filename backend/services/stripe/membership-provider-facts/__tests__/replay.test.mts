import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import type Stripe from 'stripe'
import {
  createTestSku,
  createTestUser,
  getTestMembershipSourceState,
  setStripeEventReceivedAtForTest,
} from '@voucha/test-helpers'
import { createMembership } from '@services/memberships'
import { insertStripeEvent } from '../../events.mts'
import { recordStripeMembershipProviderFacts } from '../../membership-provider-facts.mts'

describe('Stripe membership provider evidence replay', () => {
  it('does not derive a later snapshot from evidence stored for a stale Stripe event retry', async () => {
    const applicationId = `test-membership-provider-facts-replay-${randomUUID()}`
    const user = await createTestUser()
    const sku = await createTestSku({ plan: 'plus', provider_application_id: applicationId })
    const subscriptionId = `sub_stale_replay_${randomUUID()}`
    const membership = await createMembership({
      userId: user.id,
      plan: 'plus',
      skuId: sku.id,
      stripeSubscriptionId: subscriptionId,
      stripeCustomerId: `cus_stale_replay_${randomUUID()}`,
      providerApplicationId: applicationId,
    })
    const acceptedEvent = makeStripeEvent(`evt_accepted_${randomUUID()}`, subscriptionId, 200)
    const staleEvent = makeStripeEvent(`evt_stale_${randomUUID()}`, subscriptionId, 100)
    await Promise.all([insertStripeEvent(acceptedEvent), insertStripeEvent(staleEvent)])
    await setStripeEventReceivedAtForTest(acceptedEvent.id, new Date('2030-01-01T00:00:01.000Z'))
    await setStripeEventReceivedAtForTest(staleEvent.id, new Date('2030-01-01T00:00:00.000Z'))
    const observedAt = new Date('2030-01-01T00:00:02.000Z')
    const activeSubscription = makeSubscription(subscriptionId, sku.stripe_price_id, 'active')
    await recordStripeMembershipProviderFacts({
      stripeEventId: acceptedEvent.id,
      membershipId: membership.id,
      subscription: activeSubscription,
      observedAt,
    })

    const storedStaleEvidence = await recordStripeMembershipProviderFacts({
      stripeEventId: staleEvent.id,
      membershipId: membership.id,
      subscription: activeSubscription,
      observedAt,
    })
    expect(storedStaleEvidence).toMatchObject({
      evidenceId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      observationId: null,
    })

    await expect(
      recordStripeMembershipProviderFacts({
        stripeEventId: staleEvent.id,
        membershipId: membership.id,
        subscription: makeSubscription(subscriptionId, sku.stripe_price_id, 'canceled'),
        observedAt: new Date('2030-01-01T00:00:03.000Z'),
      }),
    ).resolves.toEqual(storedStaleEvidence)
    await expect(getTestMembershipSourceState(membership.id)).resolves.toMatchObject({
      membership_provider_observation_id: expect.any(String),
      cancelled_at: null,
    })
  })
})

function makeStripeEvent(id: string, subscriptionId: string, created: number): Stripe.Event {
  return {
    id,
    object: 'event',
    api_version: '2025-09-30.clover',
    created,
    data: { object: { id: subscriptionId, object: 'subscription' } },
    livemode: true,
    pending_webhooks: 1,
    request: null,
    type: 'customer.subscription.updated',
  } as Stripe.Event
}

function makeSubscription(
  id: string,
  priceId: string,
  status: 'active' | 'canceled',
): Stripe.Response<Stripe.Subscription> {
  return {
    id,
    object: 'subscription',
    livemode: true,
    status,
    cancel_at_period_end: false,
    items: { data: [{ price: { id: priceId, unit_amount: 500, currency: 'usd' } }] },
    current_period_start: 1_741_398_400,
    current_period_end: 1_744_076_800,
    ...(status === 'canceled' ? { canceled_at: 1_741_398_500 } : {}),
  } as unknown as Stripe.Response<Stripe.Subscription>
}

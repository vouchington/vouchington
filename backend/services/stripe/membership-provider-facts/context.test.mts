import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import type Stripe from 'stripe'
import { createTestSku, createTestUser } from '@voucha/test-helpers'
import { createMembership, grantMembership } from '@services/memberships'
import { insertStripeEvent } from '../events.mts'
import { recordStripeMembershipProviderFacts } from '../membership-provider-facts.mts'
import {
  MissingStripeMembershipFactContextError,
  StripeMembershipEventNotIngestedError,
} from './context.mts'

describe('Stripe membership provider fact context', () => {
  it('requires an ingested event and a Stripe direct-source context before accepting evidence', async () => {
    const admin = await createTestUser({ administrator: true })
    const user = await createTestUser()
    const sku = await createTestSku({ plan: 'plus' })
    const membership = await grantMembership(admin.id, user.id, 'plus', sku.id, 30)
    const subscriptionId = `sub_missing_context_${randomUUID()}`
    const subscription = makeSubscription(subscriptionId, `price_${randomUUID()}`, true)

    await expect(
      recordStripeMembershipProviderFacts({
        stripeEventId: `evt_missing_receipt_${randomUUID()}`,
        membershipId: membership.id,
        subscription,
      }),
    ).rejects.toBeInstanceOf(StripeMembershipEventNotIngestedError)

    const event = makeStripeEvent(`evt_missing_context_${randomUUID()}`, subscriptionId, true)
    await insertStripeEvent(event)
    await expect(
      recordStripeMembershipProviderFacts({
        stripeEventId: event.id,
        membershipId: membership.id,
        subscription,
      }),
    ).rejects.toBeInstanceOf(MissingStripeMembershipFactContextError)
  })

  it('rejects source-environment and customer identity conflicts before writing evidence', async () => {
    const testUser = await createTestUser()
    const testScenarioApplicationId = `test-provider-facts-context-${randomUUID()}`
    const testSku = await createTestSku({
      plan: 'plus',
      provider_application_id: testScenarioApplicationId,
      provider_environment: 'test',
    })
    const sourceSubscriptionId = `sub_environment_conflict_${randomUUID()}`
    const sourceCustomerId = `cus_source_${randomUUID()}`
    const environmentEvent = makeStripeEvent(
      `evt_environment_conflict_${randomUUID()}`,
      sourceSubscriptionId,
      true,
    )
    await insertStripeEvent(environmentEvent)
    const testMembership = await createMembership({
      userId: testUser.id,
      plan: 'plus',
      skuId: testSku.id,
      stripeSubscriptionId: sourceSubscriptionId,
      stripeCustomerId: sourceCustomerId,
      providerEnvironment: 'test',
      providerApplicationId: testScenarioApplicationId,
    })
    await expect(
      recordStripeMembershipProviderFacts({
        stripeEventId: environmentEvent.id,
        membershipId: testMembership.id,
        subscription: makeSubscription(sourceSubscriptionId, testSku.stripe_price_id, true),
      }),
    ).rejects.toThrow('membership source')

    const productionUser = await createTestUser()
    const productionScenarioApplicationId = `test-provider-facts-context-${randomUUID()}`
    const productionSku = await createTestSku({
      plan: 'plus',
      provider_application_id: productionScenarioApplicationId,
    })
    const customerSubscriptionId = `sub_customer_conflict_${randomUUID()}`
    const customerEvent = makeStripeEvent(
      `evt_customer_conflict_${randomUUID()}`,
      customerSubscriptionId,
      true,
    )
    await insertStripeEvent(customerEvent)
    const productionMembership = await createMembership({
      userId: productionUser.id,
      plan: 'plus',
      skuId: productionSku.id,
      stripeSubscriptionId: customerSubscriptionId,
      stripeCustomerId: `cus_expected_${randomUUID()}`,
      providerApplicationId: productionScenarioApplicationId,
    })
    await expect(
      recordStripeMembershipProviderFacts({
        stripeEventId: customerEvent.id,
        membershipId: productionMembership.id,
        subscription: makeSubscription(
          customerSubscriptionId,
          productionSku.stripe_price_id,
          true,
          `cus_wrong_${randomUUID()}`,
        ),
      }),
    ).rejects.toThrow('customer does not match')
  })
})

function makeStripeEvent(id: string, subscriptionId: string, livemode: boolean): Stripe.Event {
  return {
    id,
    object: 'event',
    api_version: '2025-09-30.clover',
    created: 1_741_398_400,
    data: { object: { id: subscriptionId, object: 'subscription' } },
    livemode,
    pending_webhooks: 1,
    request: null,
    type: 'customer.subscription.updated',
  } as Stripe.Event
}

function makeSubscription(
  id: string,
  priceId: string,
  livemode: boolean,
  customer?: string,
): Stripe.Response<Stripe.Subscription> {
  return {
    id,
    object: 'subscription',
    livemode,
    status: 'active',
    cancel_at_period_end: false,
    items: { data: [{ price: { id: priceId, unit_amount: 1_000, currency: 'usd' } }] },
    current_period_start: 1_741_398_400,
    current_period_end: 1_744_076_800,
    ...(customer ? { customer } : {}),
  } as unknown as Stripe.Response<Stripe.Subscription>
}

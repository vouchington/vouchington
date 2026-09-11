import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import type Stripe from 'stripe'
import {
  createTestSku,
  createTestUser,
  getTestMembershipRaw,
  getTestMembershipProviderObservation,
  getTestMembershipSourceState,
} from '@voucha/test-helpers'
import { createMembership } from '@services/memberships'
import { insertStripeEvent } from '../events.mts'
import { recordStripeMembershipProviderFacts } from '../membership-provider-facts.mts'

const mocks = vi.hoisted(() => ({
  getStripeSubscription: vi.fn<(id: string) => Promise<Stripe.Response<Stripe.Subscription>>>(),
}))

vi.mock<typeof import('@modules/stripe/subscriptions')>(
  import('@modules/stripe/subscriptions'),
  async importOriginal => ({
    ...(await importOriginal<typeof import('@modules/stripe/subscriptions')>()),
    getStripeSubscription: mocks.getStripeSubscription,
  }),
)

describe('Stripe membership provider fact snapshots', () => {
  it('rejects an authoritative subscription without a fixed recurring price', async () => {
    const applicationId = `test-membership-provider-facts-snapshot-${randomUUID()}`
    const user = await createTestUser()
    const sku = await createTestSku({ plan: 'plus', provider_application_id: applicationId })
    const subscriptionId = `sub_missing_price_${randomUUID()}`
    const event = makeStripeEvent(`evt_missing_price_${randomUUID()}`, subscriptionId, true)
    await insertStripeEvent(event)
    const membership = await createMembership({
      userId: user.id,
      plan: 'plus',
      skuId: sku.id,
      stripeSubscriptionId: subscriptionId,
      stripeCustomerId: `cus_missing_price_${randomUUID()}`,
      providerApplicationId: applicationId,
    })
    const subscription = makeSubscription(subscriptionId, sku.stripe_price_id, 500, 'usd', true)
    subscription.items.data = []

    await expect(
      recordStripeMembershipProviderFacts({
        stripeEventId: event.id,
        membershipId: membership.id,
        subscription,
      }),
    ).rejects.toThrow('missing a fixed recurring price')
  })

  it('uses provider lifecycle clocks for scheduled cancellation, start, and past-due state', async () => {
    const applicationId = `test-membership-provider-facts-snapshot-${randomUUID()}`
    const user = await createTestUser()
    const sku = await createTestSku({ plan: 'plus', provider_application_id: applicationId })
    const subscriptionId = `sub_provider_lifecycle_${randomUUID()}`
    const event = makeStripeEvent(
      `evt_provider_lifecycle_${randomUUID()}`,
      subscriptionId,
      true,
      300,
    )
    await insertStripeEvent(event)
    const membership = await createMembership({
      userId: user.id,
      plan: 'plus',
      skuId: sku.id,
      stripeSubscriptionId: subscriptionId,
      stripeCustomerId: `cus_provider_lifecycle_${randomUUID()}`,
      providerApplicationId: applicationId,
    })
    const scheduled = makeSubscription(subscriptionId, sku.stripe_price_id, 500, 'usd', true)
    Object.assign(scheduled, {
      cancel_at_period_end: true,
      cancel_at: 1_800_000_000,
      start_date: 1_700_000_000,
    })
    await recordStripeMembershipProviderFacts({
      stripeEventId: event.id,
      membershipId: membership.id,
      subscription: scheduled,
    })
    await expect(getTestMembershipSourceState(membership.id)).resolves.toMatchObject({
      auto_renews: false,
      cancelled_at: null,
      effective_at: new Date(1_700_000_000_000),
    })
  })

  it('preserves durable past-due timing and clears it on a later active provider snapshot', async () => {
    const applicationId = `test-membership-provider-facts-snapshot-${randomUUID()}`
    const user = await createTestUser()
    const sku = await createTestSku({ plan: 'plus', provider_application_id: applicationId })
    const subscriptionId = `sub_provider_past_due_${randomUUID()}`
    const pastDueEvent = makeStripeEvent(
      `evt_provider_past_due_${randomUUID()}`,
      subscriptionId,
      true,
      400,
    )
    const activeEvent = makeStripeEvent(
      `evt_provider_recovered_${randomUUID()}`,
      subscriptionId,
      true,
      500,
    )
    await Promise.all([pastDueEvent, activeEvent].map(insertStripeEvent))
    const membership = await createMembership({
      userId: user.id,
      plan: 'plus',
      skuId: sku.id,
      stripeSubscriptionId: subscriptionId,
      stripeCustomerId: `cus_provider_past_due_${randomUUID()}`,
      providerApplicationId: applicationId,
      effectiveAt: new Date('2025-01-01T00:00:00.000Z'),
      observedAt: new Date('2025-02-01T00:00:00.000Z'),
      status: 'past_due',
    })
    const pastDue = makeSubscription(
      subscriptionId,
      sku.stripe_price_id,
      500,
      'usd',
      true,
      'past_due',
    )
    Object.assign(pastDue, { start_date: 1_700_000_000 })
    await recordStripeMembershipProviderFacts({
      stripeEventId: pastDueEvent.id,
      membershipId: membership.id,
      subscription: pastDue,
    })
    const pastDueState = await getTestMembershipSourceState(membership.id)
    expect(pastDueState!.past_due_at).toBeInstanceOf(Date)
    expect(pastDueState!.past_due_at).toEqual(new Date('2025-02-01T00:00:00.000Z'))

    const active = makeSubscription(subscriptionId, sku.stripe_price_id, 500, 'usd', true)
    Object.assign(active, { start_date: 1_700_000_000 })
    await recordStripeMembershipProviderFacts({
      stripeEventId: activeEvent.id,
      membershipId: membership.id,
      subscription: active,
    })
    await expect(getTestMembershipSourceState(membership.id)).resolves.toMatchObject({
      cancelled_at: null,
      past_due_at: null,
      effective_at: new Date(1_700_000_000_000),
    })
  })

  it('preserves durable paused timing on a later provider snapshot', async () => {
    const applicationId = `test-membership-provider-facts-snapshot-${randomUUID()}`
    const user = await createTestUser()
    const sku = await createTestSku({ plan: 'plus', provider_application_id: applicationId })
    const subscriptionId = `sub_provider_paused_${randomUUID()}`
    const event = makeStripeEvent(`evt_provider_paused_${randomUUID()}`, subscriptionId, true)
    await insertStripeEvent(event)
    const membership = await createMembership({
      userId: user.id,
      plan: 'plus',
      skuId: sku.id,
      stripeSubscriptionId: subscriptionId,
      stripeCustomerId: `cus_provider_paused_${randomUUID()}`,
      providerApplicationId: applicationId,
      effectiveAt: new Date('2025-01-01T00:00:00.000Z'),
      observedAt: new Date('2025-02-01T00:00:00.000Z'),
      status: 'paused',
    })

    const result = await recordStripeMembershipProviderFacts({
      stripeEventId: event.id,
      membershipId: membership.id,
      subscription: Object.assign(
        makeSubscription(subscriptionId, sku.stripe_price_id, 500, 'usd', true, 'paused'),
        { start_date: 1_700_000_000 },
      ),
    })

    await expect(getTestMembershipSourceState(membership.id)).resolves.toMatchObject({
      paused_at: new Date('2025-02-01T00:00:00.000Z'),
    })
    await expect(
      getTestMembershipProviderObservation(result!.observationId!),
    ).resolves.toMatchObject({ paused_at: new Date('2025-02-01T00:00:00.000Z') })
  })

  it('uses the authoritative observation time when past-due timing is not yet known', async () => {
    const applicationId = `test-membership-provider-facts-snapshot-${randomUUID()}`
    const user = await createTestUser()
    const sku = await createTestSku({ plan: 'plus', provider_application_id: applicationId })
    const subscriptionId = `sub_provider_past_due_observation_${randomUUID()}`
    const event = makeStripeEvent(
      `evt_provider_past_due_observation_${randomUUID()}`,
      subscriptionId,
      true,
    )
    await insertStripeEvent(event)
    const membership = await createMembership({
      userId: user.id,
      plan: 'plus',
      skuId: sku.id,
      stripeSubscriptionId: subscriptionId,
      stripeCustomerId: `cus_provider_past_due_observation_${randomUUID()}`,
      providerApplicationId: applicationId,
      effectiveAt: new Date('2025-01-01T00:00:00.000Z'),
    })
    const observedAt = new Date('2030-01-01T00:00:00.000Z')
    const subscription = makeSubscription(
      subscriptionId,
      sku.stripe_price_id,
      500,
      'usd',
      true,
      'past_due',
    )

    await recordStripeMembershipProviderFacts({
      stripeEventId: event.id,
      membershipId: membership.id,
      subscription,
      observedAt,
    })

    await expect(getTestMembershipSourceState(membership.id)).resolves.toMatchObject({
      past_due_at: observedAt,
    })
  })

  it('uses the subscription item period end when the subscription period end is absent', async () => {
    const applicationId = `test-membership-provider-facts-snapshot-${randomUUID()}`
    const user = await createTestUser()
    const sku = await createTestSku({ plan: 'plus', provider_application_id: applicationId })
    const subscriptionId = `sub_item_period_end_${randomUUID()}`
    const event = makeStripeEvent(`evt_item_period_end_${randomUUID()}`, subscriptionId, true)
    await insertStripeEvent(event)
    const membership = await createMembership({
      userId: user.id,
      plan: 'plus',
      skuId: sku.id,
      stripeSubscriptionId: subscriptionId,
      stripeCustomerId: `cus_item_period_end_${randomUUID()}`,
      providerApplicationId: applicationId,
    })
    const subscription = makeSubscription(subscriptionId, sku.stripe_price_id, 500, 'usd', true)
    Reflect.deleteProperty(subscription, 'current_period_end')
    Object.assign(subscription.items.data[0]!, { current_period_end: 1_800_000_000 })

    await recordStripeMembershipProviderFacts({
      stripeEventId: event.id,
      membershipId: membership.id,
      subscription,
    })

    await expect(getTestMembershipRaw(membership.id)).resolves.toMatchObject({
      source_expires_at: new Date(1_800_000_000_000),
    })
  })
})

function makeStripeEvent(
  id: string,
  subscriptionId: string,
  livemode: boolean,
  created = 1_741_398_400,
): Stripe.Event {
  return {
    id,
    object: 'event',
    api_version: '2025-09-30.clover',
    created,
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
  amount: number,
  currency: string,
  livemode: boolean,
  status: 'active' | 'past_due' | 'paused' = 'active',
): Stripe.Response<Stripe.Subscription> {
  return {
    id,
    object: 'subscription',
    livemode,
    status,
    cancel_at_period_end: false,
    items: { data: [{ price: { id: priceId, unit_amount: amount, currency } }] },
    current_period_start: 1_741_398_400,
    current_period_end: 1_744_076_800,
  } as unknown as Stripe.Response<Stripe.Subscription>
}

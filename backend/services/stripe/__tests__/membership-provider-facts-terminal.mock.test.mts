import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import type Stripe from 'stripe'
import {
  createTestSku,
  createTestUser,
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

describe('terminal Stripe membership provider facts', () => {
  it('does not let a nonterminal event reactivate a canceled Stripe lineage', async () => {
    const applicationId = `test-membership-provider-facts-terminal-${randomUUID()}`
    const user = await createTestUser()
    const sku = await createTestSku({ plan: 'plus', provider_application_id: applicationId })
    const subscriptionId = `sub_provider_terminal_${randomUUID()}`
    const terminalEvent = makeStripeEvent(
      `evt_provider_terminal_${randomUUID()}`,
      subscriptionId,
      200,
    )
    const staleEvent = makeStripeEvent(
      `evt_provider_terminal_stale_${randomUUID()}`,
      subscriptionId,
      100,
    )
    const newerEvent = makeStripeEvent(
      `evt_provider_terminal_newer_${randomUUID()}`,
      subscriptionId,
      300,
    )
    await Promise.all([terminalEvent, staleEvent, newerEvent].map(insertStripeEvent))
    const membership = await createMembership({
      userId: user.id,
      plan: 'plus',
      skuId: sku.id,
      stripeSubscriptionId: subscriptionId,
      stripeCustomerId: `cus_provider_terminal_${randomUUID()}`,
      providerApplicationId: applicationId,
    })
    const terminal = await recordStripeMembershipProviderFacts({
      stripeEventId: terminalEvent.id,
      membershipId: membership.id,
      subscription: makeSubscription(subscriptionId, sku.stripe_price_id, 'canceled'),
    })

    await expect(
      getTestMembershipProviderObservation(terminal.observationId!),
    ).resolves.toMatchObject({
      terminal_at: new Date('2025-03-08T01:55:00.000Z'),
    })
    await expect(
      recordStripeMembershipProviderFacts({
        stripeEventId: staleEvent.id,
        membershipId: membership.id,
        subscription: makeSubscription(subscriptionId, sku.stripe_price_id),
      }),
    ).resolves.toMatchObject({ observationId: null })
    await expect(
      recordStripeMembershipProviderFacts({
        stripeEventId: newerEvent.id,
        membershipId: membership.id,
        subscription: makeSubscription(subscriptionId, sku.stripe_price_id),
      }),
    ).resolves.toMatchObject({ observationId: null })
  })

  it('persists terminal_at for an incomplete expired Stripe lineage', async () => {
    const applicationId = `test-membership-provider-facts-terminal-${randomUUID()}`
    const user = await createTestUser()
    const sku = await createTestSku({ plan: 'plus', provider_application_id: applicationId })
    const subscriptionId = `sub_provider_incomplete_expired_${randomUUID()}`
    const event = makeStripeEvent(
      `evt_provider_incomplete_expired_${randomUUID()}`,
      subscriptionId,
      200,
    )
    await insertStripeEvent(event)
    const membership = await createMembership({
      userId: user.id,
      plan: 'plus',
      skuId: sku.id,
      stripeSubscriptionId: subscriptionId,
      stripeCustomerId: `cus_provider_incomplete_expired_${randomUUID()}`,
      providerApplicationId: applicationId,
    })
    const result = await recordStripeMembershipProviderFacts({
      stripeEventId: event.id,
      membershipId: membership.id,
      subscription: makeSubscription(subscriptionId, sku.stripe_price_id, 'incomplete_expired'),
    })

    await expect(
      getTestMembershipProviderObservation(result.observationId!),
    ).resolves.toMatchObject({
      terminal_at: new Date('2025-03-08T01:56:40.000Z'),
    })
  })

  it('keeps an unpaid Stripe lineage nonterminal so a newer active observation can recover it', async () => {
    const applicationId = `test-membership-provider-facts-terminal-${randomUUID()}`
    const user = await createTestUser()
    const sku = await createTestSku({ plan: 'plus', provider_application_id: applicationId })
    const subscriptionId = `sub_provider_unpaid_${randomUUID()}`
    const unpaidEvent = makeStripeEvent(`evt_z_unpaid_${randomUUID()}`, subscriptionId, 200)
    const recoveredEvent = makeStripeEvent(
      `evt_a_unpaid_recovered_${randomUUID()}`,
      subscriptionId,
      200,
    )
    await Promise.all([unpaidEvent, recoveredEvent].map(insertStripeEvent))
    const membership = await createMembership({
      userId: user.id,
      plan: 'plus',
      skuId: sku.id,
      stripeSubscriptionId: subscriptionId,
      stripeCustomerId: `cus_provider_unpaid_${randomUUID()}`,
      providerApplicationId: applicationId,
    })
    const unpaid = await recordStripeMembershipProviderFacts({
      stripeEventId: unpaidEvent.id,
      membershipId: membership.id,
      subscription: makeSubscription(subscriptionId, sku.stripe_price_id, 'unpaid'),
    })
    const recovered = await recordStripeMembershipProviderFacts({
      stripeEventId: recoveredEvent.id,
      membershipId: membership.id,
      subscription: makeSubscription(subscriptionId, sku.stripe_price_id),
    })

    await expect(
      getTestMembershipProviderObservation(unpaid.observationId!),
    ).resolves.toMatchObject({
      terminal_at: null,
    })
    expect(recovered).toMatchObject({ observationId: expect.stringMatching(/^[0-9a-f-]{36}$/) })
    await expect(getTestMembershipSourceState(membership.id)).resolves.toMatchObject({
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
  status: 'active' | 'canceled' | 'incomplete_expired' | 'unpaid' = 'active',
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
    ...(status === 'canceled' ? { canceled_at: 1_741_398_900 } : {}),
    ...(status === 'incomplete_expired' ? { ended_at: 1_741_399_000 } : {}),
  } as unknown as Stripe.Response<Stripe.Subscription>
}

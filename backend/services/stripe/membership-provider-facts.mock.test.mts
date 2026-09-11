import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import type Stripe from 'stripe'
import {
  createTestSku,
  createTestUser,
  getTestMembershipProviderObservation,
  getTestMembershipSourceState,
  setStripeEventReceivedAtForTest,
} from '@voucha/test-helpers'
import { createMembership } from '@services/memberships'
import { insertStripeEvent } from './events.mts'
import { recordStripeMembershipProviderFacts } from './membership-provider-facts.mts'

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

describe('Stripe membership provider facts', () => {
  it('records authoritative observed and renewal price snapshots for a verified EventBridge event', async () => {
    const applicationId = `test-membership-provider-facts-${randomUUID()}`
    const user = await createTestUser()
    const sku = await createTestSku({ plan: 'plus', provider_application_id: applicationId })
    const subscriptionId = `sub_provider_fact_${randomUUID()}`
    const event = makeStripeEvent(`evt_provider_fact_${randomUUID()}`, subscriptionId, true)
    await insertStripeEvent(event)
    const membership = await createMembership({
      userId: user.id,
      plan: 'plus',
      skuId: sku.id,
      stripeSubscriptionId: subscriptionId,
      stripeCustomerId: `cus_provider_fact_${randomUUID()}`,
      providerEnvironment: 'production',
      providerApplicationId: applicationId,
      expiresAt: new Date('2030-01-02T00:00:00.000Z'),
    })
    const subscription = makeSubscription(subscriptionId, sku.stripe_price_id, 875, 'usd', true)

    const result = await recordStripeMembershipProviderFacts({
      stripeEventId: event.id,
      membershipId: membership.id,
      subscription,
    })

    expect(result).toMatchObject({
      evidenceId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      observationId: expect.stringMatching(/^[0-9a-f-]{36}$/),
    })
    await expect(
      getTestMembershipProviderObservation(result!.observationId!),
    ).resolves.toMatchObject({
      observed_price_minor_units: '875',
      observed_price_currency_code: 'usd',
      renewal_price_minor_units: '875',
      renewal_price_currency_code: 'usd',
    })
  })

  it('rejects an authoritative subscription whose livemode disagrees with the EventBridge event', async () => {
    const applicationId = `test-membership-provider-facts-${randomUUID()}`
    const user = await createTestUser()
    const sku = await createTestSku({ plan: 'plus', provider_application_id: applicationId })
    const subscriptionId = `sub_provider_mode_${randomUUID()}`
    const event = makeStripeEvent(`evt_provider_mode_${randomUUID()}`, subscriptionId, true)
    await insertStripeEvent(event)
    const membership = await createMembership({
      userId: user.id,
      plan: 'plus',
      skuId: sku.id,
      stripeSubscriptionId: subscriptionId,
      stripeCustomerId: `cus_provider_mode_${randomUUID()}`,
      providerApplicationId: applicationId,
    })
    const subscription = makeSubscription(subscriptionId, sku.stripe_price_id, 500, 'usd', false)

    await expect(
      recordStripeMembershipProviderFacts({
        stripeEventId: event.id,
        membershipId: membership.id,
        subscription,
      }),
    ).rejects.toThrow('livemode disagrees')
  })

  it('orders equal-time authoritative observations by durable receipt time and preserves the terminal watermark', async () => {
    const applicationId = `test-membership-provider-facts-${randomUUID()}`
    const user = await createTestUser()
    const sku = await createTestSku({ plan: 'plus', provider_application_id: applicationId })
    const subscriptionId = `sub_provider_order_${randomUUID()}`
    const membership = await createMembership({
      userId: user.id,
      plan: 'plus',
      skuId: sku.id,
      stripeSubscriptionId: subscriptionId,
      stripeCustomerId: `cus_provider_order_${randomUUID()}`,
      providerApplicationId: applicationId,
    })
    const latest = makeStripeEvent(`evt_z_${randomUUID()}`, subscriptionId, true, 200)
    const stale = makeStripeEvent(`evt_y_${randomUUID()}`, subscriptionId, true, 100)
    const equal = makeStripeEvent(`evt_a_${randomUUID()}`, subscriptionId, true, 200)
    const sameInstant = makeStripeEvent(`evt_b_${randomUUID()}`, subscriptionId, true, 200)
    const terminal = makeStripeEvent(`evt_0_${randomUUID()}`, subscriptionId, true, 100)
    await Promise.all([latest, stale, equal, sameInstant, terminal].map(insertStripeEvent))
    await setStripeEventReceivedAtForTest(latest.id, new Date('2030-01-01T00:00:00.000Z'))
    await setStripeEventReceivedAtForTest(equal.id, new Date('2030-01-01T00:00:01.000Z'))
    await setStripeEventReceivedAtForTest(sameInstant.id, new Date('2030-01-01T00:00:01.000Z'))
    const observedAt = new Date('2030-01-01T00:00:02.000Z')
    const active = makeSubscription(subscriptionId, sku.stripe_price_id, 500, 'usd', true)
    const laterReceiptResult = await recordStripeMembershipProviderFacts({
      stripeEventId: equal.id,
      membershipId: membership.id,
      subscription: active,
      observedAt,
    })
    expect(laterReceiptResult).toMatchObject({
      observationId: expect.stringMatching(/^[0-9a-f-]{36}$/),
    })
    await expect(
      recordStripeMembershipProviderFacts({
        stripeEventId: sameInstant.id,
        membershipId: membership.id,
        subscription: active,
        observedAt,
      }),
    ).resolves.toMatchObject({ observationId: expect.stringMatching(/^[0-9a-f-]{36}$/) })
    await expect(
      recordStripeMembershipProviderFacts({
        stripeEventId: latest.id,
        membershipId: membership.id,
        subscription: active,
        observedAt,
      }),
    ).resolves.toMatchObject({ observationId: null })
    await expect(
      recordStripeMembershipProviderFacts({
        stripeEventId: stale.id,
        membershipId: membership.id,
        subscription: active,
        observedAt,
      }),
    ).resolves.toMatchObject({ observationId: null })
    const terminalResult = await recordStripeMembershipProviderFacts({
      stripeEventId: terminal.id,
      membershipId: membership.id,
      subscription: makeSubscription(
        subscriptionId,
        sku.stripe_price_id,
        500,
        'usd',
        true,
        'canceled',
      ),
      observedAt,
    })
    await expect(getTestMembershipSourceState(membership.id)).resolves.toMatchObject({
      membership_provider_observation_id: terminalResult!.observationId,
      cancelled_at: expect.any(Date),
    })
    const [equalObservation, terminalObservation] = await Promise.all([
      getTestMembershipProviderObservation(laterReceiptResult.observationId!),
      getTestMembershipProviderObservation(terminalResult!.observationId!),
    ])
    expect(Number(terminalObservation!.provider_order)).toBeGreaterThan(
      Number(equalObservation!.provider_order),
    )
  })

  it('records the expired clock in the immutable provider observation', async () => {
    const applicationId = `test-membership-provider-facts-${randomUUID()}`
    const user = await createTestUser()
    const sku = await createTestSku({ plan: 'plus', provider_application_id: applicationId })
    const subscriptionId = `sub_provider_expired_${randomUUID()}`
    const event = makeStripeEvent(`evt_provider_expired_${randomUUID()}`, subscriptionId, true)
    await insertStripeEvent(event)
    const membership = await createMembership({
      userId: user.id,
      plan: 'plus',
      skuId: sku.id,
      stripeSubscriptionId: subscriptionId,
      stripeCustomerId: `cus_provider_expired_${randomUUID()}`,
      providerApplicationId: applicationId,
    })
    const endedAt = 1_744_076_900
    const subscription = makeSubscription(
      subscriptionId,
      sku.stripe_price_id,
      500,
      'usd',
      true,
      'incomplete_expired',
    )
    Object.assign(subscription, { ended_at: endedAt })

    const result = await recordStripeMembershipProviderFacts({
      stripeEventId: event.id,
      membershipId: membership.id,
      subscription,
    })

    await expect(
      getTestMembershipProviderObservation(result!.observationId!),
    ).resolves.toMatchObject({ expired_at: new Date(endedAt * 1000) })
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
  status: 'active' | 'canceled' | 'incomplete_expired' | 'unpaid' = 'active',
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
    ...(status === 'canceled' ? { canceled_at: 1_741_398_500 } : {}),
  } as unknown as Stripe.Response<Stripe.Subscription>
}

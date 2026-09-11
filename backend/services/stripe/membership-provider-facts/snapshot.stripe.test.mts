import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
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

const PERIOD_END = 1_744_076_800

// The backend-stripe vitest project has no globalSetup (unlike backend-aws/backend-openai), so
// unlike backend-data-stores tests this file cannot rely on a default being populated for it —
// recordStripeMembershipProviderFacts encrypts Stripe evidence via @modules/token-secrets, which
// requires this var. Mirrors membership-provider-evidence.stripe.test.mts's existing pattern.
const ENCRYPTION_KEYS = 'test:raw32:this fake test key is not secret'

describe('Stripe scheduled membership renewals', () => {
  let previousEncryptionKeys: string | undefined

  beforeEach(() => {
    previousEncryptionKeys = process.env.VOUCHA_STORED_SECRET_ENCRYPTION_KEYS
    process.env.VOUCHA_STORED_SECRET_ENCRYPTION_KEYS = ENCRYPTION_KEYS
  })

  afterEach(() => {
    if (previousEncryptionKeys === undefined) {
      delete process.env.VOUCHA_STORED_SECRET_ENCRYPTION_KEYS
    } else {
      process.env.VOUCHA_STORED_SECRET_ENCRYPTION_KEYS = previousEncryptionKeys
    }
  })

  it('suppresses renewal facts when cancellation is scheduled no later than period end', async () => {
    const applicationId = `test-snapshot-stripe-${randomUUID()}`
    const user = await createTestUser()
    const currentSku = await createTestSku({ plan: 'plus', provider_application_id: applicationId })
    const renewalSku = await createTestSku({ plan: 'pro', provider_application_id: applicationId })
    const subscriptionId = `sub_scheduled_cancellation_${randomUUID()}`
    const event = makeStripeEvent(`evt_scheduled_cancellation_${randomUUID()}`, subscriptionId)
    await insertStripeEvent(event)
    const membership = await createMembership({
      userId: user.id,
      plan: 'plus',
      skuId: currentSku.id,
      stripeSubscriptionId: subscriptionId,
      stripeCustomerId: `cus_scheduled_cancellation_${randomUUID()}`,
      providerApplicationId: applicationId,
    })

    const result = await recordStripeMembershipProviderFacts({
      stripeEventId: event.id,
      membershipId: membership.id,
      subscription: makeSubscription(
        subscriptionId,
        currentSku.stripe_price_id,
        {
          object: 'subscription_schedule',
          phases: [
            {
              start_date: PERIOD_END,
              items: [{ price: makeRecurringPrice(renewalSku.stripe_price_id, 1500) }],
            },
          ],
        },
        PERIOD_END,
      ),
    })

    await expect(getTestMembershipSourceState(membership.id)).resolves.toMatchObject({
      auto_renews: false,
    })
    await expect(
      getTestMembershipProviderObservation(result.observationId!),
    ).resolves.toMatchObject({
      renewal_membership_provider_product_id: null,
      renewal_membership_product_id: null,
      renewal_price_minor_units: null,
      renewal_price_currency_code: null,
      renewal_effective_at: null,
    })
  })

  it('records the mapped price from the schedule phase starting at period end', async () => {
    const applicationId = `test-snapshot-stripe-${randomUUID()}`
    const user = await createTestUser()
    const currentSku = await createTestSku({ plan: 'plus', provider_application_id: applicationId })
    const renewalSku = await createTestSku({ plan: 'pro', provider_application_id: applicationId })
    const subscriptionId = `sub_scheduled_renewal_${randomUUID()}`
    const event = makeStripeEvent(`evt_scheduled_renewal_${randomUUID()}`, subscriptionId)
    await insertStripeEvent(event)
    const membership = await createMembership({
      userId: user.id,
      plan: 'plus',
      skuId: currentSku.id,
      stripeSubscriptionId: subscriptionId,
      stripeCustomerId: `cus_scheduled_renewal_${randomUUID()}`,
      providerApplicationId: applicationId,
    })

    const result = await recordStripeMembershipProviderFacts({
      stripeEventId: event.id,
      membershipId: membership.id,
      subscription: makeSubscription(subscriptionId, currentSku.stripe_price_id, {
        object: 'subscription_schedule',
        phases: [
          {
            start_date: PERIOD_END,
            items: [
              {
                price: makeRecurringPrice(renewalSku.stripe_price_id, 1500),
              },
            ],
          },
        ],
      }),
    })

    await expect(
      getTestMembershipProviderObservation(result.observationId!),
    ).resolves.toMatchObject({
      membership_provider_product_id: currentSku.membership_provider_product_id,
      observed_price_minor_units: '500',
      renewal_membership_provider_product_id: renewalSku.membership_provider_product_id,
      renewal_membership_product_id: renewalSku.id,
      renewal_price_minor_units: '1500',
      renewal_price_currency_code: 'usd',
      renewal_effective_at: new Date(PERIOD_END * 1000),
    })
  })

  it('uses the current price when the next schedule phase starts after period end', async () => {
    const applicationId = `test-snapshot-stripe-${randomUUID()}`
    const user = await createTestUser()
    const sku = await createTestSku({ plan: 'plus', provider_application_id: applicationId })
    const subscriptionId = `sub_later_scheduled_renewal_${randomUUID()}`
    const event = makeStripeEvent(`evt_later_scheduled_renewal_${randomUUID()}`, subscriptionId)
    await insertStripeEvent(event)
    const membership = await createMembership({
      userId: user.id,
      plan: 'plus',
      skuId: sku.id,
      stripeSubscriptionId: subscriptionId,
      stripeCustomerId: `cus_later_scheduled_renewal_${randomUUID()}`,
      providerApplicationId: applicationId,
    })

    const result = await recordStripeMembershipProviderFacts({
      stripeEventId: event.id,
      membershipId: membership.id,
      subscription: makeSubscription(subscriptionId, sku.stripe_price_id, {
        object: 'subscription_schedule',
        phases: [
          {
            start_date: PERIOD_END + 1,
            items: [{ price: makeRecurringPrice(`price_later_${randomUUID()}`, 1500) }],
          },
        ],
      }),
    })

    await expect(
      getTestMembershipProviderObservation(result.observationId!),
    ).resolves.toMatchObject({
      renewal_membership_provider_product_id: sku.membership_provider_product_id,
      renewal_price_minor_units: '500',
      renewal_price_currency_code: 'usd',
      renewal_effective_at: new Date(PERIOD_END * 1000),
    })
  })

  it('keeps renewal facts empty for an unexpanded matching scheduled price', async () => {
    const applicationId = `test-snapshot-stripe-${randomUUID()}`
    const user = await createTestUser()
    const sku = await createTestSku({ plan: 'plus', provider_application_id: applicationId })
    const subscriptionId = `sub_unavailable_scheduled_renewal_${randomUUID()}`
    const event = makeStripeEvent(
      `evt_unavailable_scheduled_renewal_${randomUUID()}`,
      subscriptionId,
    )
    await insertStripeEvent(event)
    const membership = await createMembership({
      userId: user.id,
      plan: 'plus',
      skuId: sku.id,
      stripeSubscriptionId: subscriptionId,
      stripeCustomerId: `cus_unavailable_scheduled_renewal_${randomUUID()}`,
      providerApplicationId: applicationId,
    })

    const result = await recordStripeMembershipProviderFacts({
      stripeEventId: event.id,
      membershipId: membership.id,
      subscription: makeSubscription(
        subscriptionId,
        sku.stripe_price_id,
        'sub_schedule_unexpanded',
      ),
    })

    await expect(
      getTestMembershipProviderObservation(result.observationId!),
    ).resolves.toMatchObject({
      membership_provider_product_id: sku.membership_provider_product_id,
      renewal_membership_provider_product_id: null,
      renewal_membership_product_id: null,
      renewal_price_minor_units: null,
      renewal_price_currency_code: null,
      renewal_effective_at: null,
    })
  })

  it('rejects an unmapped price in the next scheduled phase', async () => {
    const applicationId = `test-snapshot-stripe-${randomUUID()}`
    const user = await createTestUser()
    const sku = await createTestSku({ plan: 'plus', provider_application_id: applicationId })
    const subscriptionId = `sub_unmapped_scheduled_renewal_${randomUUID()}`
    const event = makeStripeEvent(`evt_unmapped_scheduled_renewal_${randomUUID()}`, subscriptionId)
    await insertStripeEvent(event)
    const membership = await createMembership({
      userId: user.id,
      plan: 'plus',
      skuId: sku.id,
      stripeSubscriptionId: subscriptionId,
      stripeCustomerId: `cus_unmapped_scheduled_renewal_${randomUUID()}`,
      providerApplicationId: applicationId,
    })

    await expect(
      recordStripeMembershipProviderFacts({
        stripeEventId: event.id,
        membershipId: membership.id,
        subscription: makeSubscription(subscriptionId, sku.stripe_price_id, {
          object: 'subscription_schedule',
          phases: [
            {
              start_date: PERIOD_END,
              items: [{ price: makeRecurringPrice(`price_unmapped_${randomUUID()}`, 1500) }],
            },
          ],
        }),
      }),
    ).rejects.toThrow('Unmapped Stripe renewal price ID')
  })
})

function makeStripeEvent(id: string, subscriptionId: string): Stripe.Event {
  return {
    id,
    object: 'event',
    api_version: '2025-09-30.clover',
    created: 1_741_398_400,
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
  schedule: unknown,
  cancelAt?: number,
): Stripe.Subscription {
  return {
    id,
    object: 'subscription',
    livemode: true,
    status: 'active',
    cancel_at_period_end: false,
    items: { data: [{ price: makeRecurringPrice(priceId, 500) }] },
    current_period_start: 1_741_398_400,
    current_period_end: PERIOD_END,
    cancel_at: cancelAt ?? null,
    schedule,
  } as unknown as Stripe.Subscription
}

function makeRecurringPrice(id: string, unitAmount: number): Stripe.Price {
  return {
    id,
    object: 'price',
    currency: 'usd',
    unit_amount: unitAmount,
    recurring: { interval: 'month' },
  } as Stripe.Price
}

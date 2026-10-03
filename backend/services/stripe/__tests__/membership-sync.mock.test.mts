import { randomUUID } from 'node:crypto'
import Stripe from 'stripe'
import { describe, expect, it, vi } from 'vitest'
import { getStripeSubscription } from '@modules/stripe/subscriptions'
import { getStripeCustomer } from '@modules/stripe/customers'
import { MockAgent, createMockAgentFetchForTest } from '@voucha/test-helpers/provider-http'
import {
  createTestSku,
  createTestUser,
  getTestMembershipRaw,
  getTestMembershipSourceState,
  getTestMembershipProviderEvidenceId,
} from '@voucha/test-helpers'
import { withPostgresQueryFailureForTest } from '@voucha/test-helpers/postgres-query-failure'
import { createMembership } from '@services/memberships'
import { insertStripeEvent } from '../insert-event.mts'
import { ensureMembershipFromStripeSubscription } from '../membership-sync.mts'

vi.mock<typeof import('@modules/stripe/subscriptions')>(
  import('@modules/stripe/subscriptions'),
  async original => {
    const actual = await original()
    return {
      ...actual,
      getStripeSubscription: vi.fn<typeof getStripeSubscription>(actual.getStripeSubscription),
    }
  },
)
vi.mock<typeof import('@modules/stripe/customers')>(
  import('@modules/stripe/customers'),
  async original => {
    const actual = await original()
    return {
      ...actual,
      getStripeCustomer: vi.fn<typeof getStripeCustomer>(actual.getStripeCustomer),
    }
  },
)

describe('ensureMembershipFromStripeSubscription provider transaction failures', () => {
  it('preserves a provider fact transaction failure and leaves the membership and evidence unchanged', async () => {
    const user = await createTestUser()
    const applicationId = `stripe-fact-failure-${randomUUID()}`
    const subscriptionId = `sub_${randomUUID()}`
    const customerId = `cus_${randomUUID()}`
    const eventId = `evt_${randomUUID()}`
    const sku = await createTestSku({ plan: 'plus', provider_application_id: applicationId })
    const membership = await createMembership({
      userId: user.id,
      plan: 'plus',
      skuId: sku.id,
      stripeSubscriptionId: subscriptionId,
      stripeCustomerId: customerId,
      providerApplicationId: applicationId,
    })
    const before = await getTestMembershipRaw(membership.id)
    const sourceBefore = await getTestMembershipSourceState(membership.id)
    const evidenceBefore = await getTestMembershipProviderEvidenceId(membership.id)
    const agent = new MockAgent()
    agent.disableNetConnect()
    const client = new Stripe('sk_test_owned_fixture', {
      httpClient: Stripe.createFetchHttpClient(createMockAgentFetchForTest(agent)),
      maxNetworkRetries: 0,
    })
    vi.mocked(getStripeCustomer).mockImplementation(id => client.customers.retrieve(id))
    vi.mocked(getStripeSubscription).mockImplementation(id =>
      client.subscriptions.retrieve(id, { expand: ['schedule.phases.items.price'] }),
    )
    const created = 1_800_000_000
    const customer = {
      id: customerId,
      object: 'customer',
      balance: 0,
      created,
      default_source: null,
      description: 'Owned membership customer',
      email: `tests+${randomUUID()}@voucha.ai`,
      livemode: true,
      metadata: { userId: user.id },
      shipping: null,
      invoice_settings: {
        custom_fields: null,
        default_payment_method: null,
        footer: null,
        rendering_options: null,
      },
    } satisfies Stripe.Customer
    const productId = `prod_${randomUUID()}`
    const price = {
      id: sku.stripe_price_id,
      object: 'price',
      active: true,
      billing_scheme: 'per_unit',
      created,
      currency: 'usd',
      custom_unit_amount: null,
      livemode: true,
      lookup_key: null,
      metadata: {},
      nickname: 'Owned Plus monthly price',
      product: productId,
      recurring: {
        interval: 'month',
        interval_count: 1,
        meter: null,
        trial_period_days: null,
        usage_type: 'licensed',
      },
      tax_behavior: 'unspecified',
      tiers_mode: null,
      transform_quantity: null,
      type: 'recurring',
      unit_amount: 1000,
      unit_amount_decimal: null,
    } satisfies Stripe.Price
    const plan = {
      id: price.id,
      object: 'plan',
      active: true,
      amount: 1000,
      amount_decimal: null,
      billing_scheme: 'per_unit',
      created,
      currency: 'usd',
      interval: 'month',
      interval_count: 1,
      livemode: true,
      metadata: {},
      meter: null,
      nickname: price.nickname,
      product: productId,
      tiers_mode: null,
      transform_usage: null,
      trial_period_days: null,
      usage_type: 'licensed',
    } satisfies Stripe.Plan
    const item = {
      id: `si_${randomUUID()}`,
      object: 'subscription_item',
      billing_thresholds: null,
      created,
      current_period_start: created,
      current_period_end: 1_802_592_000,
      current_trial: null,
      discounts: [],
      metadata: {},
      plan,
      price,
      quantity: 1,
      subscription: subscriptionId,
      tax_rates: [],
    } satisfies Stripe.SubscriptionItem
    const subscription = {
      id: subscriptionId,
      object: 'subscription',
      application: null,
      application_fee_percent: null,
      automatic_tax: { disabled_reason: null, enabled: false, liability: null },
      billing_cycle_anchor: created,
      billing_cycle_anchor_config: null,
      billing_mode: { flexible: null, type: 'classic' },
      billing_schedules: [],
      billing_thresholds: null,
      cancel_at: null,
      cancel_at_period_end: false,
      canceled_at: null,
      cancellation_details: null,
      collection_method: 'charge_automatically',
      created,
      currency: 'usd',
      customer: customerId,
      customer_account: null,
      days_until_due: null,
      default_payment_method: null,
      default_source: null,
      description: 'Owned active Plus membership',
      discounts: [],
      ended_at: null,
      invoice_settings: {
        account_tax_ids: null,
        custom_fields: null,
        description: null,
        footer: null,
        issuer: { type: 'self' },
      },
      items: {
        object: 'list',
        data: [item],
        has_more: false,
        url: `/v1/subscription_items?subscription=${subscriptionId}`,
      },
      latest_invoice: null,
      livemode: true,
      managed_payments: null,
      metadata: {},
      next_pending_invoice_item_invoice: null,
      on_behalf_of: null,
      pause_collection: null,
      payment_settings: null,
      pending_invoice_item_interval: null,
      pending_setup_intent: null,
      pending_update: null,
      schedule: null,
      start_date: created,
      status: 'active',
      test_clock: null,
      transfer_data: null,
      trial_end: null,
      trial_settings: null,
      trial_start: null,
    } satisfies Stripe.Subscription
    const event = {
      id: eventId,
      object: 'event',
      api_version: null,
      created,
      data: { object: subscription },
      livemode: true,
      pending_webhooks: 0,
      request: null,
      type: 'customer.subscription.updated',
    } satisfies Stripe.Event
    agent
      .get('https://api.stripe.com')
      .intercept({
        path: `/v1/customers/${customerId}`,
        method: 'GET',
      })
      .reply(200, customer)
    agent
      .get('https://api.stripe.com')
      .intercept({
        path: `/v1/subscriptions/${subscriptionId}`,
        query: { 'expand[0]': 'schedule.phases.items.price' },
        method: 'GET',
      })
      .reply(200, subscription)
    try {
      await insertStripeEvent(event)
      const { result, error } = await withPostgresQueryFailureForTest(
        '/* recordStripeMembershipProviderFacts: lock user before source state */',
        () =>
          ensureMembershipFromStripeSubscription(eventId, subscriptionId, customerId, {
            applicationId,
          }).catch((err: unknown) => {
            if (!(err instanceof Error))
              throw new Error('Provider threw a non-Error', { cause: err })
            if (!('code' in err) || err.code !== '25P02') throw err
            return err
          }),
        { command: 'SELECT' },
      )
      expect(error).toMatchObject({ code: '25P02' })
      expect(result).toBe(error)
      await expect(getTestMembershipRaw(membership.id)).resolves.toEqual(before)
      await expect(getTestMembershipSourceState(membership.id)).resolves.toEqual(sourceBefore)
      await expect(getTestMembershipProviderEvidenceId(membership.id)).resolves.toBe(evidenceBefore)
      agent.assertNoPendingInterceptors()
    } finally {
      vi.mocked(getStripeCustomer).mockReset()
      vi.mocked(getStripeSubscription).mockReset()
      await agent.close()
    }
  })
})

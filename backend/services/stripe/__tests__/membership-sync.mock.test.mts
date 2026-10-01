import { randomUUID } from 'node:crypto'
import Stripe from 'stripe'
import { describe, expect, it, vi } from 'vitest'
import { getStripeClient } from '@modules/stripe/client'
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
import { insertStripeEvent } from '../events.mts'
import { ensureMembershipFromStripeSubscription } from '../membership-sync.mts'
import { makeStripeSubscriptionEvent } from '../../../test-helpers/services/stripe/membership-sync-event.mts'

vi.mock<typeof import('@modules/stripe/client')>(
  import('@modules/stripe/client'),
  async original => ({
    ...(await original()),
    getStripeClient: vi.fn<typeof getStripeClient>(),
  }),
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
    await insertStripeEvent(makeStripeSubscriptionEvent<Stripe.Event>(eventId, subscriptionId))
    const before = await getTestMembershipRaw(membership.id)
    const sourceBefore = await getTestMembershipSourceState(membership.id)
    const evidenceBefore = await getTestMembershipProviderEvidenceId(membership.id)
    const agent = new MockAgent()
    agent.disableNetConnect()
    const client = new Stripe('sk_test_owned_fixture', {
      httpClient: Stripe.createFetchHttpClient(createMockAgentFetchForTest(agent)),
      maxNetworkRetries: 0,
    })
    vi.mocked(getStripeClient).mockReturnValue(client)
    const customer = {
      id: customerId,
      object: 'customer',
      metadata: { userId: user.id },
    } satisfies Pick<Stripe.Customer, 'id' | 'object' | 'metadata'>
    const price = { id: sku.stripe_price_id } satisfies Pick<Stripe.Price, 'id'>
    const item = {
      price,
      current_period_start: 1_800_000_000,
      current_period_end: 1_802_592_000,
    } satisfies Pick<Stripe.SubscriptionItem, 'current_period_start' | 'current_period_end'> & {
      price: Pick<Stripe.Price, 'id'>
    }
    const subscription = {
      id: subscriptionId,
      object: 'subscription',
      customer: customerId,
      metadata: {},
      status: 'active',
      livemode: true,
      cancel_at_period_end: false,
      start_date: 1_800_000_000,
      items: { data: [item] },
    } satisfies Pick<
      Stripe.Subscription,
      | 'id'
      | 'object'
      | 'customer'
      | 'metadata'
      | 'status'
      | 'livemode'
      | 'cancel_at_period_end'
      | 'start_date'
    > & { items: { data: (typeof item)[] } }
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
      const { result, error } = await withPostgresQueryFailureForTest(
        '/* recordStripeMembershipProviderFacts: lock user before source state */',
        () =>
          ensureMembershipFromStripeSubscription(eventId, subscriptionId, customerId, {
            applicationId,
          }).catch((err: unknown) => err),
        { command: 'SELECT' },
      )
      expect(error).toMatchObject({ code: '25P02' })
      expect(result).toBe(error)
      await expect(getTestMembershipRaw(membership.id)).resolves.toEqual(before)
      await expect(getTestMembershipSourceState(membership.id)).resolves.toEqual(sourceBefore)
      await expect(getTestMembershipProviderEvidenceId(membership.id)).resolves.toBe(evidenceBefore)
      agent.assertNoPendingInterceptors()
    } finally {
      vi.mocked(getStripeClient).mockReset()
      await agent.close()
    }
  })
})

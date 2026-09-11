import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestSku, createTestUser } from '@voucha/test-helpers'
import { getMembershipByStripeSubscriptionId } from '@services/memberships'
import { getStripeMembershipSourceIdentity } from '@services/memberships/create-types'
import { insertStripeEvent } from './events.mts'

vi.mock<typeof import('@modules/stripe/customers')>(
  import('@modules/stripe/customers'),
  async importOriginal => ({
    ...(await importOriginal()),
    getStripeCustomer: vi.fn<VitestLooseMock>(),
  }),
)

vi.mock<typeof import('@modules/stripe/subscriptions')>(
  import('@modules/stripe/subscriptions'),
  async importOriginal => ({
    ...(await importOriginal()),
    getStripeSubscription: vi.fn<VitestLooseMock>(),
  }),
)

import { getStripeCustomer } from '@modules/stripe/customers'
import { getStripeSubscription } from '@modules/stripe/subscriptions'
import { ensureMembershipFromStripeSubscription } from './membership-sync.mts'

const mockGetStripeCustomer = vi.mocked(getStripeCustomer)
const mockGetStripeSubscription = vi.mocked(getStripeSubscription)

describe('Stripe membership source identity', () => {
  beforeEach(() => vi.clearAllMocks())

  it('rejects an authoritative subscription whose customer differs from the EventBridge event', async () => {
    const subscriptionId = `sub_customer_mismatch_${randomUUID()}`
    const eventCustomerId = `cus_event_${randomUUID()}`
    mockGetStripeCustomer.mockResolvedValue({ metadata: { userId: randomUUID() } } as never)
    mockGetStripeSubscription.mockResolvedValue({
      id: subscriptionId,
      customer: `cus_authoritative_${randomUUID()}`,
    } as never)

    await expect(
      ensureMembershipFromStripeSubscription(
        `evt_customer_mismatch_${randomUUID()}`,
        subscriptionId,
        eventCustomerId,
      ),
    ).rejects.toThrow('customer does not match the event customer')
  })

  it('uses Stripe livemode to isolate test subscription identity', async () => {
    const member = await createTestUser()
    const applicationContext = { applicationId: `membership-sync-identity-${randomUUID()}` }
    const sku = await createTestSku({
      plan: 'plus',
      provider_environment: 'test',
      provider_application_id: applicationContext.applicationId,
    })
    const subscriptionId = `sub_testmode_${member.id}`
    const customerId = `cus_testmode_${member.id}`
    const eventId = `evt_testmode_${member.id}`
    await insertStripeEvent(makeSubscriptionEvent(eventId, subscriptionId))

    mockGetStripeCustomer.mockResolvedValue({ metadata: { userId: member.id } } as never)
    mockGetStripeSubscription.mockResolvedValue({
      id: subscriptionId,
      livemode: false,
      status: 'active',
      cancel_at_period_end: false,
      items: {
        data: [{ price: { id: sku.stripe_price_id, unit_amount: 1_000, currency: 'usd' } }],
      },
    } as never)

    await ensureMembershipFromStripeSubscription(
      eventId,
      subscriptionId,
      customerId,
      applicationContext,
    )

    await expect(
      getMembershipByStripeSubscriptionId(
        getStripeMembershipSourceIdentity({
          stripeSubscriptionId: subscriptionId,
          providerEnvironment: 'test',
          providerApplicationId: applicationContext.applicationId,
        }),
      ),
    ).resolves.toMatchObject({ user_id: member.id, sku: { id: sku.id } })
    await expect(
      getMembershipByStripeSubscriptionId(
        getStripeMembershipSourceIdentity({ stripeSubscriptionId: subscriptionId }),
      ),
    ).resolves.toBeNull()
  })

  it('does not fall back to customer metadata when subscription intent correlation is invalid', async () => {
    const member = await createTestUser()
    const sku = await createTestSku({
      provider_environment: 'test',
      provider_application_id: 'voucha-web',
    })
    const subscriptionId = `sub_invalid_intent_${randomUUID()}`
    const customerId = `cus_invalid_intent_${randomUUID()}`
    mockGetStripeCustomer.mockResolvedValue({ metadata: { userId: member.id } } as never)
    mockGetStripeSubscription.mockResolvedValue({
      id: subscriptionId,
      customer: customerId,
      livemode: false,
      status: 'active',
      cancel_at_period_end: false,
      metadata: { membership_purchase_intent_id: randomUUID() },
      items: { data: [{ price: { id: sku.stripe_price_id } }] },
    } as never)

    await expect(
      ensureMembershipFromStripeSubscription(
        `evt_invalid_intent_${randomUUID()}`,
        subscriptionId,
        customerId,
      ),
    ).rejects.toThrow('has an invalid purchase intent')
  })
})

function makeSubscriptionEvent(id: string, subscriptionId: string) {
  return {
    id,
    object: 'event',
    api_version: '2025-09-30.clover',
    created: 1_741_398_400,
    data: { object: { id: subscriptionId, object: 'subscription' } },
    livemode: false,
    pending_webhooks: 1,
    request: null,
    type: 'customer.subscription.updated',
  } as never
}

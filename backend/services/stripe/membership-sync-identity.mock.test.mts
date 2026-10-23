import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestSku, createTestUser } from '@voucha/test-helpers'
import { seedMembershipPurchaseIntentForRetention } from '@voucha/test-helpers/payment-operation-retention'
import { createStripeEvent } from '@voucha/test-helpers/membership-stripe-fixtures'
import { getMembershipByStripeSubscriptionId } from '@services/memberships'
import { getStripeMembershipSourceIdentity } from '@services/memberships/create-types'
import { insertStripeEvent } from './insert-event.mts'

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
import { handleInvoicePaid } from './event-subscription-handlers.mts'

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

  it('resolves an old live subscription intent for an invoice.paid renewal', async () => {
    const member = await createTestUser()
    const applicationContext = { applicationId: `renewal-intent-${randomUUID()}` }
    const sku = await createTestSku({
      plan: 'plus',
      provider_environment: 'test',
      provider_application_id: applicationContext.applicationId,
    })
    const now = new Date()
    const createdAt = new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000)
    const intentId = await seedMembershipPurchaseIntentForRetention(
      {
        applicationId: applicationContext.applicationId,
        mappingId: sku.membership_provider_product_id,
        productId: sku.id,
        requestFingerprint: 'a'.repeat(64),
        userId: member.id,
      },
      createdAt,
      new Date(createdAt.getTime() + 30 * 60 * 1000),
      'launched',
      { checkoutId: `cs_live_${randomUUID()}` },
    )
    const subscriptionId = `sub_renewal_${randomUUID()}`
    const customerId = `cus_renewal_${randomUUID()}`
    mockGetStripeCustomer.mockResolvedValue({ metadata: { userId: randomUUID() } } as never)
    mockGetStripeSubscription.mockResolvedValue({
      id: subscriptionId,
      customer: customerId,
      livemode: false,
      status: 'active',
      cancel_at_period_end: false,
      metadata: { membership_purchase_intent_id: intentId },
      items: {
        data: [{ price: { id: sku.stripe_price_id, unit_amount: 1_000, currency: 'usd' } }],
      },
    } as never)
    const initialEventId = `evt_initial_${randomUUID()}`
    await insertStripeEvent(makeSubscriptionEvent(initialEventId, subscriptionId))
    await ensureMembershipFromStripeSubscription(
      initialEventId,
      subscriptionId,
      customerId,
      applicationContext,
    )

    const renewalEvent = createStripeEvent('invoice.paid', {
      subscription: subscriptionId,
      customer: customerId,
    })
    await insertStripeEvent(renewalEvent)
    await handleInvoicePaid(
      renewalEvent.id,
      { subscription: subscriptionId, customer: customerId },
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
    ).resolves.toMatchObject({ user_id: member.id })
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

import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createRetiredTestSku,
  createTestMembership,
  createTestSku,
  createTestUser,
  getTestMembershipRaw,
  retireTestMembershipProviderProduct,
} from '@voucha/test-helpers'
import {
  createMembership,
  getMembershipByStripeSubscriptionId,
  grantMembership,
} from '@services/memberships'
import {
  getStripeMembershipSourceIdentity,
  type StripeMembershipApplicationContext,
} from '@services/memberships/create-types'
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
import {
  ensureMembershipFromStripeSubscription,
  syncMembershipFromStripeSubscription,
} from './membership-sync.mts'

const mockGetStripeCustomer = vi.mocked(getStripeCustomer)
const mockGetStripeSubscription = vi.mocked(getStripeSubscription)
const applicationContext: StripeMembershipApplicationContext = {
  applicationId: `stripe-retired-catalog-${randomUUID()}`,
}

describe('retired Stripe membership catalog', () => {
  beforeEach(() => vi.clearAllMocks())

  it('reactivates an existing source after its catalog product retires', async () => {
    const admin = await createTestUser({ administrator: true })
    const member = await createTestUser()
    const grantSku = await createTestSku({ plan: 'plus' })
    await grantMembership(admin.id, member.id, 'plus', grantSku.id, 30)
    // A dedicated, already-retired product (not the shared active plan/interval fixture other
    // suites depend on) — this test needs the *catalog entry* retired, not just the price mapping.
    const directSku = await createRetiredTestSku({
      plan: 'pro',
      provider_application_id: applicationContext.applicationId,
      provider_environment: 'production',
    })
    const subscriptionId = `sub_retired_catalog_${member.id}`
    const customerId = `cus_retired_catalog_${member.id}`
    const activeEventId = `evt_retired_catalog_reactivate_${member.id}`
    const direct = await createTestMembership({
      user_id: member.id,
      plan: 'pro',
      sku_id: directSku.id,
      status: 'paused',
      stripe_subscription_id: subscriptionId,
      stripe_customer_id: customerId,
      provider_environment: 'production',
      provider_application_id: applicationContext.applicationId,
    })
    mockGetStripeCustomer.mockResolvedValue({ metadata: { userId: member.id } } as never)
    mockGetStripeSubscription.mockResolvedValue({
      id: subscriptionId,
      livemode: true,
      status: 'active',
      cancel_at_period_end: false,
      items: {
        data: [{ price: { id: directSku.stripe_price_id, unit_amount: 1_000, currency: 'usd' } }],
      },
    } as never)
    await insertStripeEvent(makeSubscriptionEvent(activeEventId, subscriptionId))

    await ensureMembershipFromStripeSubscription(
      activeEventId,
      subscriptionId,
      customerId,
      applicationContext,
    )

    await expect(
      getMembershipByStripeSubscriptionId(
        getStripeMembershipSourceIdentity({
          stripeSubscriptionId: subscriptionId,
          providerApplicationId: applicationContext.applicationId,
        }),
      ),
    ).resolves.toMatchObject({ id: direct.id, plan: 'pro', status: 'active' })
    await expect(getTestMembershipRaw(direct.id)).resolves.toMatchObject({
      sku_id: directSku.id,
      paused_at: null,
      source_paused_at: null,
      projection_ended_at: null,
    })
  })

  it('cancels an existing source after Stripe transitions it to a different retired product', async () => {
    const member = await createTestUser()
    const initialSku = await createTestSku({
      plan: 'plus',
      provider_application_id: applicationContext.applicationId,
    })
    const transitionedSku = await createRetiredTestSku({
      plan: 'pro',
      provider_application_id: applicationContext.applicationId,
      provider_environment: 'production',
    })
    const subscriptionId = `sub_retired_transition_${member.id}`
    const direct = await createMembership({
      userId: member.id,
      plan: initialSku.plan,
      skuId: initialSku.id,
      stripeSubscriptionId: subscriptionId,
      stripeCustomerId: `cus_retired_transition_${member.id}`,
      providerApplicationId: applicationContext.applicationId,
    })
    const endedAt = new Date(Math.ceil(Date.now() / 1000) * 1000)
    const eventId = `evt_retired_transition_${member.id}`
    await insertStripeEvent(makeSubscriptionEvent(eventId, subscriptionId))
    mockGetStripeSubscription.mockResolvedValue({
      id: subscriptionId,
      livemode: true,
      status: 'canceled',
      cancel_at_period_end: false,
      ended_at: endedAt.getTime() / 1000,
      items: {
        data: [
          { price: { id: transitionedSku.stripe_price_id, unit_amount: 1_000, currency: 'usd' } },
        ],
      },
    } as never)

    await expect(
      syncMembershipFromStripeSubscription(eventId, subscriptionId, applicationContext),
    ).resolves.toBeTruthy()
    await expect(getTestMembershipRaw(direct.id)).resolves.toMatchObject({
      sku_id: transitionedSku.id,
      cancelled_at: endedAt,
      source_cancelled_at: endedAt,
    })
  })

  it('does not admit a new source through a retired Stripe price mapping', async () => {
    const member = await createTestUser()
    const sku = await createTestSku({
      plan: 'pro',
      provider_application_id: applicationContext.applicationId,
    })
    const subscriptionId = `sub_retired_price_new_${member.id}`
    const customerId = `cus_retired_price_new_${member.id}`
    await retireTestMembershipProviderProduct(sku.membership_provider_product_id)
    mockGetStripeCustomer.mockResolvedValue({ metadata: { userId: member.id } } as never)
    mockGetStripeSubscription.mockResolvedValue({
      status: 'active',
      cancel_at_period_end: false,
      items: { data: [{ price: { id: sku.stripe_price_id } }] },
    } as never)

    await expect(
      ensureMembershipFromStripeSubscription(
        `evt_retired_price_new_${member.id}`,
        subscriptionId,
        customerId,
        applicationContext,
      ),
    ).rejects.toThrow(`Unmapped Stripe price ID: ${sku.stripe_price_id}`)
    await expect(
      getMembershipByStripeSubscriptionId(
        getStripeMembershipSourceIdentity({
          stripeSubscriptionId: subscriptionId,
          providerApplicationId: applicationContext.applicationId,
        }),
      ),
    ).resolves.toBeNull()
  })

  it('ignores an unmapped retired subscription with no local source during sync', async () => {
    const sku = await createTestSku({
      plan: 'pro',
      provider_application_id: applicationContext.applicationId,
    })
    await retireTestMembershipProviderProduct(sku.membership_provider_product_id)
    mockGetStripeSubscription.mockResolvedValue({
      status: 'active',
      cancel_at_period_end: false,
      items: { data: [{ price: { id: sku.stripe_price_id } }] },
    } as never)

    await expect(
      syncMembershipFromStripeSubscription(
        `evt_unmapped_sync_${randomUUID()}`,
        `sub_unmapped_${randomUUID()}`,
        applicationContext,
      ),
    ).resolves.toBeNull()
  })
})

function makeSubscriptionEvent(id: string, subscriptionId: string) {
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
  } as never
}

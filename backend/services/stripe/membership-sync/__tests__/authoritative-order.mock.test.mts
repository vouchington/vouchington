import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type Stripe from 'stripe'
import {
  createTestSku,
  createTestUser,
  runTestActionWhileMembershipUserLocked,
} from '@voucha/test-helpers'
import { createMembership, getMembershipByStripeSubscriptionId } from '@services/memberships'
import {
  getStripeMembershipSourceIdentity,
  type StripeMembershipApplicationContext,
} from '@services/memberships/create-types'
import { insertStripeEvent } from '../../events.mts'

vi.mock<typeof import('@modules/stripe/subscriptions')>(
  import('@modules/stripe/subscriptions'),
  async importOriginal => ({
    ...(await importOriginal()),
    getStripeSubscription: vi.fn<VitestLooseMock>(),
  }),
)

vi.mock<typeof import('@modules/stripe/customers')>(
  import('@modules/stripe/customers'),
  async importOriginal => ({
    ...(await importOriginal()),
    getStripeCustomer: vi.fn<VitestLooseMock>(),
  }),
)

import { getStripeCustomer } from '@modules/stripe/customers'
import { getStripeSubscription } from '@modules/stripe/subscriptions'
import {
  ensureMembershipFromStripeSubscription,
  syncMembershipFromStripeSubscription,
} from '../../membership-sync.mts'

const mockGetStripeCustomer = vi.mocked(getStripeCustomer)
const mockGetStripeSubscription = vi.mocked(getStripeSubscription)
const applicationContext: StripeMembershipApplicationContext = {
  applicationId: `stripe-authoritative-order-${randomUUID()}`,
}

describe('Stripe membership sync authoritative observation order', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.useRealTimers())

  it('admits the current past-due snapshot fetched for an older EventBridge receipt', async () => {
    const user = await createTestUser()
    const sku = await createTestSku({
      plan: 'pro',
      provider_application_id: applicationContext.applicationId,
    })
    const subscriptionId = `sub_current_snapshot_${randomUUID()}`
    await createMembership({
      userId: user.id,
      plan: 'pro',
      skuId: sku.id,
      stripeSubscriptionId: subscriptionId,
      stripeCustomerId: `cus_current_snapshot_${randomUUID()}`,
      providerApplicationId: applicationContext.applicationId,
    })
    const laterEvent = makeStripeEvent(`evt_later_snapshot_${randomUUID()}`, subscriptionId, 200)
    const olderRetry = makeStripeEvent(`evt_older_retry_${randomUUID()}`, subscriptionId, 100)
    await Promise.all([insertStripeEvent(laterEvent), insertStripeEvent(olderRetry)])
    mockGetStripeSubscription
      .mockResolvedValueOnce(makeSubscription(subscriptionId, sku.stripe_price_id, 'active'))
      .mockResolvedValueOnce(makeSubscription(subscriptionId, sku.stripe_price_id, 'past_due'))

    await syncMembershipFromStripeSubscription(laterEvent.id, subscriptionId, applicationContext)
    await syncMembershipFromStripeSubscription(olderRetry.id, subscriptionId, applicationContext)

    await expect(
      getMembershipByStripeSubscriptionId(
        getStripeMembershipSourceIdentity({
          stripeSubscriptionId: subscriptionId,
          providerApplicationId: applicationContext.applicationId,
        }),
      ),
    ).resolves.toMatchObject({ status: 'past_due', past_due_at: expect.any(Date) })
  })

  it('preserves fetch order when the older receipt waits on the membership lock', async () => {
    vi.useFakeTimers()
    const user = await createTestUser()
    const sku = await createTestSku({
      plan: 'pro',
      provider_application_id: applicationContext.applicationId,
    })
    const subscriptionId = `sub_fetch_order_${randomUUID()}`
    await createMembership({
      userId: user.id,
      plan: 'pro',
      skuId: sku.id,
      stripeSubscriptionId: subscriptionId,
      stripeCustomerId: `cus_fetch_order_${randomUUID()}`,
      providerApplicationId: applicationContext.applicationId,
    })
    const laterEvent = makeStripeEvent(`evt_later_fetch_${randomUUID()}`, subscriptionId, 200)
    const olderRetry = makeStripeEvent(`evt_older_fetch_${randomUUID()}`, subscriptionId, 100)
    await Promise.all([insertStripeEvent(laterEvent), insertStripeEvent(olderRetry)])
    const olderFetchAt = new Date('2030-01-01T00:00:00.000Z')
    const laterFetchAt = new Date('2030-01-01T00:00:01.000Z')
    vi.setSystemTime(laterFetchAt)
    mockGetStripeSubscription.mockResolvedValueOnce(
      makeSubscription(subscriptionId, sku.stripe_price_id, 'active'),
    )
    await syncMembershipFromStripeSubscription(laterEvent.id, subscriptionId, applicationContext)

    vi.setSystemTime(olderFetchAt)
    mockGetStripeSubscription.mockResolvedValueOnce(
      makeSubscription(subscriptionId, sku.stripe_price_id, 'past_due'),
    )
    await runTestActionWhileMembershipUserLocked({
      userId: user.id,
      lockingQueryComment:
        '/* recordStripeMembershipProviderFacts: lock user before source state */',
      startAction: () =>
        syncMembershipFromStripeSubscription(olderRetry.id, subscriptionId, applicationContext),
      whileActionBlocked: async () => {
        vi.setSystemTime(new Date('2030-01-01T00:00:02.000Z'))
      },
    })

    await expect(
      getMembershipByStripeSubscriptionId(
        getStripeMembershipSourceIdentity({
          stripeSubscriptionId: subscriptionId,
          providerApplicationId: applicationContext.applicationId,
        }),
      ),
    ).resolves.toMatchObject({ status: 'active', past_due_at: null })
  })

  it('preserves fetch order in the existing-source ensure path', async () => {
    vi.useFakeTimers()
    const user = await createTestUser()
    const sku = await createTestSku({
      plan: 'pro',
      provider_application_id: applicationContext.applicationId,
    })
    const subscriptionId = `sub_ensure_fetch_order_${randomUUID()}`
    const customerId = `cus_ensure_fetch_order_${randomUUID()}`
    await createMembership({
      userId: user.id,
      plan: 'pro',
      skuId: sku.id,
      stripeSubscriptionId: subscriptionId,
      stripeCustomerId: customerId,
      providerApplicationId: applicationContext.applicationId,
    })
    const laterEvent = makeStripeEvent(`evt_later_ensure_${randomUUID()}`, subscriptionId, 200)
    const olderRetry = makeStripeEvent(`evt_older_ensure_${randomUUID()}`, subscriptionId, 100)
    await Promise.all([insertStripeEvent(laterEvent), insertStripeEvent(olderRetry)])
    mockGetStripeCustomer.mockResolvedValue({ metadata: { userId: user.id } } as never)
    vi.setSystemTime(new Date('2030-01-01T00:00:01.000Z'))
    mockGetStripeSubscription.mockResolvedValueOnce(
      makeSubscription(subscriptionId, sku.stripe_price_id, 'active'),
    )
    await ensureMembershipFromStripeSubscription(
      laterEvent.id,
      subscriptionId,
      customerId,
      applicationContext,
    )

    vi.setSystemTime(new Date('2030-01-01T00:00:00.000Z'))
    mockGetStripeSubscription.mockResolvedValueOnce(
      makeSubscription(subscriptionId, sku.stripe_price_id, 'past_due'),
    )
    await runTestActionWhileMembershipUserLocked({
      userId: user.id,
      lockingQueryComment:
        '/* recordStripeMembershipProviderFacts: lock user before source state */',
      startAction: () =>
        ensureMembershipFromStripeSubscription(
          olderRetry.id,
          subscriptionId,
          customerId,
          applicationContext,
        ),
      whileActionBlocked: async () => {
        vi.setSystemTime(new Date('2030-01-01T00:00:02.000Z'))
      },
    })

    await expect(
      getMembershipByStripeSubscriptionId(
        getStripeMembershipSourceIdentity({
          stripeSubscriptionId: subscriptionId,
          providerApplicationId: applicationContext.applicationId,
        }),
      ),
    ).resolves.toMatchObject({ status: 'active', past_due_at: null })
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
  status: 'active' | 'past_due',
): Stripe.Response<Stripe.Subscription> {
  return {
    id,
    object: 'subscription',
    livemode: true,
    status,
    cancel_at_period_end: false,
    start_date: 1_741_398_400,
    items: { data: [{ price: { id: priceId, unit_amount: 1_000, currency: 'usd' } }] },
    current_period_start: 1_741_398_400,
    current_period_end: 1_744_076_800,
  } as unknown as Stripe.Response<Stripe.Subscription>
}

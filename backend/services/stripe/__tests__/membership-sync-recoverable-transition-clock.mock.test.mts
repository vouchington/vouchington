import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createTestMembership,
  createTestSku,
  createTestUser,
  getTestMembershipGrant,
  getTestMembershipRaw,
  setStripeEventReceivedAtForTest,
} from '@voucha/test-helpers'
import { grantMembership } from '@services/memberships'
import { getStripeEventByStripeEventId, insertStripeEvent } from '../events.mts'

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
import { ensureMembershipFromStripeSubscription } from '../membership-sync.mts'

const mockGetStripeCustomer = vi.mocked(getStripeCustomer)
const mockGetStripeSubscription = vi.mocked(getStripeSubscription)
const applicationContext = { applicationId: `stripe-recoverable-clock-${randomUUID()}` }

describe('recoverable Stripe membership transition clocks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it.each(['unpaid', 'incomplete'] as const)(
    'does not retroactively consume a queued grant for delayed %s evidence',
    async stripeStatus => {
      const administrator = await createTestUser({ administrator: true })
      const member = await createTestUser()
      const directSku = await createTestSku({
        plan: 'pro',
        provider_application_id: applicationContext.applicationId,
      })
      const grantSku = await createTestSku({ plan: 'plus' })
      const subscriptionId = `sub_recoverable_clock_${randomUUID()}`
      const customerId = `cus_recoverable_clock_${randomUUID()}`
      const direct = await createTestMembership({
        user_id: member.id,
        plan: 'pro',
        sku_id: directSku.id,
        stripe_subscription_id: subscriptionId,
        stripe_customer_id: customerId,
        provider_application_id: applicationContext.applicationId,
        provider_environment: 'production',
      })
      const grant = await grantMembership(administrator.id, member.id, 'plus', grantSku.id, 30)
      expect(grant.queued).toBe(true)
      const eventId = `evt_recoverable_clock_${randomUUID()}`
      await insertStripeEvent(makeSubscriptionEvent(eventId, subscriptionId))
      await setStripeEventReceivedAtForTest(eventId, new Date('2024-01-01T00:00:00.000Z'))
      mockGetStripeCustomer.mockResolvedValue({ metadata: { userId: member.id } } as never)
      mockGetStripeSubscription.mockResolvedValue(
        makeSubscription(subscriptionId, directSku.stripe_price_id, stripeStatus),
      )
      const fetchStartedAt = new Date()

      await ensureMembershipFromStripeSubscription(
        eventId,
        subscriptionId,
        customerId,
        applicationContext,
      )

      const [event, rawDirect, activatedGrant] = await Promise.all([
        getStripeEventByStripeEventId(eventId),
        getTestMembershipRaw(direct.id),
        getTestMembershipGrant(grant.grantId),
      ])
      if (!event || !rawDirect || !activatedGrant?.activation_started_at)
        throw new Error('Expected an EventBridge receipt, direct projection, and activated grant')
      expect(event.received_at.getTime()).toBeLessThan(fetchStartedAt.getTime())
      expect(activatedGrant.activation_started_at).toBeInstanceOf(Date)
      expect(activatedGrant.activation_started_at.getTime()).toBeGreaterThanOrEqual(
        fetchStartedAt.getTime(),
      )
      const directTransitionAt =
        stripeStatus === 'unpaid' ? rawDirect.cancelled_at : rawDirect.expired_at
      expect(directTransitionAt?.getTime()).toBeGreaterThanOrEqual(fetchStartedAt.getTime())
      const retryEventId = `evt_recoverable_clock_retry_${randomUUID()}`
      await insertStripeEvent(makeSubscriptionEvent(retryEventId, subscriptionId))
      await setStripeEventReceivedAtForTest(retryEventId, new Date('2024-01-02T00:00:00.000Z'))

      await ensureMembershipFromStripeSubscription(
        retryEventId,
        subscriptionId,
        customerId,
        applicationContext,
      )

      const retriedDirect = await getTestMembershipRaw(direct.id)
      const retriedTransitionAt =
        stripeStatus === 'unpaid' ? retriedDirect?.cancelled_at : retriedDirect?.expired_at
      expect(retriedTransitionAt).toEqual(directTransitionAt)
    },
  )
})

function makeSubscription(subscriptionId: string, skuId: string, status: 'unpaid' | 'incomplete') {
  return {
    id: subscriptionId,
    livemode: true,
    status,
    cancel_at_period_end: false,
    items: { data: [{ price: { id: skuId, unit_amount: 1_000, currency: 'usd' } }] },
  } as never
}

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

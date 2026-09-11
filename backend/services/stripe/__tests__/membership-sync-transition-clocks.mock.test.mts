import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createTestSku,
  createTestUser,
  getTestMembershipRaw,
  setStripeEventReceivedAtForTest,
} from '@voucha/test-helpers'
import { createMembership } from '@services/memberships'
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
const subscriptionStartedAt = new Date('2020-01-01T00:00:00.000Z')
const subscriptionExpiresAt = new Date('2030-01-01T00:00:00.000Z')
const applicationContext = { applicationId: `stripe-transition-clock-${randomUUID()}` }

describe('existing Stripe membership transition clocks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it.each(['canceled'] as const)(
    'records %s without inventing a provider terminal timestamp',
    async stripeStatus => {
      const { membership, sku, subscriptionId } = await createExistingMembership()
      const eventId = `evt_missing_terminal_${randomUUID()}`
      await insertStripeEvent(makeSubscriptionEvent(eventId, subscriptionId))
      const event = await getStripeEventByStripeEventId(eventId)
      mockSubscription({ subscriptionId, skuId: sku.stripe_price_id, status: stripeStatus })

      await ensureMembershipFromStripeSubscription(
        eventId,
        subscriptionId,
        `cus_missing_terminal_${randomUUID()}`,
        applicationContext,
      )

      const raw = (await getTestMembershipRaw(membership.id))!
      expect(raw.cancelled_at).toBeInstanceOf(Date)
      expect(raw.source_cancelled_at).toBeInstanceOf(Date)
      expect(raw.cancelled_at).toEqual(event?.received_at)
      expect(raw.source_cancelled_at).toEqual(event?.received_at)
    },
  )

  it.each([
    ['past_due', 'past_due_at', 'source_past_due_at'],
    ['paused', 'paused_at', 'source_paused_at'],
  ] as const)(
    'records %s when it is observed rather than at the subscription start',
    async (stripeStatus, lifecycleColumn, sourceLifecycleColumn) => {
      const { membership, sku, subscriptionId } = await createExistingMembership()
      const eventId = `evt_${stripeStatus}_${randomUUID()}`
      await insertStripeEvent(makeSubscriptionEvent(eventId, subscriptionId))
      await setStripeEventReceivedAtForTest(eventId, new Date('2024-01-01T00:00:00.000Z'))
      const event = await getStripeEventByStripeEventId(eventId)
      mockSubscription({
        subscriptionId,
        skuId: sku.stripe_price_id,
        status: stripeStatus,
        startDate: subscriptionStartedAt,
      })

      await ensureMembershipFromStripeSubscription(
        eventId,
        subscriptionId,
        `cus_${stripeStatus}_${randomUUID()}`,
        applicationContext,
      )

      const raw = (await getTestMembershipRaw(membership.id))!
      expect(raw[lifecycleColumn]).toBeInstanceOf(Date)
      expect(raw[sourceLifecycleColumn]).toBeInstanceOf(Date)
      expect(raw[lifecycleColumn]!.getTime()).toBeGreaterThan(event!.received_at.getTime())
      expect(raw[sourceLifecycleColumn]).toEqual(raw[lifecycleColumn])
    },
  )
})

async function createExistingMembership() {
  const member = await createTestUser()
  const sku = await createTestSku({
    plan: 'plus',
    provider_application_id: applicationContext.applicationId,
  })
  const subscriptionId = `sub_transition_clock_${randomUUID()}`
  const membership = await createMembership({
    userId: member.id,
    plan: 'plus',
    skuId: sku.id,
    effectiveAt: subscriptionStartedAt,
    expiresAt: subscriptionExpiresAt,
    stripeSubscriptionId: subscriptionId,
    stripeCustomerId: `cus_transition_clock_${randomUUID()}`,
    providerApplicationId: applicationContext.applicationId,
  })
  mockGetStripeCustomer.mockResolvedValue({ metadata: { userId: member.id } } as never)
  return { membership, sku, subscriptionId }
}

function mockSubscription(options: {
  subscriptionId: string
  skuId: string
  status: 'canceled' | 'unpaid' | 'past_due' | 'paused'
  startDate?: Date
}) {
  mockGetStripeSubscription.mockResolvedValue({
    id: options.subscriptionId,
    livemode: true,
    status: options.status,
    cancel_at_period_end: false,
    ...(options.startDate ? { start_date: options.startDate.getTime() / 1000 } : {}),
    items: {
      data: [{ price: { id: options.skuId, unit_amount: 1_000, currency: 'usd' } }],
    },
  } as never)
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

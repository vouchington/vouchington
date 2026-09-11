import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createTestMembership,
  createTestSku,
  createTestUser,
  getTestMembershipRaw,
} from '@voucha/test-helpers'
import { getMembershipHistory } from '@services/memberships'
import { insertStripeEvent } from '@services/stripe/events'

vi.mock<typeof import('@modules/stripe/subscriptions')>(
  import('@modules/stripe/subscriptions'),
  async importOriginal => ({
    ...(await importOriginal()),
    getStripeSubscription: vi.fn<VitestLooseMock>(),
  }),
)

import { getStripeSubscription } from '@modules/stripe/subscriptions'
import {
  handleSubscriptionDeleted,
  handleSubscriptionUpdated,
} from '../webhook-subscription-handlers.mts'
import { makeStripeSubscriptionEvent } from '../test-helpers/membership-sync-event.mts'

const mockGetStripeSubscription = vi.mocked(getStripeSubscription)
const applicationContext = { applicationId: `stripe-terminal-handler-${randomUUID()}` }

describe('terminal membership subscription webhook handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('ignores stale deletion and update events around an authoritative terminal subscription', async () => {
    const member = await createTestUser()
    const sku = await createTestSku({
      plan: 'plus',
      provider_application_id: applicationContext.applicationId,
    })
    const subscriptionId = uniqueStripeId('sub')
    const membership = await createProductionStripeMembership({
      user_id: member.id,
      sku_id: sku.id,
      stripe_subscription_id: subscriptionId,
    })
    const lapsedUserIds: string[] = []
    mockGetStripeSubscription.mockResolvedValue(
      stripeSubscription(subscriptionId, 'active', sku.stripe_price_id),
    )
    const activeEventId = uniqueStripeId('evt')
    await insertStripeMembershipEvent(activeEventId, subscriptionId)
    await handleSubscriptionDeleted(
      activeEventId,
      { id: subscriptionId },
      userId => {
        lapsedUserIds.push(userId)
      },
      applicationContext,
    )
    expect(lapsedUserIds).toEqual([])
    mockGetStripeSubscription.mockResolvedValue(
      stripeSubscription(subscriptionId, 'canceled', sku.stripe_price_id),
    )
    const terminalEventId = uniqueStripeId('evt')
    await insertStripeMembershipEvent(terminalEventId, subscriptionId)
    await handleSubscriptionDeleted(
      terminalEventId,
      { id: subscriptionId },
      undefined,
      applicationContext,
    )
    const staleEventId = uniqueStripeId('evt')
    await insertStripeMembershipEvent(staleEventId, subscriptionId)
    await handleSubscriptionUpdated(
      staleEventId,
      { id: subscriptionId, status: 'active' },
      undefined,
      applicationContext,
    )
    await expect(getTestMembershipRaw(membership.id)).resolves.toMatchObject({
      status: 'cancelled',
    })
  })

  it('treats distinct terminal events for a retained source as no-ops', async () => {
    const member = await createTestUser()
    const sku = await createTestSku({
      plan: 'plus',
      provider_application_id: applicationContext.applicationId,
    })
    const subscriptionId = uniqueStripeId('sub')
    await createProductionStripeMembership({
      user_id: member.id,
      sku_id: sku.id,
      stripe_subscription_id: subscriptionId,
    })
    mockGetStripeSubscription.mockResolvedValue(
      stripeSubscription(subscriptionId, 'canceled', sku.stripe_price_id),
    )
    const lapsedUserIds: string[] = []
    const firstEventId = uniqueStripeId('evt')
    const repeatedTerminalEventId = uniqueStripeId('evt')
    await insertStripeMembershipEvent(firstEventId, subscriptionId)
    await insertStripeMembershipEvent(repeatedTerminalEventId, subscriptionId)
    await handleSubscriptionDeleted(
      firstEventId,
      { id: subscriptionId },
      userId => {
        lapsedUserIds.push(userId)
      },
      applicationContext,
    )
    await handleSubscriptionDeleted(
      repeatedTerminalEventId,
      { id: subscriptionId },
      userId => {
        lapsedUserIds.push(userId)
      },
      applicationContext,
    )
    expect(lapsedUserIds).toEqual([member.id])
    await expect(getMembershipHistory(member.id)).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ stripe_event_id: firstEventId })]),
    )
    await expect(getMembershipHistory(member.id)).resolves.not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ stripe_event_id: repeatedTerminalEventId }),
      ]),
    )
  })
})

async function insertStripeMembershipEvent(eventId: string, subscriptionId: string): Promise<void> {
  await insertStripeEvent(makeStripeSubscriptionEvent(eventId, subscriptionId))
}

function createProductionStripeMembership(options: Parameters<typeof createTestMembership>[0]) {
  return createTestMembership({
    ...options,
    provider_environment: 'production',
    provider_application_id: applicationContext.applicationId,
  })
}

function stripeSubscription(subscriptionId: string, status: string, priceId: string) {
  return {
    id: subscriptionId,
    livemode: true,
    status,
    cancel_at_period_end: false,
    items: { data: [{ price: { id: priceId, unit_amount: 500, currency: 'usd' } }] },
  } as never
}

function uniqueStripeId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}`
}

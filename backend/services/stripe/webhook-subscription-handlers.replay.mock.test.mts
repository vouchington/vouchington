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
import { handleInvoicePaymentFailure } from './webhook-subscription-handlers.mts'
import { makeStripeSubscriptionEvent } from './test-helpers/membership-sync-event.mts'

const mockGetStripeSubscription = vi.mocked(getStripeSubscription)
const applicationContext = { applicationId: `stripe-webhook-replay-${randomUUID()}` }

describe('replayed Stripe invoice payment failures', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not record repeated authoritative past_due events', async () => {
    const member = await createTestUser()
    const sku = await createTestSku({
      plan: 'plus',
      provider_application_id: applicationContext.applicationId,
    })
    const subscriptionId = `sub_replayed_past_due_${member.id}`
    const membership = await createTestMembership({
      user_id: member.id,
      sku_id: sku.id,
      stripe_subscription_id: subscriptionId,
      provider_environment: 'production',
      provider_application_id: applicationContext.applicationId,
    })
    const firstEventId = `evt_first_past_due_${member.id}`
    const repeatedEventId = `evt_repeated_past_due_${member.id}`
    const scheduledEventId = `evt_scheduled_past_due_${member.id}`
    mockGetStripeSubscription.mockResolvedValue(
      stripeSubscription(subscriptionId, sku.stripe_price_id, false),
    )

    await insertStripeMembershipEvent(firstEventId, subscriptionId)
    await insertStripeMembershipEvent(repeatedEventId, subscriptionId)
    await insertStripeMembershipEvent(scheduledEventId, subscriptionId)
    await handleInvoicePaymentFailure(
      firstEventId,
      { subscription: subscriptionId },
      applicationContext,
    )
    const afterFirstFailure = await getTestMembershipRaw(membership.id)
    await handleInvoicePaymentFailure(
      repeatedEventId,
      { subscription: subscriptionId },
      applicationContext,
    )
    mockGetStripeSubscription.mockResolvedValue(
      stripeSubscription(subscriptionId, sku.stripe_price_id, true),
    )
    await handleInvoicePaymentFailure(
      scheduledEventId,
      { subscription: subscriptionId },
      applicationContext,
    )
    const afterSchedule = await getTestMembershipRaw(membership.id)
    const history = await getMembershipHistory(member.id)

    expect(afterFirstFailure).toMatchObject({ status: 'past_due' })
    await expect(getTestMembershipRaw(membership.id)).resolves.toMatchObject({
      status: 'past_due',
      cancel_at_period_end: true,
      latest_change_id: afterSchedule?.latest_change_id,
    })
    expect(
      history.filter(change =>
        [firstEventId, repeatedEventId, scheduledEventId].includes(change.stripe_event_id ?? ''),
      ),
    ).toEqual([
      expect.objectContaining({ stripe_event_id: scheduledEventId }),
      expect.objectContaining({ stripe_event_id: firstEventId }),
    ])
    expect(afterSchedule?.latest_change_id).not.toBe(afterFirstFailure?.latest_change_id)
  })
})

async function insertStripeMembershipEvent(eventId: string, subscriptionId: string): Promise<void> {
  await insertStripeEvent(makeStripeSubscriptionEvent(eventId, subscriptionId))
}

function stripeSubscription(subscriptionId: string, priceId: string, cancelAtPeriodEnd: boolean) {
  return {
    id: subscriptionId,
    livemode: true,
    status: 'past_due',
    cancel_at_period_end: cancelAtPeriodEnd,
    items: { data: [{ price: { id: priceId, unit_amount: 500, currency: 'usd' } }] },
  } as never
}

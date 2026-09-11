import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import {
  createTestMembership,
  createTestSku,
  createTestUser,
  getTestMembershipRaw,
} from '@voucha/test-helpers'
import { insertStripeEvent } from './events.mts'

vi.mock<typeof import('@modules/stripe/subscriptions')>(
  import('@modules/stripe/subscriptions'),
  async importOriginal => ({
    ...(await importOriginal()),
    getStripeSubscription: vi.fn<VitestLooseMock>(),
  }),
)

import { getStripeSubscription } from '@modules/stripe/subscriptions'
import { handleCheckoutSessionPaymentFailure } from './webhook-subscription-handlers.mts'
import { makeStripeSubscriptionEvent } from './test-helpers/membership-sync-event.mts'

describe('handleCheckoutSessionPaymentFailure', () => {
  it('synchronizes the subscription in the supplied application context', async () => {
    const applicationContext = { applicationId: `stripe-checkout-failure-${randomUUID()}` }
    const user = await createTestUser()
    const sku = await createTestSku({
      plan: 'plus',
      provider_application_id: applicationContext.applicationId,
    })
    const subscriptionId = `sub_checkout_failure_${randomUUID()}`
    const eventId = `evt_checkout_failure_${randomUUID()}`
    const membership = await createTestMembership({
      user_id: user.id,
      sku_id: sku.id,
      stripe_subscription_id: subscriptionId,
      provider_application_id: applicationContext.applicationId,
      provider_environment: 'production',
    })
    await insertStripeEvent(makeStripeSubscriptionEvent(eventId, subscriptionId))
    vi.mocked(getStripeSubscription).mockResolvedValue({
      id: subscriptionId,
      livemode: true,
      status: 'past_due',
      cancel_at_period_end: false,
      items: {
        data: [{ price: { id: sku.stripe_price_id, unit_amount: 1_000, currency: 'usd' } }],
      },
    } as never)

    await handleCheckoutSessionPaymentFailure(
      eventId,
      { subscription: subscriptionId },
      applicationContext,
    )

    expect(getStripeSubscription).toHaveBeenCalledWith(subscriptionId)
    await expect(getTestMembershipRaw(membership.id)).resolves.toMatchObject({ status: 'past_due' })
  })
})

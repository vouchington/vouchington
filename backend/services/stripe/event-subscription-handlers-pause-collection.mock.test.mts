import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createTestMembership,
  createTestSku,
  createTestUser,
  getTestMembershipRaw,
} from '@voucha/test-helpers'
import { getUserActivePlan } from '@services/memberships'
import { insertStripeEvent } from './insert-event.mts'

vi.mock<typeof import('@modules/stripe/subscriptions')>(
  import('@modules/stripe/subscriptions'),
  async importOriginal => ({
    ...(await importOriginal()),
    getStripeSubscription: vi.fn<VitestLooseMock>(),
  }),
)

import { getStripeSubscription } from '@modules/stripe/subscriptions'
import { handleSubscriptionUpdated } from './event-subscription-handlers.mts'
import { makeStripeSubscriptionEvent } from '@voucha/test-helpers/services/stripe/membership-sync-event'

const mockGetStripeSubscription = vi.mocked(getStripeSubscription)
const applicationContext = { applicationId: `stripe-pause-collection-${randomUUID()}` }

describe('pause collection on an active Stripe subscription', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('leaves the membership active when a replayed update carries pause_collection void', async () => {
    const member = await createTestUser()
    const sku = await createTestSku({
      plan: 'plus',
      provider_environment: 'production',
      provider_application_id: applicationContext.applicationId,
    })
    const subscriptionId = `sub_${randomUUID()}`
    const membership = await createTestMembership({
      user_id: member.id,
      plan: 'plus',
      sku_id: sku.id,
      stripe_subscription_id: subscriptionId,
      provider_environment: 'production',
      provider_application_id: applicationContext.applicationId,
    })
    mockGetStripeSubscription.mockResolvedValue({
      id: subscriptionId,
      livemode: true,
      status: 'active',
      cancel_at_period_end: false,
      pause_collection: { behavior: 'void' },
      items: {
        data: [{ price: { id: sku.stripe_price_id, unit_amount: 500, currency: 'usd' } }],
      },
    } as never)
    const eventId = `evt_${randomUUID()}`
    await insertStripeEvent(makeStripeSubscriptionEvent(eventId, subscriptionId))
    const eventData = {
      id: subscriptionId,
      status: 'active',
      pause_collection: { behavior: 'void' },
    }

    await handleSubscriptionUpdated(eventId, eventData, undefined, applicationContext)
    await handleSubscriptionUpdated(eventId, eventData, undefined, applicationContext)

    await expect(getTestMembershipRaw(membership.id)).resolves.toMatchObject({
      status: 'active',
      paused_at: null,
    })
    await expect(getUserActivePlan(member.id)).resolves.toBe('plus')
  })
})

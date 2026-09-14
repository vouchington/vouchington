import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createTestSku,
  createTestUser,
  getTestMembershipRaw,
  getTestMembershipSourceState,
} from '@voucha/test-helpers'
import { getMembershipByStripeSubscriptionId, getMembershipHistory } from '@services/memberships'
import { getStripeMembershipSourceIdentity } from '@services/memberships/create-types'
import { insertStripeEvent } from '../../events.mts'
import { makeStripeSubscriptionEvent } from '../../../../test-helpers/services/stripe/membership-sync-event.mts'

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
import { ensureMembershipFromStripeSubscription } from '../../membership-sync.mts'

const mockGetStripeCustomer = vi.mocked(getStripeCustomer)
const mockGetStripeSubscription = vi.mocked(getStripeSubscription)
const applicationContext = { applicationId: `stripe-initial-renewal-${randomUUID()}` }

describe('initial Stripe renewal decision', () => {
  beforeEach(() => vi.clearAllMocks())

  it('persists the accepted scheduled cancellation in source, projection, and audit', async () => {
    const user = await createTestUser()
    const sku = await createTestSku({
      plan: 'plus',
      provider_application_id: applicationContext.applicationId,
    })
    const subscriptionId = `sub_initial_cancel_at_${randomUUID()}`
    const customerId = `cus_initial_cancel_at_${randomUUID()}`
    const eventId = `evt_initial_cancel_at_${randomUUID()}`
    const periodStart = 1_893_456_000
    const periodEnd = 1_896_134_400
    await insertStripeEvent(makeStripeSubscriptionEvent(eventId, subscriptionId))
    mockGetStripeCustomer.mockResolvedValue({ metadata: { userId: user.id } } as never)
    mockGetStripeSubscription.mockResolvedValue({
      id: subscriptionId,
      livemode: true,
      status: 'active',
      cancel_at_period_end: false,
      cancel_at: periodEnd,
      start_date: periodStart,
      items: {
        data: [
          {
            price: { id: sku.stripe_price_id, unit_amount: 1_000, currency: 'usd' },
            current_period_start: periodStart,
            current_period_end: periodEnd,
          },
        ],
      },
    } as never)

    await ensureMembershipFromStripeSubscription(
      eventId,
      subscriptionId,
      customerId,
      applicationContext,
    )

    const membership = await getMembershipByStripeSubscriptionId(
      getStripeMembershipSourceIdentity({
        stripeSubscriptionId: subscriptionId,
        providerApplicationId: applicationContext.applicationId,
      }),
    )
    expect(membership).not.toBeNull()
    await expect(getTestMembershipSourceState(membership!.id)).resolves.toMatchObject({
      auto_renews: false,
    })
    await expect(getTestMembershipRaw(membership!.id)).resolves.toMatchObject({
      cancel_at_period_end: true,
    })
    expect(
      (await getMembershipHistory(user.id)).find(change => change.stripe_event_id === eventId),
    ).toMatchObject({
      membership_id: membership!.id,
      cancel_at_period_end: true,
      membership_provider_evidence_id: expect.stringMatching(/^[0-9a-f-]{36}$/),
    })
  })
})

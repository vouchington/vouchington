import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestSku, createTestUser, getTestMembershipRaw } from '@voucha/test-helpers'
import { makeStripeSubscriptionEvent } from '@voucha/test-helpers/services/stripe/membership-sync-event'
import { createMembership } from '@services/memberships'
import { getStripeMembershipSourceIdentity } from '@services/memberships/create-types'
import { insertStripeEvent } from '../insert-event.mts'

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

import { getStripeSubscription } from '@modules/stripe/subscriptions'
import { recoverConcurrentStripeMembershipSource } from './concurrent-source-recovery.mts'

const mockGetStripeSubscription = vi.mocked(getStripeSubscription)
const applicationContext = { applicationId: `stripe-concurrent-recovery-${randomUUID()}` }
const duplicateKeyError = () => Object.assign(new Error('duplicate'), { code: '23505' })

describe('recoverConcurrentStripeMembershipSource', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('synchronizes the newly created source in its application context', async () => {
    const member = await createTestUser()
    const currentSku = await createTestSku({
      plan: 'plus',
      provider_application_id: applicationContext.applicationId,
    })
    const syncedSku = await createTestSku({
      plan: 'pro',
      provider_application_id: applicationContext.applicationId,
    })
    const subscriptionId = `sub_concurrent_recovery_${member.id}`
    const eventId = `evt_concurrent_recovery_${member.id}`
    const syncedExpiresAt = new Date('2030-01-02T00:00:00.000Z')
    const membership = await createMembership({
      userId: member.id,
      plan: 'plus',
      skuId: currentSku.id,
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
      stripeSubscriptionId: subscriptionId,
      stripeCustomerId: `cus_concurrent_recovery_${member.id}`,
      providerApplicationId: applicationContext.applicationId,
    })
    await insertStripeEvent(makeStripeSubscriptionEvent(eventId, subscriptionId))
    mockGetStripeSubscription.mockResolvedValue({
      id: subscriptionId,
      livemode: true,
      status: 'active',
      cancel_at_period_end: false,
      items: {
        data: [
          {
            price: { id: syncedSku.stripe_price_id, unit_amount: 1_000, currency: 'usd' },
            current_period_end: Math.floor(syncedExpiresAt.getTime() / 1000),
          },
        ],
      },
    } as never)

    await expect(
      recoverConcurrentStripeMembershipSource(duplicateKeyError(), {
        eventId,
        subscriptionId,
        sourceIdentity: getStripeMembershipSourceIdentity({
          stripeSubscriptionId: subscriptionId,
          providerApplicationId: applicationContext.applicationId,
        }),
        applicationContext,
      }),
    ).resolves.toBe(true)

    expect(mockGetStripeSubscription).toHaveBeenCalledWith(subscriptionId)
    await expect(getTestMembershipRaw(membership.id)).resolves.toMatchObject({
      plan: 'pro',
      sku_id: syncedSku.id,
      stripe_subscription_id: subscriptionId,
      expires_at: syncedExpiresAt,
    })
  })

  it('leaves unrelated and unresolved errors to the caller', async () => {
    const subscriptionId = `sub_concurrent_recovery_unresolved_${randomUUID()}`
    const options = {
      eventId: `evt_concurrent_recovery_unresolved_${randomUUID()}`,
      subscriptionId,
      sourceIdentity: getStripeMembershipSourceIdentity({
        stripeSubscriptionId: subscriptionId,
        providerApplicationId: applicationContext.applicationId,
      }),
      applicationContext,
    }

    await expect(
      recoverConcurrentStripeMembershipSource(new Error('other'), options),
    ).resolves.toBe(false)
    await expect(
      recoverConcurrentStripeMembershipSource(duplicateKeyError(), options),
    ).resolves.toBe(false)
    expect(mockGetStripeSubscription).not.toHaveBeenCalled()
  })
})

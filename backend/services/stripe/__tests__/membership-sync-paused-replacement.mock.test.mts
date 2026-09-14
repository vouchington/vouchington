import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestSku, createTestUser, getTestMembershipRaw } from '@voucha/test-helpers'
import {
  createMembership,
  getMembershipByStripeSubscriptionId,
  getMembershipByUserId,
  updateMembershipFromEvent,
} from '@services/memberships'
import { getStripeMembershipSourceIdentity } from '@services/memberships/create-types'
import { insertStripeEvent } from '../events.mts'
import { makeStripeSubscriptionEvent } from '../../../test-helpers/services/stripe/membership-sync-event.mts'

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
const applicationContext = { applicationId: `stripe-paused-replacement-${randomUUID()}` }

describe('paused Stripe membership coexistence', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('keeps an elapsed paused subscription while accepting a distinct Stripe subscription', async () => {
    const member = await createTestUser()
    const pausedSku = await createTestSku({
      plan: 'plus',
      provider_application_id: applicationContext.applicationId,
    })
    const elapsedMembership = await createMembership({
      userId: member.id,
      plan: 'plus',
      skuId: pausedSku.id,
      cancelAtPeriodEnd: true,
      effectiveAt: new Date('2019-01-01T00:00:00.000Z'),
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
      stripeSubscriptionId: `sub_paused_elapsed_${member.id}`,
      stripeCustomerId: `cus_paused_elapsed_${member.id}`,
      providerApplicationId: applicationContext.applicationId,
    })
    await updateMembershipFromEvent(
      {
        membershipId: elapsedMembership.id,
        status: 'paused',
        expiresAt: new Date('2020-01-01T00:00:00.000Z'),
      },
      async () => {},
    )
    const stripeSku = await createTestSku({
      plan: 'pro',
      provider_application_id: applicationContext.applicationId,
    })
    const subscriptionId = `sub_replacement_${member.id}`
    const customerId = `cus_replacement_${member.id}`
    const eventId = `evt_paused_elapsed_${member.id}`
    await insertStripeEvent(makeStripeSubscriptionEvent(eventId, subscriptionId))

    mockGetStripeCustomer.mockResolvedValue({ metadata: { userId: member.id } } as never)
    mockGetStripeSubscription.mockResolvedValue({
      id: subscriptionId,
      livemode: true,
      status: 'active',
      cancel_at_period_end: false,
      items: {
        data: [
          {
            price: { id: stripeSku.stripe_price_id, unit_amount: 1_000, currency: 'usd' },
            current_period_end: 1_893_456_000,
          },
        ],
      },
    } as never)

    await expect(getMembershipByUserId(member.id)).resolves.toMatchObject({
      id: elapsedMembership.id,
      status: 'paused',
    })
    await expect(getTestMembershipRaw(elapsedMembership.id)).resolves.toMatchObject({
      source_expires_at: new Date('2020-01-01T00:00:00.000Z'),
      source_expired_at: null,
      source_paused_at: expect.any(Date),
    })

    await ensureMembershipFromStripeSubscription(
      eventId,
      subscriptionId,
      customerId,
      applicationContext,
    )

    await expect(getTestMembershipRaw(elapsedMembership.id)).resolves.toMatchObject({
      projection_ended_at: expect.any(Date),
      cancelled_at: null,
      expired_at: null,
      past_due_at: null,
      paused_at: expect.any(Date),
      cancel_at_period_end: true,
      source_expires_at: new Date('2020-01-01T00:00:00.000Z'),
      source_expired_at: null,
      source_paused_at: expect.any(Date),
    })
    await expect(
      getMembershipByStripeSubscriptionId(
        getStripeMembershipSourceIdentity({
          stripeSubscriptionId: subscriptionId,
          providerApplicationId: applicationContext.applicationId,
        }),
      ),
    ).resolves.toMatchObject({ user_id: member.id, plan: 'pro', status: 'active' })
  })

  it('keeps an elapsed unpaused direct term provider-authoritative', async () => {
    const member = await createTestUser()
    const currentSku = await createTestSku({
      plan: 'plus',
      provider_application_id: applicationContext.applicationId,
    })
    const currentSubscriptionId = `sub_elapsed_unpaused_${member.id}`
    await createMembership({
      userId: member.id,
      plan: 'plus',
      skuId: currentSku.id,
      expiresAt: new Date('2020-01-01T00:00:00.000Z'),
      stripeSubscriptionId: currentSubscriptionId,
      stripeCustomerId: `cus_elapsed_unpaused_${member.id}`,
      providerApplicationId: applicationContext.applicationId,
    })
    const replacementSku = await createTestSku({
      plan: 'pro',
      provider_application_id: applicationContext.applicationId,
    })
    const replacementSubscriptionId = `sub_unpaused_replacement_${member.id}`

    mockGetStripeCustomer.mockResolvedValue({ metadata: { userId: member.id } } as never)
    mockGetStripeSubscription.mockResolvedValue({
      status: 'active',
      cancel_at_period_end: false,
      items: {
        data: [
          {
            price: { id: replacementSku.stripe_price_id },
            current_period_end: 1_893_456_000,
          },
        ],
      },
    } as never)

    await ensureMembershipFromStripeSubscription(
      `evt_elapsed_unpaused_${member.id}`,
      replacementSubscriptionId,
      `cus_unpaused_replacement_${member.id}`,
      applicationContext,
    )

    await expect(
      getMembershipByStripeSubscriptionId(
        getStripeMembershipSourceIdentity({
          stripeSubscriptionId: currentSubscriptionId,
          providerApplicationId: applicationContext.applicationId,
        }),
      ),
    ).resolves.toMatchObject({ user_id: member.id, status: 'active' })
    await expect(
      getMembershipByStripeSubscriptionId(
        getStripeMembershipSourceIdentity({
          stripeSubscriptionId: replacementSubscriptionId,
          providerApplicationId: applicationContext.applicationId,
        }),
      ),
    ).resolves.toBeNull()
  })
})

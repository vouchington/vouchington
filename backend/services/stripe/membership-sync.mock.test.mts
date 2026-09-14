import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createTestSku,
  createTestUser,
  getTestMembershipRaw,
  updateTestMembershipExpiresAt,
} from '@voucha/test-helpers'
import {
  createMembership,
  getMembershipByStripeSubscriptionId,
  getMembershipHistory,
  grantMembership,
} from '@services/memberships'
import { getStripeMembershipSourceIdentity } from '@services/memberships/create-types'
import { insertStripeEvent } from './events.mts'
import { makeStripeSubscriptionEvent } from '../../test-helpers/services/stripe/membership-sync-event.mts'

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
import { ensureMembershipFromStripeSubscription } from './membership-sync.mts'

const mockGetStripeCustomer = vi.mocked(getStripeCustomer)
const mockGetStripeSubscription = vi.mocked(getStripeSubscription)
const applicationContext = { applicationId: `stripe-membership-sync-${randomUUID()}` }

async function createTestStripeSku(plan: 'plus' | 'pro') {
  return createTestSku({ plan, provider_application_id: applicationContext.applicationId })
}

describe('ensureMembershipFromStripeSubscription', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('keeps a non-elapsed membership unchanged when another subscription arrives', async () => {
    const member = await createTestUser()
    const currentSku = await createTestStripeSku('plus')
    const currentSubscriptionId = `sub_current_${member.id}`
    const currentCustomerId = `cus_current_${member.id}`
    const currentExpiresAt = new Date('2030-01-01T00:00:00.000Z')
    const currentMembership = await createMembership({
      userId: member.id,
      plan: 'plus',
      skuId: currentSku.id,
      expiresAt: currentExpiresAt,
      stripeSubscriptionId: currentSubscriptionId,
      stripeCustomerId: currentCustomerId,
      providerApplicationId: applicationContext.applicationId,
    })
    const incomingSku = await createTestStripeSku('pro')
    const incomingSubscriptionId = `sub_incoming_${member.id}`
    const incomingCustomerId = `cus_incoming_${member.id}`

    mockGetStripeCustomer.mockResolvedValue({ metadata: { userId: member.id } } as never)
    mockGetStripeSubscription.mockResolvedValue({
      status: 'active',
      cancel_at_period_end: false,
      items: {
        data: [
          {
            price: { id: incomingSku.stripe_price_id },
            current_period_end: 1_893_456_000,
          },
        ],
      },
    } as never)

    await ensureMembershipFromStripeSubscription(
      `evt_non_elapsed_existing_${member.id}`,
      incomingSubscriptionId,
      incomingCustomerId,
      applicationContext,
    )

    await expect(getTestMembershipRaw(currentMembership.id)).resolves.toMatchObject({
      plan: 'plus',
      sku_id: currentSku.id,
      stripe_subscription_id: currentSubscriptionId,
      stripe_customer_id: currentCustomerId,
      expires_at: currentExpiresAt,
      cancelled_at: null,
      expired_at: null,
      past_due_at: null,
      paused_at: null,
    })
    await expect(
      getMembershipByStripeSubscriptionId(
        getStripeMembershipSourceIdentity({
          stripeSubscriptionId: incomingSubscriptionId,
          providerApplicationId: applicationContext.applicationId,
        }),
      ),
    ).resolves.toBeNull()
  })

  it('synchronizes an existing matching subscription without creating a replacement', async () => {
    const member = await createTestUser()
    const currentSku = await createTestStripeSku('plus')
    const subscriptionId = `sub_existing_${member.id}`
    const customerId = `cus_existing_${member.id}`
    const existingMembership = await createMembership({
      userId: member.id,
      plan: 'plus',
      skuId: currentSku.id,
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
      stripeSubscriptionId: subscriptionId,
      stripeCustomerId: customerId,
      providerApplicationId: applicationContext.applicationId,
    })
    const syncedSku = await createTestStripeSku('pro')
    const syncedExpiresAt = new Date('2030-01-02T00:00:00.000Z')
    const eventId = `evt_duplicate_sync_${member.id}`
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
            price: { id: syncedSku.stripe_price_id, unit_amount: 1_000, currency: 'usd' },
            current_period_end: Math.floor(syncedExpiresAt.getTime() / 1000),
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

    expect(mockGetStripeCustomer).toHaveBeenCalledWith(customerId)
    expect(mockGetStripeSubscription).toHaveBeenCalledWith(subscriptionId)
    await expect(
      getMembershipByStripeSubscriptionId(
        getStripeMembershipSourceIdentity({
          stripeSubscriptionId: subscriptionId,
          providerApplicationId: applicationContext.applicationId,
        }),
      ),
    ).resolves.toMatchObject({
      id: existingMembership.id,
      plan: 'pro',
      sku: expect.objectContaining({ id: syncedSku.id }),
      status: 'active',
      expires_at: syncedExpiresAt,
    })
    await expect(getTestMembershipRaw(existingMembership.id)).resolves.toMatchObject({
      plan: 'pro',
      sku_id: syncedSku.id,
      stripe_subscription_id: subscriptionId,
      stripe_customer_id: customerId,
      cancelled_at: null,
      expired_at: null,
      past_due_at: null,
      paused_at: null,
    })
    expect(
      (await getMembershipHistory(member.id)).find(change => change.stripe_event_id === eventId),
    ).toMatchObject({
      membership_id: existingMembership.id,
      membership_provider_evidence_id: expect.stringMatching(/^[0-9a-f-]{36}$/),
    })
  })

  it('anchors initial creation atomically and retries without duplicating the audit row', async () => {
    const member = await createTestUser()
    const sku = await createTestStripeSku('plus')
    const subscriptionId = `sub_initial_anchor_${member.id}`
    const customerId = `cus_initial_anchor_${member.id}`
    const eventId = `evt_initial_anchor_${member.id}`
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
            price: { id: sku.stripe_price_id, unit_amount: 1_000, currency: 'usd' },
            current_period_end: 1_893_456_000,
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
    const initialChanges = (await getMembershipHistory(member.id)).filter(
      change => change.membership_id === membership!.id,
    )
    expect(initialChanges).toEqual([
      expect.objectContaining({
        change_type: 'renewal',
        stripe_event_id: eventId,
        membership_provider_evidence_id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      }),
    ])
  })

  it('replaces an elapsed grant with a new Stripe subscription', async () => {
    const admin = await createTestUser({ administrator: true })
    const member = await createTestUser()
    const grantSku = await createTestSku({ plan: 'plus' })
    const elapsedGrant = await grantMembership(admin.id, member.id, 'plus', grantSku.id, 30)
    await updateTestMembershipExpiresAt(elapsedGrant.id, new Date('2020-01-01T00:00:00Z'))
    const stripeSku = await createTestStripeSku('pro')
    const subscriptionId = `sub_elapsed_grant_${member.id}`
    const customerId = `cus_elapsed_grant_${member.id}`
    const eventId = `evt_elapsed_grant_${member.id}`
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

    await ensureMembershipFromStripeSubscription(
      eventId,
      subscriptionId,
      customerId,
      applicationContext,
    )

    await expect(getTestMembershipRaw(elapsedGrant.id)).resolves.toMatchObject({
      expired_at: expect.any(Date),
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
})

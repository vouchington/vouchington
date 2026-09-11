import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createTestFamilyMembership,
  createTestSku,
  createTestUser,
  getTestMembershipRaw,
  updateTestMembershipExpiresAt,
} from '@voucha/test-helpers'
import {
  createMembership,
  getMembershipByStripeSubscriptionId,
  getMembershipByUserId,
  grantMembership,
} from '@services/memberships'
import { getStripeMembershipSourceIdentity } from '@services/memberships/create-types'

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
const applicationContext = { applicationId: `stripe-ineligible-${randomUUID()}` }

describe('ineligible Stripe membership synchronization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it.each(['canceled', 'incomplete_expired', 'paused'] as const)(
    'preserves active family access when a delayed %s higher-tier subscription arrives',
    async stripeStatus => {
      const user = await createTestUser()
      const familySku = await createTestSku({
        plan: 'plus',
        provider_application_id: `family-ineligible-${randomUUID()}`,
      })
      const family = await createTestFamilyMembership({
        applicationId: familySku.provider_application_id,
        expiresAt: new Date('2030-01-01T00:00:00.000Z'),
        membershipProductId: familySku.id,
        membershipProviderProductId: familySku.membership_provider_product_id,
        userId: user.id,
      })
      const directSku = await createTestSku({
        plan: 'pro',
        provider_application_id: applicationContext.applicationId,
      })
      const subscriptionId = `sub_ineligible_${stripeStatus}_${randomUUID()}`

      mockGetStripeCustomer.mockResolvedValue({ metadata: { userId: user.id } } as never)
      mockGetStripeSubscription.mockResolvedValue({
        status: stripeStatus,
        cancel_at_period_end: false,
        items: { data: [{ price: { id: directSku.stripe_price_id } }] },
      } as never)

      await ensureMembershipFromStripeSubscription(
        `evt_ineligible_${stripeStatus}_${randomUUID()}`,
        subscriptionId,
        `cus_ineligible_${randomUUID()}`,
        applicationContext,
      )

      await expect(getMembershipByUserId(user.id)).resolves.toMatchObject({ id: family.id })
      await expect(getTestMembershipRaw(family.id)).resolves.toMatchObject({
        projection_ended_at: null,
      })
      await expect(
        getMembershipByStripeSubscriptionId(
          getStripeMembershipSourceIdentity({
            stripeSubscriptionId: subscriptionId,
            providerApplicationId: applicationContext.applicationId,
          }),
        ),
      ).resolves.toBeNull()
    },
  )

  it('keeps a provider-authoritative direct term current after its local period end', async () => {
    const user = await createTestUser()
    const currentSku = await createTestSku({
      plan: 'plus',
      provider_application_id: applicationContext.applicationId,
    })
    const currentSubscriptionId = `sub_current_stale_${randomUUID()}`
    const current = await createMembership({
      userId: user.id,
      plan: 'plus',
      skuId: currentSku.id,
      stripeSubscriptionId: currentSubscriptionId,
      providerApplicationId: applicationContext.applicationId,
    })
    await updateTestMembershipExpiresAt(current.id, new Date('2020-01-01T00:00:00.000Z'))

    const incomingSku = await createTestSku({
      plan: 'pro',
      provider_application_id: applicationContext.applicationId,
    })
    const incomingSubscriptionId = `sub_competing_stale_${randomUUID()}`
    mockGetStripeCustomer.mockResolvedValue({ metadata: { userId: user.id } } as never)
    mockGetStripeSubscription.mockResolvedValue({
      status: 'active',
      cancel_at_period_end: false,
      items: { data: [{ price: { id: incomingSku.stripe_price_id } }] },
    } as never)

    await expect(
      ensureMembershipFromStripeSubscription(
        `evt_competing_stale_${randomUUID()}`,
        incomingSubscriptionId,
        `cus_competing_stale_${randomUUID()}`,
        applicationContext,
      ),
    ).resolves.toBeUndefined()
    await expect(
      getMembershipByStripeSubscriptionId(
        getStripeMembershipSourceIdentity({
          stripeSubscriptionId: currentSubscriptionId,
          providerApplicationId: applicationContext.applicationId,
        }),
      ),
    ).resolves.toMatchObject({ id: current.id })
    await expect(
      getMembershipByStripeSubscriptionId(
        getStripeMembershipSourceIdentity({
          stripeSubscriptionId: incomingSubscriptionId,
          providerApplicationId: applicationContext.applicationId,
        }),
      ),
    ).resolves.toBeNull()
  })

  it.each(['plus', 'pro'] as const)(
    'does not replace a live Pro grant with a %s direct term',
    async incomingPlan => {
      const admin = await createTestUser({ administrator: true })
      const member = await createTestUser()
      const grantSku = await createTestSku({ plan: 'pro' })
      const grant = await grantMembership(admin.id, member.id, 'pro', grantSku.id, 30)
      const directSku = await createTestSku({
        plan: incomingPlan,
        provider_application_id: applicationContext.applicationId,
      })
      const subscriptionId = `sub_ineligible_grant_${incomingPlan}_${member.id}`
      mockGetStripeCustomer.mockResolvedValue({ metadata: { userId: member.id } } as never)
      mockGetStripeSubscription.mockResolvedValue({
        status: 'active',
        cancel_at_period_end: false,
        items: { data: [{ price: { id: directSku.stripe_price_id } }] },
      } as never)

      await ensureMembershipFromStripeSubscription(
        `evt_ineligible_grant_${incomingPlan}_${member.id}`,
        subscriptionId,
        `cus_ineligible_grant_${incomingPlan}_${member.id}`,
        applicationContext,
      )

      await expect(getMembershipByUserId(member.id)).resolves.toMatchObject({
        id: grant.id,
        plan: 'pro',
        status: 'active',
      })
      await expect(
        getMembershipByStripeSubscriptionId(
          getStripeMembershipSourceIdentity({
            stripeSubscriptionId: subscriptionId,
            providerApplicationId: applicationContext.applicationId,
          }),
        ),
      ).resolves.toBeNull()
    },
  )
})

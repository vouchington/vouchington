import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import type { PrivateUser } from '@voucha/types/entities/user'
import {
  createTestFamilyMembership,
  createTestUser,
  createTestMembership,
  createTestSku,
  createRetiredTestSku,
  rejectTestMembershipProviderEvidence,
  updateTestMembershipExpiresAt,
} from '@voucha/test-helpers'
import { STRIPE_PROVIDER_ENVIRONMENT } from '@voucha/config'
import {
  getMembershipByUserId,
  getUserActiveMembership,
  getUserActivePlan,
  getMembershipByStripeSubscriptionId,
  getMembershipHistory,
  getActivePlans,
  getSkuByStripePriceId,
} from './get.mts'
import { recordMembershipChange } from './changes.mts'
import { getStripeMembershipSourceIdentity } from './create-types.mts'

describe('get', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })
  describe('getMembershipByUserId', () => {
    it('returns null when user has no membership', async () => {
      const result = await getMembershipByUserId(user.id)
      expect(result).toBeNull()
    })

    it('returns active membership', async () => {
      await createTestMembership({
        user_id: user.id,
        stripe_subscription_id: `sub_auto_context_${randomUUID()}`,
      })
      const result = await getMembershipByUserId(user.id)
      expect(result).not.toBeNull()
      expect(result!.user_id).toBe(user.id)
      expect(result!.status).toBe('active')
      expect(result!.__entity_type).toBe('membership')
      expect(result!.sku).toBeDefined()
      expect(result!.sku.plan).toBe('plus')
      expect(result!.sku.price).not.toBeNull()
    })

    it('returns paused membership', async () => {
      const pausedUser = await createTestUser()
      await createTestMembership({ user_id: pausedUser.id, status: 'paused' })

      const result = await getMembershipByUserId(pausedUser.id)

      expect(result).not.toBeNull()
      expect(result!.status).toBe('paused')
      expect(result!.paused_at).toBeInstanceOf(Date)
      await expect(getUserActivePlan(pausedUser.id)).resolves.toBeNull()
    })

    it('returns past-due membership with derived status', async () => {
      const pastDueUser = await createTestUser()
      await createTestMembership({ user_id: pastDueUser.id, status: 'past_due' })

      const result = await getMembershipByUserId(pastDueUser.id)

      expect(result).not.toBeNull()
      expect(result!.status).toBe('past_due')
      expect(result!.past_due_at).toBeInstanceOf(Date)
      await expect(getUserActivePlan(pastDueUser.id)).resolves.toBe('plus')
    })

    it('excludes terminal memberships', async () => {
      const cancelledUser = await createTestUser()
      await createTestMembership({ user_id: cancelledUser.id, status: 'cancelled' })
      const expiredUser = await createTestUser()
      await createTestMembership({ user_id: expiredUser.id, status: 'expired' })

      await expect(getMembershipByUserId(cancelledUser.id)).resolves.toBeNull()
      await expect(getMembershipByUserId(expiredUser.id)).resolves.toBeNull()
    })

    it('treats a time-lapsed grant as expired without waiting for a lifecycle update', async () => {
      const lapsedUser = await createTestUser()
      const membership = await createTestMembership({ user_id: lapsedUser.id })
      await updateTestMembershipExpiresAt(membership.id, new Date(Date.now() - 60_000))

      await expect(getMembershipByUserId(lapsedUser.id)).resolves.toBeNull()
      await expect(getUserActivePlan(lapsedUser.id)).resolves.toBeNull()
    })

    it('keeps a Stripe subscription manageable when its prior period end has elapsed', async () => {
      const stripeUser = await createTestUser()
      const membership = await createTestMembership({
        user_id: stripeUser.id,
        stripe_subscription_id: `sub_lapsed_${Date.now()}`,
      })
      await updateTestMembershipExpiresAt(membership.id, new Date(Date.now() - 60_000))
      await expect(getMembershipByUserId(stripeUser.id)).resolves.toMatchObject({
        status: 'active',
      })
      await expect(getUserActiveMembership(stripeUser.id)).resolves.toEqual({
        plan: 'plus',
        expires_at: null,
      })
    })

    it('keeps an elapsed paused Stripe subscription paused', async () => {
      const stripeUser = await createTestUser()
      const membership = await createTestMembership({
        user_id: stripeUser.id,
        status: 'paused',
        stripe_subscription_id: `sub_paused_lapsed_${Date.now()}`,
      })
      await updateTestMembershipExpiresAt(membership.id, new Date(Date.now() - 60_000))
      await expect(getMembershipByUserId(stripeUser.id)).resolves.toMatchObject({
        status: 'paused',
      })
    })

    it.each(['cancelled', 'expired', 'past_due', 'paused'] as const)(
      'does not authorize a live family projection with a %s source state',
      async sourceStatus => {
        const familyUser = await createTestUser()
        const familySku = await createTestSku({
          plan: 'plus',
          provider_application_id: `family-get-${sourceStatus}-${randomUUID()}`,
        })
        await createTestFamilyMembership({
          applicationId: familySku.provider_application_id,
          expiresAt: new Date('2030-01-01T00:00:00.000Z'),
          membershipProductId: familySku.id,
          membershipProviderProductId: familySku.membership_provider_product_id,
          sourceStatus,
          userId: familyUser.id,
        })

        await expect(getUserActiveMembership(familyUser.id)).resolves.toBeNull()
      },
    )

    it('does not authorize a future or rejected family source', async () => {
      const futureUser = await createTestUser()
      const futureSku = await createTestSku({
        plan: 'plus',
        provider_application_id: `family-get-future-${randomUUID()}`,
      })
      await createTestFamilyMembership({
        applicationId: futureSku.provider_application_id,
        effectiveAt: new Date(),
        expiresAt: new Date('2031-01-01T00:00:00.000Z'),
        membershipProductId: futureSku.id,
        membershipProviderProductId: futureSku.membership_provider_product_id,
        sourceEffectiveAt: new Date('2030-01-01T00:00:00.000Z'),
        userId: futureUser.id,
      })

      const rejectedUser = await createTestUser()
      const rejectedSku = await createTestSku({
        plan: 'plus',
        provider_application_id: `family-get-rejected-${randomUUID()}`,
      })
      const rejectedFamily = await createTestFamilyMembership({
        applicationId: rejectedSku.provider_application_id,
        expiresAt: new Date('2030-01-01T00:00:00.000Z'),
        membershipProductId: rejectedSku.id,
        membershipProviderProductId: rejectedSku.membership_provider_product_id,
        userId: rejectedUser.id,
      })
      await rejectTestMembershipProviderEvidence(rejectedFamily.id)

      await expect(getUserActiveMembership(futureUser.id)).resolves.toBeNull()
      await expect(getUserActiveMembership(rejectedUser.id)).resolves.toBeNull()
    })
  })

  describe('getMembershipByStripeSubscriptionId', () => {
    it('returns null for unknown subscription id', async () => {
      const result = await getMembershipByStripeSubscriptionId(
        getStripeMembershipSourceIdentity({ stripeSubscriptionId: 'sub_nonexistent' }),
      )
      expect(result).toBeNull()
    })

    it('returns membership for valid subscription id', async () => {
      const subUser = await createTestUser()
      const subId = `sub_test_${Date.now()}`
      const applicationId = `subscription-lookup-${randomUUID()}`
      const sku = await createTestSku({ provider_application_id: applicationId })
      await createTestMembership({
        user_id: subUser.id,
        sku_id: sku.id,
        stripe_subscription_id: subId,
        provider_application_id: applicationId,
      })
      const result = await getMembershipByStripeSubscriptionId(
        getStripeMembershipSourceIdentity({
          stripeSubscriptionId: subId,
          providerEnvironment: 'test',
          providerApplicationId: applicationId,
        }),
      )
      expect(result).not.toBeNull()
      expect(result!.user_id).toBe(subUser.id)
      expect(result!.stripe_subscription_id).toBe(subId)
      expect(result!.__entity_type).toBe('membership')
    })
  })

  describe('getMembershipHistory', () => {
    it('returns empty array for user with no history', async () => {
      const noHistoryUser = await createTestUser()
      const result = await getMembershipHistory(noHistoryUser.id)
      expect(result).toEqual([])
    })

    it('returns changes after recording one', async () => {
      const histUser = await createTestUser()
      const membership = await createTestMembership({ user_id: histUser.id })
      await recordMembershipChange({
        membershipId: membership.id,
        userId: histUser.id,
        changeType: 'admin_grant',
        toSkuId: membership.sku_id,
      })
      const result = await getMembershipHistory(histUser.id)
      expect(result.length).toBeGreaterThanOrEqual(1)
      expect(result[0]!.membership_id).toBe(membership.id)
      expect(result[0]!.user_id).toBe(histUser.id)
      expect(result[0]!.change_type).toBe('admin_grant')
      expect(result[0]!.to_plan).toBe('plus')
      expect(result[0]!.cancel_at_period_end).toBe(false)
    })
  })

  describe('getActivePlans', () => {
    it('returns plans grouped by slug', async () => {
      const plans = await getActivePlans()
      expect(plans).toBeInstanceOf(Map)
    })

    it('excludes retired SKUs', async () => {
      const applicationId = `retired-catalog-${randomUUID()}`
      const retiredSku = await createRetiredTestSku({
        plan: 'plus',
        stripe_price_id: `price_retired_${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        provider_environment: STRIPE_PROVIDER_ENVIRONMENT,
        provider_application_id: applicationId,
      })

      const plans = await getActivePlans({
        applicationId,
        environment: STRIPE_PROVIDER_ENVIRONMENT,
      })
      const plusSkus = plans.get('plus') ?? []
      const retiredIds = plusSkus.map(s => s.id)
      expect(retiredIds).not.toContain(retiredSku.id)
    })
  })

  describe('getSkuByStripePriceId', () => {
    it('returns sku for valid stripe price id', async () => {
      const priceId = `price_test_lookup_${Math.random().toString(36).slice(2, 8)}`
      const applicationId = `sku-lookup-${randomUUID()}`
      const sku = await createTestSku({
        stripe_price_id: priceId,
        provider_environment: STRIPE_PROVIDER_ENVIRONMENT,
        provider_application_id: applicationId,
      })
      const result = await getSkuByStripePriceId(priceId, {
        applicationId,
        environment: STRIPE_PROVIDER_ENVIRONMENT,
      })
      expect(result).not.toBeNull()
      expect(result!.id).toBe(sku.id)
    })

    it('returns null for unknown stripe price id', async () => {
      const result = await getSkuByStripePriceId('price_nonexistent')
      expect(result).toBeNull()
    })
  })
})

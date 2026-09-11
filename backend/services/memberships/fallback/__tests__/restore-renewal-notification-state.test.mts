import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  attachTestStripeProductionProviderObservation,
  createTestSku,
  createTestUser,
  endTestMembershipProjection,
  updateTestMembershipExpiresAt,
} from '@voucha/test-helpers'
import { createMembership, grantMembership } from '../../create.mts'
import { getMembershipByUserId } from '../../get.mts'
import { expireElapsedMembershipsForUser } from '../../grants/expire-elapsed.mts'
import {
  claimRenewalPriceIncreaseNotification,
  getUsersApproachingRenewalWithPriceIncrease,
} from '../../renewal-check.mts'
import { getCurrentRenewalPriceIncreaseDetails } from '../../renewal-price-increase-details.mts'
import {
  markRenewalPriceIncreaseNotificationDelivered,
  markRenewalPriceIncreaseNotificationDeliveryAttempted,
  releaseRenewalPriceIncreaseNotification,
} from '../../renewal-notification-delivery.mts'

describe('direct fallback renewal notification state', () => {
  async function createRetainedDirectRenewal() {
    const admin = await createTestUser({ administrator: true })
    const user = await createTestUser()
    const applicationId = `direct-renewal-fallback-${randomUUID()}`
    const directSku = await createTestSku({
      interval: 'monthly',
      plan: 'plus',
      price_minor_units: 500,
      provider_application_id: applicationId,
    })
    const renewalSku = await createTestSku({
      interval: 'monthly',
      plan: 'plus',
      price_minor_units: 800,
      provider_application_id: applicationId,
    })
    const expiresAt = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000)
    const direct = await createMembership({
      userId: user.id,
      plan: 'plus',
      skuId: directSku.id,
      expiresAt,
      stripeSubscriptionId: `sub_direct_renewal_fallback_${randomUUID()}`,
      providerApplicationId: applicationId,
      providerEnvironment: 'production',
    })
    const observation = await attachTestStripeProductionProviderObservation({
      membership_id: direct.id,
      membership_provider_product_id: directSku.membership_provider_product_id,
      renewal_membership_provider_product_id: renewalSku.membership_provider_product_id,
      renewal_effective_at: expiresAt,
    })
    const claimToken = await claimRenewalPriceIncreaseNotification(
      direct.id,
      user.id,
      observation.membership_provider_observation_id,
    )
    expect(claimToken).toEqual(expect.any(String))

    async function restore() {
      await endTestMembershipProjection(direct.id)
      const grantSku = await createTestSku({ plan: 'pro', interval: 'yearly' })
      const grant = await grantMembership(admin.id, user.id, 'pro', grantSku.id, 30)
      expect(grant.queued).toBe(false)
      await updateTestMembershipExpiresAt(grant.id, new Date('2020-01-01T00:00:00.000Z'))
      await expect(expireElapsedMembershipsForUser(user.id)).resolves.toBe(1)
      const restored = await getMembershipByUserId(user.id)
      expect(restored).toMatchObject({ plan: 'plus', status: 'active' })
      return restored!
    }

    return { claimToken: claimToken!, direct, observation, restore, user }
  }

  it('preserves delivered notifications across reprojection', async () => {
    const renewal = await createRetainedDirectRenewal()
    await expect(
      markRenewalPriceIncreaseNotificationDeliveryAttempted(
        renewal.direct.id,
        renewal.user.id,
        renewal.observation.membership_provider_observation_id,
        renewal.claimToken,
      ),
    ).resolves.toBe(true)
    await expect(
      markRenewalPriceIncreaseNotificationDelivered(
        renewal.direct.id,
        renewal.user.id,
        renewal.observation.membership_provider_observation_id,
        renewal.claimToken,
      ),
    ).resolves.toBe(true)
    await renewal.restore()
    await expect(getUsersApproachingRenewalWithPriceIncrease()).resolves.not.toEqual(
      expect.arrayContaining([expect.objectContaining({ user_id: renewal.user.id })]),
    )
  })

  it('moves unattempted claims across reprojection without duplicating their token', async () => {
    const renewal = await createRetainedDirectRenewal()
    const restored = await renewal.restore()
    await expect(
      getCurrentRenewalPriceIncreaseDetails(
        restored.id,
        renewal.user.id,
        renewal.observation.membership_provider_observation_id,
        renewal.claimToken,
      ),
    ).resolves.toMatchObject({ new_price: { amount: 800, currency: 'usd' } })
    await expect(
      getCurrentRenewalPriceIncreaseDetails(
        renewal.direct.id,
        renewal.user.id,
        renewal.observation.membership_provider_observation_id,
        renewal.claimToken,
      ),
    ).resolves.toMatchObject({ new_price: { amount: 800, currency: 'usd' } })
    await expect(getUsersApproachingRenewalWithPriceIncrease()).resolves.not.toEqual(
      expect.arrayContaining([expect.objectContaining({ user_id: renewal.user.id })]),
    )
    await expect(
      claimRenewalPriceIncreaseNotification(
        restored.id,
        renewal.user.id,
        renewal.observation.membership_provider_observation_id,
      ),
    ).resolves.toBeNull()
  })

  it('releases an unattempted claim through its retired projection', async () => {
    const renewal = await createRetainedDirectRenewal()
    await renewal.restore()

    await releaseRenewalPriceIncreaseNotification(
      renewal.direct.id,
      renewal.user.id,
      renewal.observation.membership_provider_observation_id,
      renewal.claimToken,
    )

    await expect(getUsersApproachingRenewalWithPriceIncrease()).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ user_id: renewal.user.id })]),
    )
  })

  it('completes an in-flight delivery through its retired projection', async () => {
    const renewal = await createRetainedDirectRenewal()
    await expect(
      markRenewalPriceIncreaseNotificationDeliveryAttempted(
        renewal.direct.id,
        renewal.user.id,
        renewal.observation.membership_provider_observation_id,
        renewal.claimToken,
      ),
    ).resolves.toBe(true)

    await renewal.restore()

    await expect(
      markRenewalPriceIncreaseNotificationDelivered(
        renewal.direct.id,
        renewal.user.id,
        renewal.observation.membership_provider_observation_id,
        renewal.claimToken,
      ),
    ).resolves.toBe(true)
    await expect(getUsersApproachingRenewalWithPriceIncrease()).resolves.not.toEqual(
      expect.arrayContaining([expect.objectContaining({ user_id: renewal.user.id })]),
    )
  })
})

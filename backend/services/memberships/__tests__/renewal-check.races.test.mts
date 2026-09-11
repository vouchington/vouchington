import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  attachTestStripeProductionProviderObservation,
  createTestSku,
  createTestUser,
  updateTestMembershipCancelAtPeriodEnd,
} from '@voucha/test-helpers'
import { createMembership } from '../create.mts'
import { claimRenewalPriceIncreaseNotification } from '../renewal-check.mts'
import {
  markRenewalPriceIncreaseNotificationDeliveryAttempted,
  releaseRenewalPriceIncreaseNotification,
} from '../renewal-notification-delivery.mts'

async function createRenewal() {
  const applicationId = `renewal-race-${randomUUID()}`
  const currentSku = await createTestSku({
    plan: 'plus',
    interval: 'monthly',
    price_minor_units: 500,
    provider_application_id: applicationId,
  })
  const renewalSku = await createTestSku({
    plan: 'plus',
    interval: 'monthly',
    price_minor_units: 800,
    provider_application_id: applicationId,
  })
  const user = await createTestUser()
  const expiresAt = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000)
  const stripeSubscriptionId = `sub_renewal_race_${randomUUID()}`
  const membership = await createMembership({
    userId: user.id,
    plan: 'plus',
    skuId: currentSku.id,
    expiresAt,
    stripeSubscriptionId,
    providerEnvironment: 'production',
    providerApplicationId: applicationId,
  })
  const observation = await attachTestStripeProductionProviderObservation({
    membership_id: membership.id,
    membership_provider_product_id: currentSku.membership_provider_product_id,
    renewal_membership_provider_product_id: renewalSku.membership_provider_product_id,
    renewal_effective_at: expiresAt,
  })
  return {
    applicationId,
    currentSku,
    expiresAt,
    membership,
    observation,
    stripeSubscriptionId,
    user,
  }
}

describe('renewal notification races', () => {
  it('rejects and releases a claim cancelled before its delivery attempt', async () => {
    const { membership, observation, user } = await createRenewal()
    const claimToken = await claimRenewalPriceIncreaseNotification(
      membership.id,
      user.id,
      observation.membership_provider_observation_id,
    )
    expect(claimToken).toEqual(expect.any(String))
    await updateTestMembershipCancelAtPeriodEnd(membership.id, true)

    await expect(
      markRenewalPriceIncreaseNotificationDeliveryAttempted(
        membership.id,
        user.id,
        observation.membership_provider_observation_id,
        claimToken!,
      ),
    ).resolves.toBe(false)
    await releaseRenewalPriceIncreaseNotification(
      membership.id,
      user.id,
      observation.membership_provider_observation_id,
      claimToken!,
    )
    await expect(
      claimRenewalPriceIncreaseNotification(
        membership.id,
        user.id,
        observation.membership_provider_observation_id,
      ),
    ).resolves.toBeNull()
  })
})

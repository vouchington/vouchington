import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  attachTestStripeProductionProviderObservation,
  createTestFamilyMembership,
  createTestSku,
  createTestUser,
  endTestMembershipProjection,
  updateTestMembershipExpiresAt,
} from '@voucha/test-helpers'
import { createMembership, grantMembership } from '../../create.mts'
import { expireElapsedMembershipsForUser } from '../../grants/expire-elapsed.mts'
import { getMembershipByUserId } from '../../get.mts'
import { claimRenewalPriceIncreaseNotification } from '../../renewal-check.mts'
import {
  markRenewalPriceIncreaseNotificationDelivered,
  markRenewalPriceIncreaseNotificationDeliveryAttempted,
  releaseRenewalPriceIncreaseNotification,
} from '../../renewal-notification-delivery.mts'
import { getCurrentRenewalPriceIncreaseDetails } from '../../renewal-price-increase-details.mts'

async function createRetiredClaimOwner() {
  const applicationId = `renewal-history-${randomUUID()}`
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
  const admin = await createTestUser({ administrator: true })
  const user = await createTestUser()
  const expiresAt = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000)
  const stripeSubscriptionId = `sub_renewal_history_${randomUUID()}`
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
  const claimToken = await claimRenewalPriceIncreaseNotification(
    membership.id,
    user.id,
    observation.membership_provider_observation_id,
  )
  expect(claimToken).toEqual(expect.any(String))

  await endTestMembershipProjection(membership.id)
  const grantSku = await createTestSku({ plan: 'pro', interval: 'yearly' })
  const firstGrant = await grantMembership(admin.id, user.id, 'pro', grantSku.id, 30)
  expect(firstGrant.queued).toBe(false)
  await updateTestMembershipExpiresAt(firstGrant.id, new Date('2020-01-01T00:00:00.000Z'))
  await expect(expireElapsedMembershipsForUser(user.id)).resolves.toBe(1)
  const restored = await getMembershipByUserId(user.id)
  expect(restored).toMatchObject({ plan: 'plus', status: 'active' })
  await endTestMembershipProjection(restored!.id)
  const replacementSku = await createTestSku({
    interval: 'monthly',
    plan: 'pro',
    price_minor_units: 1000,
    provider_application_id: applicationId,
  })
  await createTestFamilyMembership({
    applicationId,
    effectiveAt: new Date(Date.now() + 1000),
    expiresAt,
    membershipProductId: replacementSku.id,
    membershipProviderProductId: replacementSku.membership_provider_product_id,
    userId: user.id,
  })
  return { claimToken: claimToken!, expiresAt, membership, observation, user }
}

describe('renewal notification projection history', () => {
  it('delivers an unattempted claim after its owner is superseded twice', async () => {
    const { claimToken, expiresAt, membership, observation, user } = await createRetiredClaimOwner()

    await expect(
      getCurrentRenewalPriceIncreaseDetails(
        membership.id,
        user.id,
        observation.membership_provider_observation_id,
        claimToken,
      ),
    ).resolves.toMatchObject({
      current_price: { amount: 500, currency: 'usd' },
      new_price: { amount: 800, currency: 'usd' },
      expires_at: expiresAt,
      interval: 'monthly',
      plan: 'plus',
    })
    await expect(
      markRenewalPriceIncreaseNotificationDeliveryAttempted(
        membership.id,
        user.id,
        observation.membership_provider_observation_id,
        claimToken,
      ),
    ).resolves.toBe(true)
    await expect(
      markRenewalPriceIncreaseNotificationDelivered(
        membership.id,
        user.id,
        observation.membership_provider_observation_id,
        claimToken,
      ),
    ).resolves.toBe(true)
  })

  it('releases an unattempted claim after its owner is superseded twice', async () => {
    const { claimToken, membership, observation, user } = await createRetiredClaimOwner()

    await releaseRenewalPriceIncreaseNotification(
      membership.id,
      user.id,
      observation.membership_provider_observation_id,
      claimToken,
    )
    await expect(
      getCurrentRenewalPriceIncreaseDetails(
        membership.id,
        user.id,
        observation.membership_provider_observation_id,
        claimToken,
      ),
    ).resolves.toBeNull()
  })
})
